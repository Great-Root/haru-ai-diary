"""Weather service using Open-Meteo API (free, no API key)."""
import logging
import httpx

logger = logging.getLogger(__name__)

WEATHER_CODES = {
    0:  {"ko": "맑음",       "en": "Clear",        "ja": "晴れ",       "icon": "☀️"},
    1:  {"ko": "대체로 맑음", "en": "Mainly clear",  "ja": "おおむね晴れ", "icon": "🌤️"},
    2:  {"ko": "구름 조금",   "en": "Partly cloudy", "ja": "一部曇り",   "icon": "⛅"},
    3:  {"ko": "흐림",       "en": "Overcast",      "ja": "曇り",       "icon": "☁️"},
    45: {"ko": "안개",       "en": "Fog",           "ja": "霧",         "icon": "🌫️"},
    48: {"ko": "안개",       "en": "Fog",           "ja": "霧",         "icon": "🌫️"},
    51: {"ko": "이슬비",     "en": "Drizzle",       "ja": "霧雨",       "icon": "🌦️"},
    53: {"ko": "이슬비",     "en": "Drizzle",       "ja": "霧雨",       "icon": "🌦️"},
    55: {"ko": "이슬비",     "en": "Drizzle",       "ja": "霧雨",       "icon": "🌦️"},
    61: {"ko": "비",         "en": "Rain",          "ja": "雨",         "icon": "🌧️"},
    63: {"ko": "비",         "en": "Rain",          "ja": "雨",         "icon": "🌧️"},
    65: {"ko": "폭우",       "en": "Heavy rain",    "ja": "大雨",       "icon": "🌧️"},
    71: {"ko": "눈",         "en": "Snow",          "ja": "雪",         "icon": "🌨️"},
    73: {"ko": "눈",         "en": "Snow",          "ja": "雪",         "icon": "🌨️"},
    75: {"ko": "폭설",       "en": "Heavy snow",    "ja": "大雪",       "icon": "🌨️"},
    77: {"ko": "싸락눈",     "en": "Sleet",         "ja": "みぞれ",     "icon": "🌨️"},
    80: {"ko": "소나기",     "en": "Showers",       "ja": "にわか雨",   "icon": "🌦️"},
    81: {"ko": "소나기",     "en": "Showers",       "ja": "にわか雨",   "icon": "🌦️"},
    82: {"ko": "폭우",       "en": "Heavy showers", "ja": "豪雨",       "icon": "⛈️"},
    85: {"ko": "눈보라",     "en": "Blizzard",      "ja": "吹雪",       "icon": "🌨️"},
    86: {"ko": "눈보라",     "en": "Blizzard",      "ja": "吹雪",       "icon": "🌨️"},
    95: {"ko": "뇌우",       "en": "Thunderstorm",  "ja": "雷雨",       "icon": "⛈️"},
    96: {"ko": "뇌우+우박",  "en": "Thunderstorm",  "ja": "雷雨+雹",    "icon": "⛈️"},
    99: {"ko": "뇌우+우박",  "en": "Thunderstorm",  "ja": "雷雨+雹",    "icon": "⛈️"},
}
_DEFAULT_WEATHER = {"ko": "알 수 없음", "en": "Unknown", "ja": "不明", "icon": "🌡️"}

# Timezone → approximate coordinates
TZ_COORDS = {
    "Asia/Seoul": (37.5665, 126.978),
    "Asia/Tokyo": (35.6762, 139.6503),
    "America/New_York": (40.7128, -74.006),
    "America/Los_Angeles": (34.0522, -118.2437),
    "Europe/London": (51.5074, -0.1278),
}


async def get_weather(tz: str = "Asia/Seoul", lat: float = None, lon: float = None, lang: str = "ko") -> dict | None:
    """Fetch current weather + today's forecast."""
    if not lat or not lon:
        lat, lon = TZ_COORDS.get(tz, TZ_COORDS["Asia/Seoul"])

    url = (
        f"https://api.open-meteo.com/v1/forecast?"
        f"latitude={lat}&longitude={lon}"
        f"&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m,apparent_temperature"
        f"&daily=temperature_2m_max,temperature_2m_min,weather_code"
        f"&timezone={tz}&forecast_days=1"
    )

    try:
        async with httpx.AsyncClient(timeout=5) as client:
            res = await client.get(url)
            res.raise_for_status()
            data = res.json()

        cur = data["current"]
        daily = data["daily"]
        code = cur["weather_code"]
        w = WEATHER_CODES.get(code, _DEFAULT_WEATHER)
        desc, icon = w.get(lang, w["en"]), w["icon"]
        daily_code = daily["weather_code"][0]
        dw = WEATHER_CODES.get(daily_code, _DEFAULT_WEATHER)
        daily_desc, daily_icon = dw.get(lang, dw["en"]), dw["icon"]

        weather = {
            "temp": cur["temperature_2m"],
            "feels_like": cur["apparent_temperature"],
            "humidity": cur["relative_humidity_2m"],
            "wind_speed": cur["wind_speed_10m"],
            "code": code,
            "desc": desc,
            "icon": icon,
            "high": daily["temperature_2m_max"][0],
            "low": daily["temperature_2m_min"][0],
            "daily_code": daily_code,
            "daily_desc": daily_desc,
            "daily_icon": daily_icon,
        }
        logger.info(f"[Weather] {desc} {cur['temperature_2m']}°C (high {daily['temperature_2m_max'][0]} / low {daily['temperature_2m_min'][0]})")
        return weather

    except Exception as e:
        logger.warning(f"[Weather] Failed to fetch: {e}")
        return None


def weather_to_text(w: dict) -> str:
    """Format weather for System Instruction."""
    if not w:
        return ""
    return (
        f"Current weather: {w['icon']} {w['desc']}, {w['temp']}°C (feels like {w['feels_like']}°C). "
        f"Today: high {w['high']}°C / low {w['low']}°C, humidity {w['humidity']}%, wind {w['wind_speed']}km/h."
    )
