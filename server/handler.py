"""WebSocket handler using ADK Runner.run_live() pattern.

Event processing follows the ADK official pattern for native audio models:
- Transcription via event.input_transcription / event.output_transcription
- Audio via event.content.parts[].inline_data
- Tool calls via event.get_function_calls() / event.get_function_responses()

Ref: https://google.github.io/adk-docs/streaming/dev-guide/part3/
"""

import asyncio
import base64
import json
import logging
import os
import re

from fastapi import WebSocket, WebSocketDisconnect
from google.adk.agents.live_request_queue import LiveRequestQueue
from google.adk.agents.run_config import RunConfig, StreamingMode
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from server.agent import create_agent, VOICE_NAMES
from server.config import Config
from server.tools.generate_image import set_session_context, approve_image, reject_image
from server.tools.generate_diary import set_diary_callback, approve_diary, reject_diary
from server.user_context import set_user_id, set_weather, set_lang
from server.weather import get_weather, weather_to_text

logger = logging.getLogger(__name__)

APP_NAME = "haru"
_session_counter = 0

MAX_RECONNECT_ATTEMPTS = 5


async def send_event(ws: WebSocket, event_type: str, data=None):
    try:
        await ws.send_json({"type": event_type, "data": data})
    except Exception as e:
        logger.error(f"[WS] Failed to send event: {e}")


