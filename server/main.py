import asyncio
import logging
import logging.handlers
import os

from server.config import Config

# ADK: Gemini API backend
os.environ.setdefault("GOOGLE_API_KEY", Config.GEMINI_API_KEY)


from fastapi import FastAPI, WebSocket, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from server.db import init_db, get_moments_by_date, get_diary_by_date, delete_user_data
from server.handler import handle_websocket

# Logging — stdout + daily rotating file
os.makedirs("logs", exist_ok=True)
_log_fmt = logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s")
_log_level = getattr(logging, Config.LOG_LEVEL.upper(), logging.INFO)

_console = logging.StreamHandler()
_console.setFormatter(_log_fmt)

_file = logging.handlers.TimedRotatingFileHandler(
    "logs/haru-server.log", when="midnight", backupCount=7, encoding="utf-8",
)
_file.setFormatter(_log_fmt)
_file.suffix = "%Y-%m-%d"

logging.basicConfig(level=_log_level, handlers=[_console, _file])
logger = logging.getLogger(__name__)

app = FastAPI(title="HARU - AI Voice Diary")

# Ensure directories
os.makedirs(Config.UPLOAD_DIR, exist_ok=True)
os.makedirs(Config.GENERATED_DIR, exist_ok=True)

# Static directories served by catch-all route
DIST_DIR = "client/dist"
STATIC_DIRS = {
    "uploads": Config.UPLOAD_DIR,
    "generated": Config.GENERATED_DIR,
    "avatars": "avatars",
}


@app.on_event("startup")
async def startup():
    await init_db()
    import subprocess
    try:
        git_hash = subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], text=True).strip()
    except Exception:
        git_hash = "unknown"
    logger.info(f"HARU server started (version={git_hash}, model={Config.GEMINI_LIVE_MODEL}, test_mode={Config.TEST_MODE})")


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/")
async def index():
    return FileResponse(os.path.join(DIST_DIR, "index.html"))


if Config.DEBUG_AUDIO:
    @app.get("/debug-audio")
    async def debug_audio():
        import glob
        files = sorted(glob.glob("logs/debug_audio_*.pcm"), reverse=True)
        if files:
            return FileResponse(files[0], media_type="audio/pcm", filename="debug_audio.pcm")
        return {"error": "no audio file"}


@app.get("/api/moments/{date}")
async def api_moments(date: str, uid: str = ""):
    moments = await get_moments_by_date(date, user_id=uid)
    return {"date": date, "moments": moments}


@app.get("/api/calendar/{year}/{month}")
async def api_calendar(year: int, month: int, uid: str = ""):
    """Get monthly summary — which days have moments/diary."""
    from server.db import get_pool
    pool = await get_pool()
    async with pool.acquire() as conn:
        month_str = f"{year}-{month:02d}"
        rows = await conn.fetch("""
            SELECT date, COUNT(*) as moment_count,
                   (SELECT emotion FROM moments m2 WHERE m2.date = m.date AND m2.user_id = $1 ORDER BY created_at DESC LIMIT 1) as last_emotion,
                   (SELECT weather FROM moments m3 WHERE m3.date = m.date AND m3.user_id = $1 AND weather IS NOT NULL ORDER BY created_at DESC LIMIT 1) as weather
            FROM moments m
            WHERE user_id = $1 AND date LIKE $2 || '%'
            GROUP BY date ORDER BY date
        """, uid, month_str)
        diary_rows = await conn.fetch(
            "SELECT date, COALESCE(emotion, '') as emotion FROM diaries WHERE user_id = $1 AND date LIKE $2 || '%'",
            uid, month_str,
        )
    import json
    diary_map = {r["date"]: r["emotion"] for r in diary_rows}
    days = {}
    for r in rows:
        w = r["weather"]
        if w and isinstance(w, str):
            w = json.loads(w)
        date_key = r["date"]
        # Diary emotion takes priority, then last moment emotion
        emotion = diary_map.get(date_key, "") or r["last_emotion"] or ""
        days[date_key] = {
            "count": r["moment_count"],
            "emotion": emotion,
            "weather": w,
            "has_diary": date_key in diary_map,
        }
    return {"year": year, "month": month, "days": days}


@app.get("/api/diary/{date}")
async def api_diary(date: str, uid: str = ""):
    diary = await get_diary_by_date(date, user_id=uid)
    if not diary:
        return {"date": date, "diary": None}
    return {"date": date, "diary": diary}


