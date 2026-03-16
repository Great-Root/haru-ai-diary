import logging
from datetime import datetime

from google import genai
from google.genai import types

from server.config import Config
from server.db import get_moments_by_date, upsert_diary
from server.user_context import get_user_id, get_timezone, get_lang

logger = logging.getLogger(__name__)


_pending_diary: dict = {}
_on_diary_generated = None
_diary_generating = False


def set_diary_callback(callback):
    global _on_diary_generated
    _on_diary_generated = callback


async def approve_diary():
    """User approved diary generation."""
    global _diary_generating
    pending = _pending_diary.pop("current", None)
    if not pending:
        logger.warning("[Tool] approve_diary: no pending diary")
        return
    if _diary_generating:
        logger.info("[Tool] approve_diary: already generating")
        return
    _diary_generating = True
    try:
        await _do_generate_diary(pending["date"], pending["user_prompt"])
    finally:
        _diary_generating = False


def reject_diary():
    """User rejected diary generation."""
    _pending_diary.pop("current", None)
    logger.info("[Tool] reject_diary: rejected")


async def generate_diary(date: str = "", user_prompt: str = "") -> dict:
    """오늘 저장된 일기 조각들을 하나의 완성된 일기로 만듭니다.
    사용자가 대화를 마칠 때나 "일기 만들어줘"라고 요청할 때 호출합니다.

    Args:
        date: 일기를 생성할 날짜 (YYYY-MM-DD). 비어있으면 오늘 날짜.

    Returns:
        생성된 일기 정보
    """
    if not date:
        try:
            date = datetime.now(__import__("zoneinfo").ZoneInfo(get_timezone())).strftime("%Y-%m-%d")
        except Exception:
            date = datetime.now().strftime("%Y-%m-%d")

    uid = get_user_id()
    logger.info(f"[Tool] generate_diary: date={date}, user={uid}")

    from server.user_context import get_lang
    lang = get_lang()

    if _diary_generating:
        msg = {"ko": "이미 일기를 작성하고 있습니다.", "en": "Diary is already being written.", "ja": "すでに日記を作成中です。"}
        return {"status": "already_generating", "message": msg.get(lang, msg["en"])}

    if "current" in _pending_diary:
        msg = {"ko": "이미 승인 대기 중입니다. 다시 호출하지 마세요.", "en": "Already waiting for approval. Do NOT call again.", "ja": "すでに承認待ちです。再度呼び出さないでください。"}
        return {"status": "already_pending", "message": msg.get(lang, msg["en"])}

    # Check if there are moments first
    moments = await get_moments_by_date(date, user_id=uid)
    if not moments:
        msg = {"ko": "오늘 저장된 순간이 없어요. 먼저 이야기를 나눠봐요!", "en": "No moments saved today. Let's talk first!", "ja": "今日の記録がありません。まずお話ししましょう！"}
        return {"error": msg.get(lang, msg["en"])}

    # Queue for approval
    _pending_diary["current"] = {"date": date, "user_prompt": user_prompt}
    msg = {
        "ko": "승인 버튼이 표시되었습니다. 버튼을 누르면 일기가 생성됩니다.",
        "en": "Approval button is shown. Diary will be written when the user taps it.",
        "ja": "承認ボタンが表示されました。ユーザーがタップすると日記が作成されます。",
    }
    return {"status": "pending_approval", "date": date, "message": msg.get(lang, msg["en"])}


