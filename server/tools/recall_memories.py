import logging

from server.rag import recall_memories as _recall
from server.user_context import get_user_id

logger = logging.getLogger(__name__)


async def recall_memories(query: str) -> list[dict]:
    """Search through past diary entries to find relevant memories. Use this when the user mentions something that might relate to a past experience, or when you want to bring up a related memory naturally.

    Args:
        query: What to search for (e.g., "cafe coffee", "birthday", "feeling sad")

    Returns:
        List of relevant past moments with text and relevance score
    """
    logger.info(f"[Tool] recall_memories: query={query!r:.50}")
    results = await _recall(query, user_id=get_user_id(), top_k=5)
    logger.debug(f"[Tool] recall_memories done: {len(results)} results")
    return results
