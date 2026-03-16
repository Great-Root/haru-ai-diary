import logging

from server.db import update_user_profile as _update_profile, get_user_profile as _get_profile
from server.user_context import get_user_id

logger = logging.getLogger(__name__)


async def learn_about_user(
    name: str = "",
    gender: str = "",
    age_group: str = "",
    occupation: str = "",
    interests: str = "",
    personality: str = "",
    speech_style: str = "",
    favorites: str = "",
    relationships: str = "",
    notes: str = "",
) -> dict:
    """Save something you learned about the user during conversation.
    Call this whenever you discover personal details, preferences, or characteristics.

    Args:
        name: User's name or nickname
        gender: Detected or stated gender (male/female)
        age_group: Estimated age group (teen/20s/30s/40s/50s+)
        occupation: Job or role
        interests: Comma-separated hobbies or interests
        personality: Brief personality description
        speech_style: How they talk (formal/casual/playful etc)
        favorites: Things they like (food, music, places etc)
        relationships: Key people they mention (friends, family etc)
        notes: Any other useful context about the user

    Returns:
        Updated profile
    """
    user_id = get_user_id()
    updates = {}
    for key, val in [
        ("name", name), ("gender", gender), ("age_group", age_group),
        ("occupation", occupation), ("interests", interests),
        ("personality", personality), ("speech_style", speech_style),
        ("favorites", favorites), ("relationships", relationships),
        ("notes", notes),
    ]:
        if val:
            updates[key] = val

    if not updates:
        return {"status": "no updates"}

    logger.info(f"[Tool] learn_about_user: {updates}")
    profile = await _update_profile(user_id, updates)
    return {"status": "updated", "profile": profile}