async def _do_generate_diary(date: str, user_prompt: str = "") -> dict:
    uid = get_user_id()
    logger.info(f"[Tool] _do_generate_diary: date={date}, user={uid}")
    moments = await get_moments_by_date(date, user_id=uid)
    if not moments:
        logger.info(f"[Tool] generate_diary: no moments for {date}")
        return {"error": "오늘 저장된 순간이 없어요. 먼저 이야기를 나눠봐요!"}

    # Build moment summary for LLM
    moment_lines = []
    image_list = []
    for m in moments:
        time_str = m.get("time", "")
        emotion = m.get("emotion", "")
        content = m.get("content", "")
        image_url = m.get("image_url", "")
        prefix = f"[{time_str}] " if time_str else ""
        moment_lines.append(f"{prefix}{emotion} {content}")
        if image_url:
            image_list.append(f"- {content}: {image_url}")

    moments_text = "\n".join(moment_lines)
    images_text = ""
    if image_list:
        images_text = f"""

Available images (embed naturally, use only the ones that fit):
{chr(10).join(image_list)}
Image format: use markdown image syntax.
Correct: ![](/generated/123_45.webp)
Wrong: /generated/123_45.webp or [image:/generated/123_45.webp]"""

    # Language-specific instructions
    lang = get_lang()
    lang_instructions = {
        "ko": {
            "intro": f"다음은 사용자가 오늘 ({date}) 하루 동안 기록한 순간들이야.\n이 순간들을 바탕으로 사용자의 1인칭 시점에서 따뜻하고 자연스러운 일기를 한국어로 써줘.",
            "style": "사용자가 직접 쓴 것처럼 자연스러운 구어체로 (반말)",
            "weather": '날짜와 날씨 정보는 UI에 이미 표시되므로 본문에 직접 쓰지 마. 다만 날씨가 감정이나 분위기에 영향을 줬다면 자연스럽게 녹여도 됨 (예: "햇살이 따뜻해서 기분이 좋았다" OK, "2026년 3월 16일, 맑음 12도" NG)',
            "example": "😊\n오늘은 정말 좋은 하루였다...",
        },
        "en": {
            "intro": f"Here are the moments the user recorded on {date}.\nWrite a warm, natural first-person diary entry in English based on these moments.",
            "style": "Write casually as if the user wrote it themselves (informal tone)",
            "weather": 'Date and weather info are already shown in the UI, so don\'t write them directly. But if the weather affected the mood, weave it in naturally (e.g. "The sunshine made me feel great" OK, "March 16, 2026, sunny 12°C" NG)',
            "example": "😊\nToday was such a great day...",
        },
        "ja": {
            "intro": f"以下はユーザーが{date}に記録した瞬間です。\nこれらをもとに、ユーザーの一人称視点で温かく自然な日記を日本語で書いてください。",
            "style": "ユーザーが自分で書いたように自然なくだけた文体で（タメ口）",
            "weather": '日付と天気情報はUIに表示されているので本文に直接書かないで。ただし天気が気分に影響した場合は自然に織り込んでOK（例：「日差しが暖かくて気分よかった」OK、「2026年3月16日、晴れ12度」NG）',
            "example": "😊\n今日は本当にいい一日だった...",
        },
    }
    li = lang_instructions.get(lang, lang_instructions["en"])

    prompt = f"""{li["intro"]}

Rules:
- {li["style"]}
- Follow chronological order but make it flow naturally, not a rigid list
- Capture emotions and atmosphere
- Keep it short and warm
- Use emojis naturally
- {li["weather"]}

Formatting (decorate like a handwritten diary):
- **bold**: use for emotionally strong words or key phrases (e.g. **so happy**)
- ==highlight==: highlight the most memorable sentence of the day (1-2 only)
- Do NOT use markdown headings (#) or lists (-)

Important: The very first line must be a single emoji representing the day.
Example:
{li["example"]}

Today's moments:
{moments_text}{images_text}"""
    if user_prompt:
        prompt += f"\n\n사용자의 추가 요청: {user_prompt}"

    try:
        client = genai.Client(
            vertexai=True,
            project=Config.GOOGLE_CLOUD_PROJECT,
            location=Config.GOOGLE_CLOUD_LOCATION,
        )

        response = await client.aio.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
        )

        if not response.candidates or len(response.candidates) == 0:
            raise RuntimeError("No candidates in Gemini response")

        raw = response.text.strip()
        # Extract leading emoji as day's representative emotion
        lines = raw.split("\n", 1)
        diary_emotion = ""
        if lines[0].strip() and len(lines[0].strip()) <= 2:
            diary_emotion = lines[0].strip()
            diary_content = lines[1].strip() if len(lines) > 1 else ""
        else:
            diary_content = raw
        logger.info(f"[Tool] generate_diary: LLM generated {len(diary_content)} chars, emotion={diary_emotion}")

    except Exception as e:
        logger.error(f"[Tool] generate_diary: LLM failed ({e}), falling back to simple format")
        diary_emotion = moments[0].get("emotion", "📝") if moments else "📝"
        diary_content = "\n\n".join(
            f"{'[' + m.get('time', '') + '] ' if m.get('time') else ''}{m.get('emotion', '')} {m.get('content', '')}"
            for m in moments
        )

    diary = await upsert_diary(date, diary_content, user_id=uid, emotion=diary_emotion)
    logger.info(f"[Tool] generate_diary done: {len(moments)} moments → diary")
    if _on_diary_generated:
        diary_data = {k: (str(v) if hasattr(v, 'isoformat') else v) for k, v in diary.items()}
        await _on_diary_generated(diary_data)
    return diary
