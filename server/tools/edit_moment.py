import asyncio
import logging

from server.db import update_moment, delete_moment
from server.rag import index_moment, delete_moment_embedding
from server.user_context import get_user_id

logger = logging.getLogger(__name__)


async def edit_moment(moment_id: int, content: str = "", emotion: str = "", time: str = "") -> dict:
    """Update an existing moment's content, emotion, or time. Use this when the user wants to correct or add details to a saved moment.

    Args:
        moment_id: The ID of the moment to update
        content: New content to replace the existing text (leave empty to keep current)
        emotion: New emotion emoji to replace the existing one (leave empty to keep current)
        time: When the moment happened in HH:MM format (leave empty to keep current)

    Returns:
        Updated moment info
    """
    logger.info(f"[Tool] edit_moment: id={moment_id}, content={'yes' if content else 'no'}, emotion={'yes' if emotion else 'no'}, time={'yes' if time else 'no'}")
    result = await update_moment(
        int(moment_id),
        content=content or None,
        emotion=emotion or None,
        time=time or None,
        user_id=get_user_id(),
    )
    if result:
        asyncio.create_task(index_moment(result, user_id=get_user_id()))
        logger.debug(f"[Tool] edit_moment done: id={moment_id}")
        return result
    logger.warning(f"[Tool] edit_moment: moment {moment_id} not found")
    return {"error": "Moment not found"}


async def remove_moment(moment_id: int) -> dict:
    """Delete a saved moment. Use this when the user explicitly asks to remove a diary entry.

    Args:
        moment_id: The ID of the moment to delete

    Returns:
        Deletion result
    """
    logger.info(f"[Tool] remove_moment: id={moment_id}")
    deleted = await delete_moment(int(moment_id), user_id=get_user_id())
    if deleted:
        asyncio.create_task(delete_moment_embedding(int(moment_id)))
        logger.debug(f"[Tool] remove_moment done: id={moment_id}")
        return {"status": "deleted", "moment_id": moment_id}
    logger.warning(f"[Tool] remove_moment: moment {moment_id} not found")
    return {"error": "Moment not found"}
