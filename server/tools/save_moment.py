import asyncio
import logging

from server.db import insert_moment
from server.rag import index_moment
from server.user_context import get_user_id, get_timezone, get_weather as get_current_weather

logger = logging.getLogger(__name__)


async def save_moment(content: str, emotion: str, time: str = "") -> dict:
    """Save a meaningful moment from the conversation as a diary entry. Record the content and emotion together.

    Args:
        content: Diary entry content in the same language the user is speaking (1-2 sentences)
        emotion: MUST be a single emoji character only (e.g. 😊, 😢, 🥰, 😤, 🔥, 💪). NEVER use text like "기쁨" or "happy".
        time: When the moment happened in HH:MM format (e.g. "14:30"). Leave empty if unknown.

    Returns:
        Saved moment info
    """
    user_id = get_user_id()
    logger.info(f"[Tool] save_moment: emotion={emotion}, time={time or 'unknown'}")
    weather = get_current_weather()
    moment = await insert_moment(content, emotion, user_id=user_id, tz=get_timezone(), event_time=time, weather=weather)
    asyncio.create_task(index_moment(moment, user_id=user_id))
    logger.debug(f"[Tool] save_moment done: id={moment.get('id')}")
    return moment
