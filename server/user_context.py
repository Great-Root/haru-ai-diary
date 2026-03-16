"""Per-session user context for tools.

Tools (save_moment, get_today_moments, etc.) are called by the Gemini agent
and cannot receive user_id as a parameter. We use module-level state
(set per WebSocket session from handler.py) to pass user_id to tools.
"""

_current_user_id: str = ""
_current_timezone: str = "UTC"
_current_weather: dict | None = None
_current_lang: str = "ko"


def set_user_id(user_id: str):
    global _current_user_id
    _current_user_id = user_id


def get_user_id() -> str:
    return _current_user_id


def set_timezone(tz: str):
    global _current_timezone
    _current_timezone = tz


def get_timezone() -> str:
    return _current_timezone


def set_weather(weather: dict | None):
    global _current_weather
    _current_weather = weather


def get_weather() -> dict | None:
    return _current_weather


def set_lang(lang: str):
    global _current_lang
    _current_lang = lang


def get_lang() -> str:
    return _current_lang
