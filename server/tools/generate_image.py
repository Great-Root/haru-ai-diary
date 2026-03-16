import asyncio
import base64
import logging
import os
import random
import time as time_mod

from google import genai
from google.genai import types

from server.config import Config
from server.db import update_moment_image

logger = logging.getLogger(__name__)

# Session-level photo store (set per session from handler)
_photo_store: dict = {}
_on_generated_callback = None
_generating: set = set()


def set_session_context(photo_store: dict, on_generated=None):
    global _photo_store, _on_generated_callback
    _photo_store = photo_store
    _on_generated_callback = on_generated


# Pending approval: single request (latest wins)
_pending_approval: dict = {}


async def generate_image(moment_id: int, scene: str) -> dict:
    """일기 조각(moment)에 어울리는 감성 일러스트를 생성합니다. 사용자가 사진을 업로드했으면 그 사진을 참조하여 감성 일러스트로 변환합니다.

    Args:
        moment_id: 이미지를 연결할 moment의 ID
        scene: Scene description in English (2-3 sentences). Be narrative and vivid. Include the person's actions, emotions, and surroundings.

    Returns:
        생성 상태 정보
    """
    from server.user_context import get_lang
    lang = get_lang()
    mid = int(moment_id)
    if mid in _generating:
        logger.info(f"[GenerateImage] Already generating for moment {mid}, skipping")
        msg = {"ko": "이미 이미지를 생성하고 있습니다.", "en": "Image is already being generated.", "ja": "すでに画像を生成中です。"}
        return {"status": "already_generating", "message": msg.get(lang, msg["en"])}
    if "current" in _pending_approval:
        msg = {"ko": "이미 승인 대기 중입니다. 다시 호출하지 마세요.", "en": "Already waiting for approval. Do NOT call again.", "ja": "すでに承認待ちです。再度呼び出さないでください。"}
        return {"status": "already_pending", "message": msg.get(lang, msg["en"])}
    # Latest request wins (same pattern as diary)
    callback = _on_generated_callback
    _pending_approval["current"] = {"moment_id": mid, "scene": scene, "callback": callback}
    logger.info(f"[GenerateImage] Queued for approval: moment {mid}")
    msg = {
        "ko": "승인 버튼이 표시되었습니다. 버튼을 누르면 생성이 시작됩니다. 다시 요청하면 다시 호출하세요.",
        "en": "Approval button is shown. Generation starts when the user taps it. Call again if they request a new one.",
        "ja": "承認ボタンが表示されました。ユーザーがタップすると生成が始まります。",
    }
    return {"status": "pending_approval", "moment_id": mid, "message": msg.get(lang, msg["en"])}


async def approve_image(moment_id: int):
    """User approved image generation."""
    pending = _pending_approval.pop("current", None)
    if not pending:
        logger.warning(f"[GenerateImage] No pending approval")
        return
    mid = pending["moment_id"]
    if mid in _generating:
        logger.info(f"[GenerateImage] Already generating for moment {mid}")
        return
    _generating.add(mid)
    asyncio.create_task(_generate_in_background(mid, pending["scene"], callback=pending["callback"]))
    logger.info(f"[GenerateImage] Approved and started: moment {mid}")


def reject_image(moment_id: int):
    """User rejected image generation."""
    _pending_approval.pop("current", None)
    logger.info(f"[GenerateImage] Rejected: moment {moment_id}")