@app.post("/api/diary/{date}/generate")
async def api_generate_diary(date: str, uid: str = "", request: Request = None):
    """Generate diary from moments for a specific date."""
    try:
        from server.tools.generate_diary import _do_generate_diary
        from server.user_context import set_user_id, set_lang as set_user_lang
        set_user_id(uid)
        user_prompt = ""
        lang = "ko"
        if request:
            try:
                body = await request.json()
                user_prompt = body.get("prompt", "")
                lang = body.get("lang", "ko")
            except Exception:
                pass
        set_user_lang(lang)
        # Call _do_generate_diary directly (skip HITL — API is user-initiated)
        result = await _do_generate_diary(date=date, user_prompt=user_prompt)
        if "error" in result:
            return {"status": "error", "message": result["error"]}
        # Serialize datetime
        diary_data = {k: (str(v) if hasattr(v, 'isoformat') else v) for k, v in result.items()}
        return {"status": "ok", "diary": diary_data}
    except Exception as e:
        logger.error(f"[API] generate_diary error: {e}", exc_info=True)
        return {"status": "error", "error": str(e)}


@app.patch("/api/moments/{moment_id}")
async def api_update_moment(moment_id: int, uid: str = "", content: str = "", emotion: str = ""):
    from server.db import update_moment
    result = await update_moment(moment_id, content=content or None, emotion=emotion or None, user_id=uid)
    if result:
        return {"status": "ok", "moment": result}
    return {"status": "error", "message": "Moment not found"}


@app.delete("/api/moments/{moment_id}")
async def api_delete_moment(moment_id: int, uid: str = ""):
    from server.db import delete_moment
    deleted = await delete_moment(moment_id, user_id=uid)
    return {"status": "ok" if deleted else "error"}


@app.post("/api/user/{uid}/profile")
async def api_update_profile(uid: str, request: Request):
    from server.db import update_user_profile
    body = await request.json()
    profile = await update_user_profile(uid, body)
    return {"status": "ok", "profile": profile}


@app.post("/api/user/{uid}/seed-demo")
async def api_seed_demo(uid: str, request: Request):
    """Seed demo data for user in their selected language."""
    body = await request.json()
    lang = body.get("lang", "ko")
    tz = body.get("tz", "Asia/Seoul")

    import json
    from scripts.seed_demo import MOMENTS, DIARIES, PROFILE, WEATHERS, IMAGES, _day
    from server.db import get_pool, update_user_profile
    from server.rag import index_moment

    # Language index: ko=2, en=3, ja=4
    lang_idx = {"ko": 2, "en": 3, "ja": 4}.get(lang, 2)

    pool = await get_pool()
    async with pool.acquire() as conn:
        for m in MOMENTS:
            day_offset, time_str = m[0], m[1]
            date = _day(day_offset, tz=tz)
            content = m[lang_idx]
            emotion = m[5]
            image_url, ref_photo = IMAGES.get((day_offset, time_str), ("", ""))
            weather = dict(WEATHERS.get(day_offset, WEATHERS[0]))
            # Localize weather desc
            from server.weather import WEATHER_CODES, _DEFAULT_WEATHER
            w = WEATHER_CODES.get(weather["code"], _DEFAULT_WEATHER)
            weather["desc"] = w.get(lang, w["en"])
            dw = WEATHER_CODES.get(weather.get("daily_code", 0), _DEFAULT_WEATHER)
            weather["daily_desc"] = dw.get(lang, dw["en"])
            await conn.execute(
                "INSERT INTO moments (user_id, date, time, content, emotion, weather, image_url, ref_photo) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
                uid, date, time_str, content, emotion, json.dumps(weather), image_url, ref_photo,
            )

        for day_offset, langs in DIARIES.items():
            date = _day(day_offset, tz=tz)
            content = langs.get(lang, langs["ko"])
            emotion = langs.get("emotion", "📝")
            await conn.execute(
                """INSERT INTO diaries (user_id, date, content, emotion) VALUES ($1, $2, $3, $4)
                   ON CONFLICT (user_id, date) DO NOTHING""",
                uid, date, content, emotion,
            )

        count = await conn.fetchval("SELECT COUNT(*) FROM moments WHERE user_id = $1", uid)

    await update_user_profile(uid, PROFILE)

    # Insert pre-generated embeddings (instant, no API calls)
    import os
    embeddings_path = os.path.join(os.path.dirname(__file__), "..", "scripts", "demo_embeddings.json")
    if os.path.isfile(embeddings_path):
        with open(embeddings_path) as f:
            demo_embeddings = json.loads(f.read())
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT id, date, time, content FROM moments WHERE user_id = $1 ORDER BY date, time",
                uid,
            )
            inserted = 0
            for row in rows:
                # Find matching embedding by content offset + lang
                for m in MOMENTS:
                    if m[lang_idx] == row["content"]:
                        key = f"{m[0]}|{m[1]}|{lang}"
                        vec = demo_embeddings.get(key)
                        if vec:
                            await conn.execute(
                                "INSERT INTO moment_embeddings (moment_id, user_id, embedding) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
                                row["id"], uid, str(vec),
                            )
                            inserted += 1
                        break
            logger.info(f"[Seed] Inserted {inserted} pre-generated embeddings for {uid}")
    else:
        # Fallback: generate embeddings via API
        async def _index():
            async with pool.acquire() as conn:
                rows = await conn.fetch(
                    "SELECT id, date, time, content, emotion FROM moments WHERE user_id = $1",
                    uid,
                )
            for row in rows:
                try:
                    await index_moment(dict(row), user_id=uid)
                except Exception:
                    pass
        asyncio.ensure_future(_index())

    return {"status": "ok", "moments": count, "lang": lang}


