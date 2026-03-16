import logging
import time as _time

import asyncpg
from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

from server.config import Config

logger = logging.getLogger(__name__)
_pool: Optional[asyncpg.Pool] = None

SLOW_QUERY_MS = 100


async def _init_conn(conn):
    """Per-connection init: lower pg_trgm threshold for Korean."""
    await conn.execute("SELECT set_limit(0.1)")


async def get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            Config.PG_DSN, min_size=1, max_size=5, init=_init_conn
        )
    return _pool


async def init_db():
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
        await conn.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS moments (
                id          SERIAL PRIMARY KEY,
                user_id     TEXT NOT NULL DEFAULT '',
                date        TEXT NOT NULL,
                time        TEXT NOT NULL,
                content     TEXT NOT NULL,
                emotion     TEXT,
                image_url   TEXT,
                ref_photo   TEXT,
                created_at  TIMESTAMP DEFAULT NOW()
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS diaries (
                id          SERIAL PRIMARY KEY,
                user_id     TEXT NOT NULL DEFAULT '',
                date        TEXT NOT NULL,
                content     TEXT NOT NULL,
                created_at  TIMESTAMP DEFAULT NOW(),
                UNIQUE(user_id, date)
            )
        """)
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS moment_embeddings (
                moment_id   INTEGER PRIMARY KEY,
                user_id     TEXT NOT NULL DEFAULT '',
                date        TEXT NOT NULL DEFAULT '',
                time        TEXT NOT NULL DEFAULT '',
                content     TEXT NOT NULL DEFAULT '',
                emotion     TEXT DEFAULT '',
                embedding   vector(1024)
            )
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS user_profiles (
                user_id     TEXT PRIMARY KEY,
                data        JSONB NOT NULL DEFAULT '{}',
                updated_at  TIMESTAMP DEFAULT NOW()
            )
        """)

        # Migrations
        await conn.execute("ALTER TABLE moments ADD COLUMN IF NOT EXISTS weather JSONB")
        await conn.execute("ALTER TABLE diaries ADD COLUMN IF NOT EXISTS emotion TEXT DEFAULT ''")

        # Indexes
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_moments_date ON moments(date)")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_moments_user ON moments(user_id, date)")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_diaries_date ON diaries(date)")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_diaries_user ON diaries(user_id, date)")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_emb_user ON moment_embeddings(user_id)")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_emb_hnsw ON moment_embeddings USING hnsw (embedding vector_cosine_ops)")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_emb_trgm ON moment_embeddings USING gin (content gin_trgm_ops)")


def _log_query(op: str, t0: float, **kwargs):
    ms = (_time.time() - t0) * 1000
    extra = " ".join(f"{k}={v}" for k, v in kwargs.items())
    if ms > SLOW_QUERY_MS:
        logger.warning(f"[DB] SLOW {op} ({ms:.0f}ms) {extra}")
    else:
        logger.debug(f"[DB] {op} ({ms:.0f}ms) {extra}")


async def insert_moment(content: str, emotion: str, user_id: str = "", tz: str = "UTC", event_time: str = "", weather: dict = None) -> dict:
    import json
    try:
        now = datetime.now(ZoneInfo(tz))
    except Exception:
        now = datetime.now()
    date = now.strftime("%Y-%m-%d")
    time_str = event_time if event_time else ""

    pool = await get_pool()
    t0 = _time.time()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "INSERT INTO moments (user_id, date, time, content, emotion, weather) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
            user_id, date, time_str, content, emotion, json.dumps(weather) if weather else None,
        )
    _log_query("INSERT moment", t0, id=row["id"])
    return {
        "id": row["id"],
        "date": date,
        "time": time_str,
        "content": content,
        "emotion": emotion,
    }


async def update_moment(moment_id: int, content: str | None = None, emotion: str | None = None, time: str | None = None, user_id: str = "") -> dict | None:
    updates = []
    params = []
    idx = 1
    if content is not None:
        updates.append(f"content = ${idx}")
        params.append(content)
        idx += 1
    if emotion is not None:
        updates.append(f"emotion = ${idx}")
        params.append(emotion)
        idx += 1
    if time is not None:
        updates.append(f"time = ${idx}")
        params.append(time)
        idx += 1
    if not updates:
        return None

    params.extend([moment_id, user_id])
    set_clause = ", ".join(updates)

    pool = await get_pool()
    t0 = _time.time()
    async with pool.acquire() as conn:
        await conn.execute(
            f"UPDATE moments SET {set_clause} WHERE id = ${idx} AND user_id = ${idx + 1}",
            *params,
        )
        row = await conn.fetchrow(
            "SELECT id, date, time, content, emotion, image_url FROM moments WHERE id = $1 AND user_id = $2",
            moment_id, user_id,
        )
    _log_query("UPDATE moment", t0, id=moment_id)
    return dict(row) if row else None


async def delete_moment(moment_id: int, user_id: str = "") -> bool:
    pool = await get_pool()
    t0 = _time.time()
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM moments WHERE id = $1 AND user_id = $2",
            moment_id, user_id,
        )
    _log_query("DELETE moment", t0, id=moment_id)
    return result == "DELETE 1"