async def _generate_in_background(moment_id: int, scene: str, callback=None):
    try:
        # Load user profile for personalized illustrations
        from server.db import get_user_profile
        from server.user_context import get_user_id
        profile = await get_user_profile(get_user_id())
        person_desc = ""
        avatar_path = None
        if profile:
            gender_map = {"male": "young man", "female": "young woman"}
            gender = profile.get("gender", "")
            age = profile.get("age_group", "")
            person = gender_map.get(gender, "person")
            if age:
                person = f"{age} {person}"
            if gender or age:
                person_desc = f"The main person is a {person}. "
            # Check for custom avatar to use as character reference
            # Use custom avatar or default based on gender/age
            custom_avatar = profile.get("custom_avatar", "")
            if custom_avatar:
                local_path = custom_avatar.lstrip("/")
                if os.path.exists(local_path):
                    avatar_path = local_path
            if not avatar_path and (gender or age):
                age_key = (age or "20s").replace("+", "")
                gender_key = gender or "male"
                default_path = f"avatars/avatar-{age_key}-{gender_key}.webp"
                if os.path.exists(default_path):
                    avatar_path = default_path

        prompt = (
            f"Create a warm, hand-drawn watercolor illustration for a personal diary page. "
            f"{person_desc}"
            f"Scene: {scene}. "
            f"Style: soft pastel color palette with gentle brush strokes, visible paper texture, "
            f"slightly imperfect hand-drawn lines that feel authentic and personal. "
            f"Lighting should feel warm and nostalgic, like a cherished memory. "
            f"Square composition. No text, no watermarks, no borders."
        )
        if avatar_path:
            prompt += (
                " IMPORTANT: A reference portrait is provided. Keep the main character's face, "
                "hairstyle, and distinctive features consistent with this reference. "
                "Only change clothing and pose to match the scene."
            )

        logger.info(f"[GenerateImage] Generating for moment {moment_id}: {scene} (testMode={Config.TEST_MODE})")

        if Config.TEST_MODE:
            image_url = "/demo/demo-ramen-illust.webp"
            await asyncio.sleep(5)
        else:
            image_url = await _call_image_api(prompt, moment_id, avatar_path=avatar_path)

        # Save ref_photo if user uploaded a photo (consume it so it's not reused)
        ref_photo_url = _photo_store.get("latest", {}).pop("url", "")
        if ref_photo_url:
            from server.db import get_pool
            pool = await get_pool()
            async with pool.acquire() as conn:
                await conn.execute(
                    "UPDATE moments SET ref_photo = $1 WHERE id = $2",
                    ref_photo_url, moment_id,
                )
            logger.info(f"[GenerateImage] Ref photo saved: {ref_photo_url}")

        moment = await update_moment_image(moment_id, image_url)
        logger.info(f"[GenerateImage] Saved: {image_url}")

        if callback:
            logger.info(f"[GenerateImage] Calling callback for moment {moment_id}")
            await callback(moment_id, image_url, moment)
            logger.info(f"[GenerateImage] Callback done for moment {moment_id}")
        else:
            logger.warning(f"[GenerateImage] No callback set for moment {moment_id}")

    except Exception as e:
        logger.error(f"[GenerateImage] Error: {e}", exc_info=True)
        if callback:
            await callback(moment_id, "", None)
    finally:
        _generating.discard(moment_id)


async def _call_image_api(prompt: str, moment_id: int, avatar_path: str = None) -> str:
    # Use Vertex AI for image generation (Google Cloud requirement)
    client = genai.Client(
        vertexai=True,
        project=Config.GOOGLE_CLOUD_PROJECT,
        location="global",
    )

    from PIL import Image
    import io

    contents = [prompt]

    # Use custom avatar as character reference
    if avatar_path:
        avatar_img = Image.open(avatar_path)
        contents.insert(0, avatar_img)
        logger.info(f"[GenerateImage] Using custom avatar as character reference")

    # Use uploaded photo as reference if available
    latest_photo = _photo_store.get("latest")
    if latest_photo:
        logger.info(f"[GenerateImage] Using uploaded photo as reference (mime: {latest_photo['mime']})")
        img = Image.open(io.BytesIO(base64.b64decode(latest_photo["data"])))
        contents.insert(0, img)

    # Retry on rate limit (429)
    for attempt in range(3):
        try:
            response = await client.aio.models.generate_content(
                model=Config.GEMINI_IMAGE_MODEL,
                contents=contents,
                config=types.GenerateContentConfig(
                    response_modalities=["TEXT", "IMAGE"],
                ),
            )
            break
        except Exception as e:
            if "429" in str(e) and attempt < 2:
                wait = (attempt + 1) * 15
                logger.warning(f"[GenerateImage] Rate limited, retrying in {wait}s (attempt {attempt + 1}/3)")
                await asyncio.sleep(wait)
            else:
                raise

    # Extract image from response, save as WebP for smaller size
    if not response.candidates or len(response.candidates) == 0:
        raise RuntimeError("No candidates in image generation response")

    for part in response.candidates[0].content.parts:
        if part.inline_data and part.inline_data.data:
            from PIL import Image
            import io
            img = Image.open(io.BytesIO(part.inline_data.data))
            filename = f"{int(time_mod.time())}_{moment_id}.webp"
            filepath = os.path.join(Config.GENERATED_DIR, filename)
            img.save(filepath, "webp", quality=85)
            return f"/generated/{filename}"

    raise RuntimeError("No image data in response")


def _pick_existing_image(moment_id: int) -> str:
    generated_dir = Config.GENERATED_DIR
    try:
        entries = [e for e in os.listdir(generated_dir) if os.path.isfile(os.path.join(generated_dir, e))]
    except OSError:
        entries = []

    if entries:
        picked = random.choice(entries)
        logger.info(f"[GenerateImage] TestMode: using existing image {picked}")
        return f"/generated/{picked}"
    return f"/generated/test_{moment_id}.png"
