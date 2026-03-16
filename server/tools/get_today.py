import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from server.db import get_moments_by_date
from server.user_context import get_user_id, get_timezone

logger = logging.getLogger(__name__)


async def get_moments(date: str = "") -> dict:
    """Retrieve diary moments for a specific date. Defaults to today if no date given.

    Args:
        date: Date in YYYY-MM-DD format. Leave empty for today. Use "yesterday" for yesterday.

    Returns:
        Dict with date and list of moments for that date
    """
    try:
        tz = ZoneInfo(get_timezone())
        now = datetime.now(tz)
    except Exception:
        now = datetime.now()

    if not date or date == "today":
        target = now.strftime("%Y-%m-%d")
    elif date == "yesterday":
        target = (now - timedelta(days=1)).strftime("%Y-%m-%d")
    else:
        target = date

    moments = await get_moments_by_date(target, user_id=get_user_id())
    logger.info(f"[Tool] get_moments: date={target}, count={len(moments)}")
    return {
        "date": target,
        "count": len(moments),
        "moments": moments,
    }