async def update_moment_image(moment_id: int, image_url: str) -> dict | None:
    pool = await get_pool()
    t0 = _time.time()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE moments SET image_url = $1 WHERE id = $2",
            image_url, moment_id,
        )
        row = await conn.fetchrow(
            "SELECT id, date, time, content, emotion, image_url FROM moments WHERE id = $1",
            moment_id,
        )
    _log_query("UPDATE moment_image", t0, id=moment_id)
    return dict(row) if row else None


async def get_moments_by_date(date: str, user_id: str = "") -> list[dict]:
    pool = await get_pool()
    t0 = _time.time()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT id, date, time, content, emotion,
                      COALESCE(image_url,'') as image_url,
                      COALESCE(ref_photo,'') as ref_photo, weather, created_at
               FROM moments WHERE date = $1 AND user_id = $2 ORDER BY time ASC""",
            date, user_id,
        )
    _log_query("SELECT moments", t0, date=date, count=len(rows))
    import json
    from server.user_context import get_timezone
    try:
        tz = ZoneInfo(get_timezone())
    except Exception:
        tz = None
    results = []
    for row in rows:
        d = dict(row)
        if d.get("weather") and isinstance(d["weather"], str):
            d["weather"] = json.loads(d["weather"])
        if d.get("created_at") and tz:
            d["created_at"] = d["created_at"].replace(tzinfo=ZoneInfo("UTC")).astimezone(tz).strftime("%Y-%m-%d %H:%M")
        elif d.get("created_at"):
            d["created_at"] = d["created_at"].strftime("%Y-%m-%d %H:%M")
        results.append(d)
    return results


async def upsert_diary(date: str, content: str, user_id: str = "", emotion: str = "") -> dict:
    pool = await get_pool()
    t0 = _time.time()
    async with pool.acquire() as conn:
        await conn.execute(
            """INSERT INTO diaries (user_id, date, content, emotion) VALUES ($1, $2, $3, $4)
               ON CONFLICT(user_id, date) DO UPDATE SET content = EXCLUDED.content, emotion = EXCLUDED.emotion""",
            user_id, date, content, emotion,
        )
        row = await conn.fetchrow(
            "SELECT id, date, content, emotion, created_at FROM diaries WHERE user_id = $1 AND date = $2",
            user_id, date,
        )
    _log_query("UPSERT diary", t0, date=date)
    return dict(row)


async def get_diary_by_date(date: str, user_id: str = "") -> dict | None:
    pool = await get_pool()
    t0 = _time.time()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, date, content, emotion, created_at FROM diaries WHERE user_id = $1 AND date = $2",
            user_id, date,
        )
    _log_query("SELECT diary", t0, date=date)
    return dict(row) if row else None


async def delete_user_data(user_id: str) -> dict:
    """Delete all moments, diaries, and embeddings for a user."""
    pool = await get_pool()
    t0 = _time.time()
    async with pool.acquire() as conn:
        m = await conn.execute("DELETE FROM moments WHERE user_id = $1", user_id)
        d = await conn.execute("DELETE FROM diaries WHERE user_id = $1", user_id)
        await conn.execute("DELETE FROM moment_embeddings WHERE user_id = $1", user_id)
        await conn.execute("DELETE FROM user_profiles WHERE user_id = $1", user_id)
        moments_deleted = int(m.split()[-1])
        diaries_deleted = int(d.split()[-1])
    _log_query("DELETE user_data", t0, user=user_id, moments=moments_deleted, diaries=diaries_deleted)
    logger.info(f"[DB] Deleted all data for user={user_id}: moments={moments_deleted}, diaries={diaries_deleted}")
    # Delete custom avatar file
    import os
    avatar_path = os.path.join("avatars", "custom", f"avatar-{user_id}.webp")
    if os.path.exists(avatar_path):
        os.remove(avatar_path)
        logger.info(f"[DB] Deleted custom avatar for user={user_id}")
    return {"moments_deleted": moments_deleted, "diaries_deleted": diaries_deleted}


async def get_user_profile(user_id: str) -> dict:
    import json
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT data FROM user_profiles WHERE user_id = $1", user_id,
        )
    if not row:
        return {}
    data = row["data"]
    return json.loads(data) if isinstance(data, str) else dict(data)


async def update_user_profile(user_id: str, updates: dict) -> dict:
    """Merge updates into existing profile (JSONB merge)."""
    import json
    pool = await get_pool()
    t0 = _time.time()
    async with pool.acquire() as conn:
        await conn.execute("""
            INSERT INTO user_profiles (user_id, data, updated_at)
            VALUES ($1, $2::jsonb, NOW())
            ON CONFLICT (user_id) DO UPDATE SET
                data = user_profiles.data || $2::jsonb,
                updated_at = NOW()
        """, user_id, json.dumps(updates))
        row = await conn.fetchrow(
            "SELECT data FROM user_profiles WHERE user_id = $1", user_id,
        )
    _log_query("UPSERT user_profile", t0, user=user_id)
    if not row:
        return {}
    data = row["data"]
    return json.loads(data) if isinstance(data, str) else dict(data)