@app.post("/api/user/{uid}/generate-avatar")
async def api_generate_avatar(uid: str, request: Request):
    """Generate watercolor avatar from uploaded photo."""
    try:
        import base64
        from PIL import Image
        import io
        from google import genai
        from google.genai import types

        body = await request.json()
        image_data = base64.b64decode(body["image"])
        user_prompt = body.get("prompt", "")
        img = Image.open(io.BytesIO(image_data))

        # Test mode: save uploaded image directly as avatar
        if Config.TEST_MODE:
            img = img.resize((512, 512), Image.LANCZOS)
            filename = f"avatar-{uid}.webp"
            filepath = os.path.join("avatars", filename)
            img.save(filepath, "webp", quality=85)
            from server.db import update_user_profile
            await update_user_profile(uid, {"custom_avatar": f"/avatars/{filename}"})
            return {"status": "ok", "avatar_url": f"/avatars/custom/{filename}"}

        client = genai.Client(
            vertexai=True,
            project=Config.GOOGLE_CLOUD_PROJECT,
            location="global",
        )

        base_prompt = (
            "Transform this photo into a soft watercolor portrait illustration for a personal diary. "
            "Keep the exact face shape, facial proportions, hairstyle, and all distinctive features unchanged. "
            "Do not alter bone structure, jaw line, nose shape, or eye shape. "
            "Only enhance subtly — smooth clear skin, even skin tone, bright eyes, clean polished look. "
            "Use gentle pastel colors, soft brush strokes, clean white background. "
            "Portrait style, centered, square composition. No text, no watermarks."
        )
        if user_prompt:
            base_prompt += f" Additional style: {user_prompt}"

        response = await client.aio.models.generate_content(
            model=Config.GEMINI_IMAGE_MODEL,
            contents=[img, base_prompt],
            config=types.GenerateContentConfig(
                response_modalities=["TEXT", "IMAGE"],
            ),
        )

        # Save generated avatar
        if not response.candidates or len(response.candidates) == 0:
            return {"status": "error", "message": "No candidates in response"}

        for part in response.candidates[0].content.parts:
            if part.inline_data and part.inline_data.data:
                avatar = Image.open(io.BytesIO(part.inline_data.data))
                avatar = avatar.resize((512, 512), Image.LANCZOS)
                filename = f"avatar-{uid}.webp"
                filepath = os.path.join("avatars", "custom", filename)
                avatar.save(filepath, "webp", quality=85)

                from server.db import update_user_profile
                await update_user_profile(uid, {"custom_avatar": f"/avatars/custom/{filename}"})

                return {"status": "ok", "avatar_url": f"/avatars/custom/{filename}"}

        return {"status": "error", "message": "No image generated"}
    except Exception as e:
        logger.error(f"[API] generate_avatar error: {e}", exc_info=True)
        return {"status": "error", "error": str(e)}


@app.delete("/api/user/{uid}")
async def api_delete_user(uid: str):
    result = await delete_user_data(uid)
    return {"status": "ok", **result}


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await handle_websocket(ws)


@app.websocket("/")
async def websocket_root(ws: WebSocket):
    """Reject stray WebSocket connections to / (e.g. from Vite HMR remnants)."""
    await ws.close(code=1000)


# Catch-all: serve static files from dist or data dirs, fallback to index.html
@app.get("/{filepath:path}")
async def static_catchall(filepath: str):
    # Check data directories (uploads, generated, avatars)
    parts = filepath.split("/", 1)
    if len(parts) >= 2 and parts[0] in STATIC_DIRS:
        base_dir = os.path.normpath(os.path.abspath(STATIC_DIRS[parts[0]]))
        full = os.path.normpath(os.path.abspath(os.path.join(base_dir, parts[1])))
        if full.startswith(base_dir) and os.path.isfile(full):
            return FileResponse(full)

    # Check dist directory
    full = os.path.normpath(os.path.join(DIST_DIR, filepath))
    if full.startswith(os.path.normpath(DIST_DIR)) and os.path.isfile(full):
        return FileResponse(full)
    return FileResponse(os.path.join(DIST_DIR, "index.html"))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=Config.PORT)