async def handle_websocket(ws: WebSocket):
    global _session_counter
    await ws.accept()

    # Read persona + gender + lang from query params
    persona = ws.query_params.get("persona", "warm")
    gender = ws.query_params.get("gender", "female")
    lang = ws.query_params.get("lang", "ko")
    client_user_id = ws.query_params.get("uid", "")
    client_tz = ws.query_params.get("tz", "UTC")
    logger.info(f"[WS] Client connected (persona={persona}, gender={gender}, lang={lang}, uid={client_user_id}, tz={client_tz})")

    # Set user context for tools
    set_user_id(client_user_id)

    # Set timezone and language for correct timestamps and diary generation
    from server.user_context import set_timezone
    set_timezone(client_tz)
    set_lang(lang)

    # Fetch weather for this session
    weather = await get_weather(tz=client_tz, lang=lang)
    set_weather(weather)
    weather_text = weather_to_text(weather)

    # Per-session IDs
    _session_counter += 1
    user_id = "user"
    session_id = f"session-{_session_counter}"

    # Per-session runner with persona
    agent = await create_agent(persona=persona, gender=gender, lang=lang, tz=client_tz, user_id=client_user_id, weather_text=weather_text)
    session_service = InMemorySessionService()
    runner = Runner(app_name=APP_NAME, agent=agent, session_service=session_service)

    # Per-session photo store
    photo_store: dict = {}

    # Set up image generation callback
    async def on_image_generated(moment_id: int, image_url: str, moment: dict | None = None):
        await send_event(ws, "image_generated", {
            "moment_id": moment_id,
            "image_url": image_url,
            "moment": moment,
        })
        # Notify Gemini that image generation is done
        try:
            hint = types.Content(
                role="user",
                parts=[types.Part(text=
                    f"[System: Image for moment {moment_id} has been generated successfully. You can tell the user it's ready! Respond in {'Korean' if lang=='ko' else 'Japanese' if lang=='ja' else 'English'}.]"
                    if image_url else f"[System: Image generation for moment {moment_id} failed. Respond in {'Korean' if lang=='ko' else 'Japanese' if lang=='ja' else 'English'}.]"
                )],
            )
            queue_holder["queue"].send_content(hint)
        except Exception:
            pass

    set_session_context(photo_store, on_image_generated)

    async def on_diary_generated(diary_data):
        # Ensure all datetime fields are serialized to strings
        serialized = {k: (str(v) if hasattr(v, 'isoformat') else v) for k, v in diary_data.items()} if isinstance(diary_data, dict) else diary_data
        await send_event(ws, "diary_generated", serialized)
        # Notify Gemini that diary generation is done
        try:
            hint = types.Content(
                role="user",
                parts=[types.Part(text=
                    f"[System: Diary has been generated successfully and shown to the user! Respond in {'Korean' if lang=='ko' else 'Japanese' if lang=='ja' else 'English'}.]"
                )],
            )
            queue_holder["queue"].send_content(hint)
        except Exception:
            pass

    set_diary_callback(on_diary_generated)

    # Create session
    await session_service.create_session(
        app_name=APP_NAME, user_id=user_id, session_id=session_id
    )

    # RunConfig for native audio model
    voice_name = VOICE_NAMES.get((persona, gender), "Sulafat")
    logger.info(f"[WS] Using voice: {voice_name}")

    run_config = RunConfig(
        streaming_mode=StreamingMode.BIDI,
        response_modalities=["AUDIO"],
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(
                    voice_name=voice_name,
                )
            )
        ),
        input_audio_transcription=types.AudioTranscriptionConfig(),
        output_audio_transcription=types.AudioTranscriptionConfig(),
        session_resumption=types.SessionResumptionConfig(transparent=True),
        context_window_compression=types.ContextWindowCompressionConfig(
            trigger_tokens=100000,
            sliding_window=types.SlidingWindow(target_tokens=80000),
        ),
    )

    # Debug: record incoming audio (DEBUG_AUDIO only)
    debug_audio = open(f"logs/debug_audio_{session_id}.pcm", "wb") if Config.DEBUG_AUDIO else None

    # Shared mutable ref so upstream/downstream always use the same queue
    queue_holder: dict = {"queue": LiveRequestQueue()}

    async def upstream_task():
        """Browser → LiveRequestQueue"""
        try:
            while True:
                raw = await ws.receive_text()
                msg = json.loads(raw)
                msg_type = msg.get("type")
                data = msg.get("data", {})

                if msg_type == "audio_chunk":
                    audio_bytes = base64.b64decode(data.get("data", ""))
                    audio_blob = types.Blob(
                        mime_type="audio/pcm;rate=16000", data=audio_bytes
                    )
                    queue_holder["queue"].send_realtime(audio_blob)
                    # Debug: save raw audio
                    if debug_audio:
                        debug_audio.write(audio_bytes)

                elif msg_type == "text_input":
                    text = data.get("text", "")
                    if text:
                        logger.info(f"[WS] Text input: {text}")
                        content = types.Content(
                            parts=[types.Part(text=text)]
                        )
                        queue_holder["queue"].send_content(content)

                elif msg_type == "image_upload":
                    img_data = data.get("data", "")
                    img_mime = data.get("mime", "image/jpeg")
                    logger.info(f"[WS] Photo uploaded (mime: {img_mime})")
                    # Save to disk
                    import time as _t
                    ext = "webp" if "webp" in img_mime else "jpg"
                    photo_filename = f"photo_{int(_t.time())}_{client_user_id[:8]}.{ext}"
                    photo_path = os.path.join(Config.UPLOAD_DIR, photo_filename)
                    with open(photo_path, "wb") as f:
                        f.write(base64.b64decode(img_data))
                    photo_url = f"/uploads/{photo_filename}"
                    photo_store["latest"] = {"data": img_data, "mime": img_mime, "url": photo_url}
                    img_bytes = base64.b64decode(img_data)
                    image_blob = types.Blob(mime_type=img_mime, data=img_bytes)
                    queue_holder["queue"].send_realtime(image_blob)
                    # Send text hint so Gemini reacts to the photo in the correct language
                    lang_name = {"ko": "Korean", "en": "English", "ja": "Japanese"}.get(lang, "English")
                    hint = types.Content(
                        role="user",
                        parts=[types.Part(text=f"[User shared a photo. IMPORTANT: Respond in {lang_name}.]")],
                    )
                    queue_holder["queue"].send_content(hint)

                elif msg_type == "approve_image":
                    mid = data.get("moment_id")
                    if mid is not None:
                        logger.info(f"[WS] User approved image generation for moment {mid}")
                        await approve_image(mid)
                        queue_holder["queue"].send_content(types.Content(
                            role="user",
                            parts=[types.Part(text=f"[System: User approved image generation for moment {mid}. Generation STARTED but NOT finished yet. It takes about 30-60 seconds. Do NOT say it's done or ready. Respond in {'Korean' if lang=='ko' else 'Japanese' if lang=='ja' else 'English'}.]")],
                        ))

                elif msg_type == "reject_image":
                    mid = data.get("moment_id")
                    if mid is not None:
                        logger.info(f"[WS] User rejected image generation for moment {mid}")
                        reject_image(mid)
                        queue_holder["queue"].send_content(types.Content(
                            role="user",
                            parts=[types.Part(text=f"[System: User rejected image generation. Do NOT call generate_image again unless the user explicitly asks. Just continue chatting. Respond in {'Korean' if lang=='ko' else 'Japanese' if lang=='ja' else 'English'}.]")],
                        ))

                elif msg_type == "approve_diary":
                    diary_date = data.get("date", "")
                    logger.info(f"[WS] User approved diary generation (date={diary_date})")
                    asyncio.create_task(approve_diary())
                    queue_holder["queue"].send_content(types.Content(
                        role="user",
                        parts=[types.Part(text=f"[System: User approved diary generation for {diary_date}. Writing STARTED but NOT finished yet. It takes about 10-20 seconds. Do NOT say it's done. Respond in {'Korean' if lang=='ko' else 'Japanese' if lang=='ja' else 'English'}.]")],
                    ))

                elif msg_type == "reject_diary":
                    diary_date = data.get("date", "")
                    logger.info(f"[WS] User rejected diary generation (date={diary_date})")
                    reject_diary()
                    queue_holder["queue"].send_content(types.Content(
                        role="user",
                        parts=[types.Part(text=f"[System: User rejected diary generation. Do NOT call generate_diary again unless the user explicitly asks. Just continue chatting. Respond in {'Korean' if lang=='ko' else 'Japanese' if lang=='ja' else 'English'}.]")],
                    ))

                elif msg_type == "end_session":
                    logger.info("[WS] Client requested session end")
                    return

        except WebSocketDisconnect:
            logger.info("[WS] Client disconnected")
        except Exception as e:
            logger.error(f"[WS] Client read error: {e}")

    async def process_events(event_iter):
        """Process events from runner.run_live().

        ADK official pattern for native audio models:
        - Transcription → event.input_transcription / event.output_transcription
          (separate fields, NOT inside event.content.parts)
        - Audio → event.content.parts[].inline_data
        - Tool calls → event.get_function_calls() / event.get_function_responses()
        - Control → event.turn_complete / event.interrupted

        Ref: https://google.github.io/adk-docs/streaming/dev-guide/part3/
        """
        async for event in event_iter:
            # 1. Input transcription (user speech → text)
            if event.input_transcription and event.input_transcription.text:
                clean = re.sub(r"<[^>]+>", "", event.input_transcription.text)
                if clean.strip():
                    is_final = bool(getattr(event.input_transcription, "finished", False))
                    logger.info(f"[Transcript] user (final={is_final}): {clean!r}")
                    await send_event(ws, "transcript", {
                        "text": clean, "source": "user", "is_final": is_final,
                    })

            # 2. Output transcription (model speech → text)
            if event.output_transcription and event.output_transcription.text:
                clean = re.sub(r"<[^>]+>", "", event.output_transcription.text)
                if clean.strip():
                    is_final = bool(getattr(event.output_transcription, "finished", False))
                    logger.info(f"[Transcript] ai (final={is_final}): {clean!r}")
                    await send_event(ws, "transcript", {
                        "text": clean, "source": "ai", "is_final": is_final,
                    })

            # 3. Content: audio + tool calls/responses
            if event.content and event.content.parts:
                for part in event.content.parts:
                    # Audio data
                    if part.inline_data and part.inline_data.data:
                        audio_b64 = base64.b64encode(part.inline_data.data).decode()
                        mime = part.inline_data.mime_type or "audio/pcm;rate=24000"
                        await send_event(ws, "audio_response", {
                            "data": audio_b64, "mime_type": mime,
                        })

            # 4. Function calls (convenience method)
            for fc in (event.get_function_calls() or []):
                logger.info(f"[ToolCall] {fc.name} (id: {fc.id}, args: {fc.args})")
                pass  # Loading UI handled by client after approval

            # 5. Function responses (convenience method)
            for fr in (event.get_function_responses() or []):
                logger.info(f"[ToolResult] {fr.name}: {fr.response} (type={type(fr.response).__name__})")
                logger.info(f"[ToolResult] Checking name={fr.name!r} against handlers")

                # Normalize: ADK may wrap tool returns in {"result": ...}
                raw = fr.response
                if isinstance(raw, dict):
                    result = raw.get("result", raw)
                else:
                    result = raw

                if fr.name == "generate_image":
                    if isinstance(result, dict) and result.get("status") == "pending_approval":
                        await send_event(ws, "image_approval_request", {
                            "moment_id": result.get("moment_id"),
                        })
                elif fr.name == "save_moment":
                    if isinstance(result, dict) and "id" in result:
                        await send_event(ws, "moment_saved", result)
                elif fr.name == "edit_moment":
                    if isinstance(result, dict) and "id" in result:
                        await send_event(ws, "moment_updated", result)
                elif fr.name == "remove_moment":
                    if isinstance(result, dict) and "moment_id" in result:
                        await send_event(ws, "moment_deleted", result)
                elif fr.name == "generate_diary":
                    if isinstance(result, dict) and result.get("status") == "pending_approval":
                        await send_event(ws, "diary_approval_request")
                    elif isinstance(result, dict) and "content" in result:
                        diary_data = {k: (str(v) if hasattr(v, 'isoformat') else v) for k, v in result.items()}
                        await send_event(ws, "diary_generated", diary_data)

            # 6. Control signals
            if event.turn_complete:
                await send_event(ws, "turn_complete")

            if event.interrupted:
                await send_event(ws, "interrupted")

            if event.error_code:
                logger.error(f"[Gemini] Error: {event.error_code} - {event.error_message}")
                await send_event(ws, "error", {"message": event.error_message or str(event.error_code)})

    async def downstream_task():
        """Runner.run_live() → Browser with auto-reconnect on errors.

        ADK's patched base_llm_flow handles reconnection internally using
        session resumption handles. This outer loop is a fallback if ADK
        exhausts its internal retries.
        """
        nonlocal runner, session_service
        await send_event(ws, "connected", {"message": "Haru is ready"})

        for attempt in range(1, MAX_RECONNECT_ATTEMPTS + 1):
            try:
                await process_events(runner.run_live(
                    user_id=user_id,
                    session_id=session_id,
                    live_request_queue=queue_holder["queue"],
                    run_config=run_config,
                ))
                # Normal exit (stream ended gracefully)
                break
            except Exception as e:
                logger.error(f"[Gemini] Session error (attempt {attempt}/{MAX_RECONNECT_ATTEMPTS}): {e}")
                if attempt < MAX_RECONNECT_ATTEMPTS:
                    logger.info(f"[Gemini] Handler fallback reconnect in 2s...")
                    await send_event(ws, "error", {"message": "Connection lost, reconnecting..."})
                    # Only reset the queue — keep runner/session alive to preserve resumption handle
                    queue_holder["queue"] = LiveRequestQueue()
                    await asyncio.sleep(2)
                else:
                    logger.error(f"[Gemini] Max reconnect attempts reached")
                    await send_event(ws, "error", {"message": str(e)})

    upstream = asyncio.create_task(upstream_task())
    downstream = asyncio.create_task(downstream_task())
    try:
        done, pending = await asyncio.wait(
            [upstream, downstream], return_when=asyncio.FIRST_COMPLETED,
        )
        # Close queue FIRST — sends graceful close to Gemini, stops ADK reconnect loop
        queue_holder["queue"].close()
        for task in pending:
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
    except WebSocketDisconnect:
        logger.info("[WS] Client disconnected")
    except Exception as e:
        logger.error(f"[WS] Unexpected error: {e}")
    finally:
        queue_holder["queue"].close()  # ensure closed even on exception
        if debug_audio:
            debug_audio.close()
        # Diary generation is now user-initiated (HITL) — no auto-generation on session end
        if debug_audio:
            logger.info(f"[WS] Session ended — audio saved to logs/debug_audio_{session_id}.pcm")
        else:
            logger.info(f"[WS] Session ended")
