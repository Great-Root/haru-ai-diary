"""RRF hybrid search: pg_trgm keyword + pgvector semantic.

Uses PostgreSQL with pgvector for semantic search and pg_trgm for
trigram-based keyword search, combined via Reciprocal Rank Fusion.
"""

import logging
import time

from google import genai
from google.genai import types

from server.config import Config
from server.db import get_pool

logger = logging.getLogger(__name__)

EMBEDDING_MODEL = "gemini-embedding-001"
EMBEDDING_DIM = 1024
RRF_K = 60

# Vertex AI embedding client (initialized lazily)
_client = None


def _get_client():
    global _client
    if _client is None:
        _client = genai.Client(
            vertexai=True,
            project=Config.GOOGLE_CLOUD_PROJECT,
            location=Config.GOOGLE_CLOUD_LOCATION,
        )
    return _client


async def get_embedding(text: str) -> list[float]:
    """Get embedding vector from Vertex AI."""
    client = _get_client()
    t0 = time.time()
    response = await client.aio.models.embed_content(
        model=EMBEDDING_MODEL,
        contents=text,
        config=types.EmbedContentConfig(output_dimensionality=EMBEDDING_DIM),
    )
    ms = (time.time() - t0) * 1000
    if ms > 2000:
        logger.warning(f"[RAG] Slow embedding request: {ms:.0f}ms")
    else:
        logger.debug(f"[RAG] Embedding: {ms:.0f}ms")
    return response.embeddings[0].values


async def index_moment(moment: dict, user_id: str = ""):
    """Generate embedding for a moment and store in PostgreSQL."""
    moment_id = moment.get("id")
    date = moment.get("date", "")
    time_str = moment.get("time", "")
    content = moment.get("content", "")
    emotion = moment.get("emotion", "")
    text = f"[{date} {time_str}] {emotion} {content}"

    try:
        embedding = await get_embedding(text)
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO moment_embeddings (moment_id, user_id, date, time, content, emotion, embedding)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (moment_id) DO UPDATE SET
                    user_id = EXCLUDED.user_id,
                    date = EXCLUDED.date,
                    time = EXCLUDED.time,
                    content = EXCLUDED.content,
                    emotion = EXCLUDED.emotion,
                    embedding = EXCLUDED.embedding
            """, moment_id, user_id, date, time_str, content, emotion, str(embedding))
        logger.info(f"[RAG] Indexed moment {moment_id}")
    except Exception as e:
        logger.error(f"[RAG] Error indexing moment {moment_id}: {e}")


async def delete_moment_embedding(moment_id: int):
    """Remove embedding when a moment is deleted."""
    try:
        pool = await get_pool()
        async with pool.acquire() as conn:
            await conn.execute(
                "DELETE FROM moment_embeddings WHERE moment_id = $1", moment_id
            )
    except Exception as e:
        logger.error(f"[RAG] Error deleting embedding {moment_id}: {e}")


async def _keyword_search(conn, user_id: str, query: str, limit: int) -> list[dict]:
    """Keyword search using ILIKE for Korean text + pg_trgm similarity for ranking."""
    words = [w.strip() for w in query.split() if w.strip()]
    if not words:
        return []

    conditions = " OR ".join(f"content ILIKE ${ i + 3 }" for i in range(len(words)))
    params = [user_id, limit] + [f"%{w}%" for w in words]

    rows = await conn.fetch(f"""
        SELECT moment_id, content, emotion, date, time,
               similarity(content, ${ len(params) + 1 }) AS score
        FROM moment_embeddings
        WHERE user_id = $1 AND ({conditions})
        ORDER BY score DESC
        LIMIT $2
    """, *params, query)
    return [dict(r) for r in rows]


async def _semantic_search(conn, user_id: str, embedding: list[float], limit: int) -> list[dict]:
    """pgvector cosine similarity search."""
    rows = await conn.fetch("""
        SELECT moment_id, content, emotion, date, time,
               1 - (embedding <=> $1::vector) AS score
        FROM moment_embeddings
        WHERE user_id = $2
        ORDER BY embedding <=> $1::vector
        LIMIT $3
    """, str(embedding), user_id, limit)
    return [dict(r) for r in rows]


def _merge_rrf(
    keyword_results: list[dict],
    semantic_results: list[dict],
    keyword_weight: float = 1.5,
    semantic_weight: float = 1.0,
) -> list[dict]:
    """Merge results using weighted Reciprocal Rank Fusion."""
    keyword_rank = {r["moment_id"]: i + 1 for i, r in enumerate(keyword_results)}
    semantic_rank = {r["moment_id"]: i + 1 for i, r in enumerate(semantic_results)}

    all_ids = set(keyword_rank.keys()) | set(semantic_rank.keys())
    row_map = {r["moment_id"]: r for r in keyword_results}
    row_map.update({r["moment_id"]: r for r in semantic_results if r["moment_id"] not in row_map})

    candidates = []
    for mid in all_ids:
        row = row_map[mid].copy()
        kr = keyword_rank.get(mid)
        sr = semantic_rank.get(mid)
        score = 0.0
        if kr is not None:
            score += keyword_weight / (RRF_K + kr)
        if sr is not None:
            score += semantic_weight / (RRF_K + sr)
        row["rrf_score"] = score
        candidates.append(row)

    # RRF score desc, then newest first as tiebreaker
    # Negate date+time by sorting descending on the concatenated string
    candidates.sort(key=lambda x: x.get("date", "") + x.get("time", ""), reverse=True)
    candidates.sort(key=lambda x: x["rrf_score"], reverse=True)
    return candidates


async def recall_memories(query: str, user_id: str = "", top_k: int = 5) -> list[dict]:
    """Hybrid search: pg_trgm keyword + pgvector semantic, merged via RRF."""
    try:
        t0 = time.time()
        query_embedding = await get_embedding(query)
        pool = await get_pool()
        async with pool.acquire() as conn:
            keyword_results = await _keyword_search(conn, user_id, query, top_k * 2)
            semantic_results = await _semantic_search(conn, user_id, query_embedding, top_k * 2)

        ms = (time.time() - t0) * 1000
        logger.info(
            f"[RAG] keyword={len(keyword_results)}, semantic={len(semantic_results)} ({ms:.0f}ms) for: {query[:50]}"
        )

        merged = _merge_rrf(keyword_results, semantic_results)
        top = merged[:top_k]

        return [
            {
                "moment_id": r["moment_id"],
                "date": r.get("date", ""),
                "time": r.get("time", ""),
                "text": f"[{r.get('date', '')} {r.get('time', '')}] {r.get('emotion', '')} {r.get('content', '')}",
                "score": r["rrf_score"],
            }
            for r in top
        ]
    except Exception as e:
        logger.error(f"[RAG] Error searching memories: {e}")
        return []
