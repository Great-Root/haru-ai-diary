"""Seed demo data for hackathon reviewers.

Usage: python scripts/seed_demo.py
"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server.db import init_db, get_pool, update_user_profile
from server.rag import index_moment

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

DEMO_UID = "demo"

# Dynamic dates based on user's timezone (default KST)
def _day(offset, tz="Asia/Seoul"):
    """Return date string for today + offset in given timezone."""
    now = datetime.now(ZoneInfo(tz))
    return (now + timedelta(days=offset)).strftime("%Y-%m-%d")

PROFILE = {
    "name": "민수",
    "gender": "male",
    "age_group": "20s",
    "occupation": "개발자",
    "interests": "코딩, 운동, 맛집 탐방, 여행",
    "personality": "활발하고 긍정적",
    "relationships": "여자친구: 수연, 대학 동기: 민준/지훈/서연",
}

# (day_offset, time, content_ko, content_en, content_ja, emotion)
# day_offset: -5 = 5 days ago, 0 = today
MOMENTS = [
    # Day -5
    (-5, "08:00", "출근길에 비가 와서 우산 없이 뛰었다", "Got caught in the rain on my way to work without an umbrella", "出勤途中に雨が降ってきて傘なしで走った", "🌧️"),
    (-5, "09:30", "팀 미팅에서 새 프로젝트 킥오프했다. 흥미로운 주제!", "Kicked off a new project at the team meeting. Interesting topic!", "チームミーティングで新プロジェクトがキックオフ。面白いテーマ！", "💡"),
    (-5, "12:00", "회사 근처 새로 생긴 베트남 쌀국수집에서 점심", "Had lunch at a new Vietnamese pho place near the office", "会社の近くに新しくできたベトナムのフォー屋でランチ", "🍜"),
    (-5, "17:00", "코드 리뷰 받았는데 좋은 피드백 많이 받았다", "Got great feedback from my code review today", "コードレビューでいいフィードバックをたくさんもらった", "💪"),
    (-5, "21:00", "퇴근하고 헬스장에서 스쿼트 무게 올렸다!", "Hit the gym after work and increased my squat weight!", "退勤後にジムでスクワットの重量を上げた！", "🏋️"),

    # Day -4
    (-4, "08:30", "오늘 수연이 만나는 날이라 아침부터 기분 좋다", "Meeting Suyeon today so I've been in a good mood since morning", "今日はスヨンに会う日だから朝から気分がいい", "🥰"),
    (-4, "12:30", "성수동 파스타집에서 점심. 수연이가 맛있다고 좋아했다", "Had pasta in Seongsu-dong. Suyeon loved it", "聖水洞のパスタ屋でランチ。スヨンが美味しいって喜んでた", "🍝"),
    (-4, "14:00", "팝업스토어에서 귀여운 인형 하나 사줬다", "Bought her a cute stuffed animal at a pop-up store", "ポップアップストアでかわいいぬいぐるみを買ってあげた", "🧸"),
    (-4, "16:00", "한강 산책하면서 아이스크림 먹었다. 날씨 완벽", "Walked along the Han River eating ice cream. Perfect weather", "漢江を散歩しながらアイスを食べた。天気最高", "🍦"),
    (-4, "22:00", "집에 돌아왔는데 벌써 보고싶다", "Back home and I already miss her", "家に帰ってきたけどもう会いたい", "💕"),

    # Day -3
    (-3, "07:30", "알람 3번 울려서 겨우 일어남", "Barely woke up after the alarm went off three times", "アラーム3回鳴ってやっと起きた", "😫"),
    (-3, "10:00", "갑자기 긴급 버그 리포트가 들어왔다", "Sudden urgent bug report came in", "突然緊急バグレポートが来た", "🐛"),
    (-3, "12:00", "밥 먹을 시간도 없어서 편의점 삼각김밥으로 때웠다", "No time for a proper meal, grabbed a convenience store rice ball", "ご飯食べる時間もなくてコンビニおにぎりで済ませた", "😢"),
    (-3, "16:00", "오후에 겨우 해결. 원인은 타임존 버그", "Finally fixed it in the afternoon. It was a timezone bug", "午後にやっと解決。原因はタイムゾーンのバグだった", "🤔"),
    (-3, "19:00", "퇴근하고 치킨 시켜먹으면서 넷플릭스 봤다", "Ordered chicken after work and watched Netflix", "退勤後にチキン頼んでネットフリックス見た", "🍗"),

    # Day -2
    (-2, "06:00", "해커톤 시작! 새벽에 일어났다. 긴장되고 설렌다", "Hackathon starts! Woke up at dawn. Nervous and excited", "ハッカソン開始！早朝に起きた。緊張するけどワクワク", "🔥"),
    (-2, "09:00", "프로젝트 구조 잡고 첫 커밋", "Set up project structure and made first commit", "プロジェクト構成を決めてファーストコミット", "💻"),
    (-2, "15:00", "음성 대화 기능이 처음으로 동작했다!", "Voice conversation feature worked for the first time!", "音声会話機能が初めて動いた！", "🎉"),
    (-2, "18:00", "일러스트 생성 기능도 붙였다", "Also added the illustration generation feature", "イラスト生成機能もつけた", "🎨"),
    (-2, "23:00", "오늘 엄청 많이 했다. 내일도 파이팅", "Got so much done today. Let's go tomorrow too", "今日めちゃくちゃ頑張った。明日もファイト", "💪"),

    # Day -1 (yesterday)
    (-1, "08:30", "아침에 창밖을 봤는데 벚꽃이 피기 시작했다", "Looked outside this morning and cherry blossoms are starting to bloom", "朝窓の外を見たら桜が咲き始めてた", "🌸"),
    (-1, "12:30", "점심에 민준이랑 돈까스 먹었는데 꿀맛", "Had tonkatsu with Minjun for lunch. So good", "ランチにミンジュンとトンカツ食べた。最高", "🍽️"),
    (-1, "14:00", "공원에서 산책하면서 음악 들었다", "Took a walk in the park listening to music", "公園を散歩しながら音楽を聴いた", "🎵"),
    (-1, "18:00", "수연이랑 영상통화. 다음 주에 만나기로!", "Video called Suyeon. We're meeting next week!", "スヨンとビデオ通話。来週会うことに！", "🥰"),
    (-1, "21:00", "알차게 보낸 하루. 기분 좋다", "A fulfilling day. Feeling good", "充実した一日。気分がいい", "😊"),

    # Day 0 (today) — 8 moments for carousel scroll
    (0, "08:00", "아침에 일어나서 스트레칭하고 하루 시작", "Woke up, did some stretching to start the day", "朝起きてストレッチして一日スタート", "🌅"),
    (0, "10:00", "늦잠 자고 브런치로 프렌치토스트 해먹었다", "Slept in and made French toast for brunch", "寝坊してブランチにフレンチトースト作った", "🍞"),
    (0, "11:30", "카페에서 아메리카노 마시면서 코딩", "Coding at a cafe with an americano", "カフェでアメリカーノ飲みながらコーディング", "☕"),
    (0, "13:00", "해커톤 이미지 생성 기능 고도화 작업", "Worked on improving the hackathon image generation feature", "ハッカソンの画像生成機能の改善作業", "💻"),
    (0, "15:00", "산책하면서 머리 좀 식혔다", "Took a walk to clear my head", "散歩して頭をリフレッシュ", "🚶"),
    (0, "16:00", "지훈이랑 카페에서 만나서 근황 얘기했다", "Met Jihun at a cafe and caught up", "ジフンとカフェで会って近況を話した", "☕"),
    (0, "19:00", "저녁에 엄마랑 통화했다. 다음 달에 집에 가기로", "Called mom in the evening. Going home next month", "夜お母さんと電話した。来月実家に帰ることに", "🥰"),
    (0, "22:00", "해커톤 마무리 작업하면서 하루 정리", "Wrapping up hackathon work and reflecting on the day", "ハッカソンの仕上げ作業をしながら一日を振り返り", "📝"),
]

DIARIES = {
    -5: {
        "ko": "🌧️\n아 오늘 출근길에 갑자기 비 와서 **졸라 뛰었다** ㅋㅋ 우산이 없었어.. 근데 회사 가니까 새 프로젝트 킥오프 미팅이 있었는데 주제가 꽤 흥미로웠어. 점심은 새로 생긴 쌀국수집에서 먹었는데 괜찮더라. ![](/demo/demo-pho.webp) 오후에 코드 리뷰 받았는데 **피드백이 좋아서 뿌듯했고**, 퇴근하고 헬스가서 스쿼트 무게도 올렸다! ==비 맞은 건 좀 짜증났지만 전체적으로 괜찮은 하루== 😊",
        "en": "🌧️\nGot **totally soaked** on my way to work today lol, didn't have an umbrella. But at work we had a new project kickoff and the topic seems really interesting! Had lunch at a new pho place nearby, it was pretty good. ![](/demo/demo-pho.webp) Got some **great feedback** during code review in the afternoon which felt awesome, then hit the gym after work and managed to increase my squat weight! ==Getting rained on sucked but overall a decent day== 😊",
        "ja": "🌧️\n今日出勤途中にいきなり雨降ってきて**マジで走った**わ笑 傘なかったし。でも会社行ったら新プロジェクトのキックオフミーティングがあって、テーマがなかなか面白かった。ランチは新しくできたフォー屋で食べたけど結構よかった。 ![](/demo/demo-pho.webp) 午後コードレビューで**いいフィードバック**もらえて嬉しかったし、退勤後ジム行ってスクワットの重量も上げた！==雨はちょっとムカついたけど全体的にいい一日だった== 😊",
        "emotion": "🌧️",
    },
    -4: {
        "ko": "💕\n오늘 수연이 만나는 날이라 아침부터 **텐션 업!** 반차 쓰고 성수동 갔는데 파스타 진짜 맛있었다. ![](/demo/demo-pasta.webp) 수연이도 좋아해서 다행이야. 팝업스토어에서 귀여운 인형 사줬더니 엄청 좋아하더라 ㅋㅋ 한강 산책하면서 아이스크림 먹었는데 ==날씨가 진짜 완벽했어.== ![](/demo/demo-hangang.webp) 집에 와서 벌써 **보고싶다**... 다음에 또 만나자 💕",
        "en": "💕\nToday was date day with Suyeon so I was **pumped since morning!** Took half day off and went to Seongsu-dong. The pasta was amazing and she loved it too. ![](/demo/demo-pasta.webp) Bought her a cute stuffed animal at a pop-up store and she was so happy haha. ==Walked along the Han River eating ice cream in perfect weather.== ![](/demo/demo-hangang.webp) Back home now and I already **miss her**... see you soon 💕",
        "ja": "💕\n今日はスヨンに会う日だから朝から**テンション上がってた！** 半休取って聖水洞行ったけどパスタまじで美味しかった。 ![](/demo/demo-pasta.webp) ポップアップストアでかわいいぬいぐるみ買ってあげたらめっちゃ喜んでた笑 ==漢江散歩しながらアイス食べたけど天気がマジで最高だった。== ![](/demo/demo-hangang.webp) 家帰ってきたけど**もう会いたい**... 💕",
        "emotion": "💕",
    },
    -3: {
        "ko": "😮‍💨\n오늘 진짜 힘들었다. 어제 늦게 자서 알람 3번 만에 겨우 일어났는데 출근하자마자 **긴급 버그 리포트** 들어옴. 점심 먹을 시간도 없어서 편의점 삼각김밥으로 때웠어 ㅠㅠ 오후에 겨우 해결했는데 원인이 **타임존 버그**라니... ==퇴근하고 치킨 시켜먹으면서 넷플릭스 봤다. 이런 날은 치킨이 최고야== 🍗 ![](/demo/demo-chicken.webp)",
        "en": "😮‍💨\nUgh... today was rough. Barely woke up after three alarms. First thing at work, **urgent bug report** drops. Didn't even have time for lunch so I just grabbed a rice ball. Finally fixed it — the cause was a **timezone bug**... seriously. ==Ordered chicken after work and watched Netflix. Chicken is the best cure for days like this== 🍗 ![](/demo/demo-chicken.webp)",
        "ja": "😮‍💨\nはぁ...今日マジでしんどかった。出勤したら即**緊急バグレポート**。昼ごはん食べる時間もなくてコンビニおにぎりで済ませた😢 午後にやっと解決したけど原因が**タイムゾーンのバグ**って...マジか。==退勤後チキン頼んでネットフリックス見た。こういう日はチキンが最高== 🍗 ![](/demo/demo-chicken.webp)",
        "emotion": "😮‍💨",
    },
    -2: {
        "ko": "🔥\n**해커톤 시작!!** 새벽 6시에 일어났는데 긴장되면서도 설렜다. 프로젝트 구조 잡고 첫 커밋하고, 컵라면 먹으면서 코딩하는 게 해커톤 느낌 제대로 ㅋㅋ ==음성 대화 기능이 처음 동작했을 때 진짜 소름돋았어!!== ![](/demo/demo-hackathon.webp) 일러스트 생성 기능도 붙이고 오늘 진짜 엄청 많이 했다. 피곤하지만 **뿌듯해**. 내일도 파이팅! 💪",
        "en": "🔥\n**Hackathon day!!** Woke up at 6am, nervous but excited. Set up the project structure, made the first commit, coded while eating cup noodles — felt like a real hackathon lol. ==When the voice conversation feature worked for the first time I literally got chills!!== ![](/demo/demo-hackathon.webp) Also added the illustration generation feature. Tired but **so proud**. Let's go tomorrow too! 💪",
        "ja": "🔥\n**ハッカソン開始！！** 朝6時に起きたけど緊張しつつもワクワクしてた。プロジェクト構成決めてファーストコミット、カップ麺食べながらコーディングするのがハッカソンって感じ笑 ==音声会話機能が初めて動いた時マジで鳥肌立った！！== ![](/demo/demo-hackathon.webp) 今日ほんとにめちゃくちゃやった。疲れたけど**達成感すごい**。明日もファイト！💪",
        "emotion": "🔥",
    },
    -1: {
        "ko": "🌸\n아침에 일어나서 창밖 봤더니 **벚꽃이 피기 시작했다** 🌸 ![](/demo/demo-cafe.webp) 카페에서 아메리카노 마시면서 여유롭게 시작한 하루. 점심에 민준이랑 돈까스 먹었는데 꿀맛이었어! 오후에 공원 산책하면서 음악 듣는데 날씨가 너무 좋았다. ![](/demo/demo-park.webp) ==저녁에 수연이랑 영상통화 했는데 다음 주에 만나기로 했다!== 오늘 진짜 **알차게** 보낸 것 같아서 기분이 좋다 😊",
        "en": "🌸\nLooked out the window this morning and **the cherry blossoms are starting to bloom** 🌸 ![](/demo/demo-cafe.webp) Started the day chilling at a cafe with an americano. Had tonkatsu with Minjun for lunch and it was incredible! Took a walk in the park in the afternoon. ![](/demo/demo-park.webp) ==Video called Suyeon in the evening and we're meeting next week!== Feel like today was really **well spent** 😊",
        "ja": "🌸\n朝起きて窓の外見たら**桜が咲き始めてた** 🌸 ![](/demo/demo-cafe.webp) カフェでアメリカーノ飲みながらゆったりスタート。ランチはミンジュンとトンカツ食べたけど最高だった！午後は公園散歩。 ![](/demo/demo-park.webp) ==夜スヨンとビデオ通話して来週会うことに！== 今日は本当に**充実した**一日だった気がする 😊",
        "emotion": "🌸",
    },
    0: {
        "ko": "🥰\n주말이라 늦잠 자고 브런치로 **프렌치토스트** 만들어 먹었다 🍞 ![](/demo/demo-toast.webp) 오후에는 해커톤 이미지 생성 기능을 좀 더 다듬었다. 지훈이랑 카페에서 만나서 근황 얘기도 하고 좋았어. ==저녁에 엄마랑 통화했는데 다음 달에 집에 가기로 했다.== 오랜만에 엄마 밥 먹을 생각하니까 벌써 **기대된다** 🥰",
        "en": "🥰\nSlept in since it's the weekend and made **French toast** for brunch 🍞 ![](/demo/demo-toast.webp) Spent the afternoon polishing the hackathon image generation feature. Met up with Jihun at a cafe to catch up which was nice. ==Called mom in the evening and we decided I'll visit home next month.== Already **excited** thinking about her cooking 🥰",
        "ja": "🥰\n週末だから寝坊してブランチに**フレンチトースト**作った 🍞 ![](/demo/demo-toast.webp) 午後はハッカソンの画像生成機能をもうちょっと磨いた。==夜お母さんと電話して来月実家に帰ることに。== お母さんのご飯食べられると思うともう**ワクワク** 🥰",
        "emotion": "🥰",
    },
}

# Image mapping: (day_offset, time) → (image_url, ref_photo)
IMAGES = {
    (-5, "12:00"): ("/demo/demo-pho.webp", "/demo/demo-ramen-photo.webp"),
    (-4, "12:30"): ("/demo/demo-pasta.webp", ""),
    (-4, "16:00"): ("/demo/demo-hangang.webp", ""),
    (-3, "19:00"): ("/demo/demo-chicken.webp", ""),
    (-2, "15:00"): ("/demo/demo-hackathon.webp", ""),
    (-1, "08:30"): ("/demo/demo-cafe.webp", "/demo/demo-latte-photo.webp"),
    (-1, "14:00"): ("/demo/demo-park.webp", ""),
    (-1, "12:30"): ("/demo/demo-tonkatsu-illust.webp", "/demo/demo-tonkatsu-photo.webp"),
    (0, "10:00"): ("/demo/demo-toast.webp", ""),
    (0, "16:00"): ("/demo/demo-latte-illust.webp", "/demo/demo-latte-photo.webp"),
}

# Weather data per day offset — desc uses weather code, rendered by client via WEATHER_CODES
WEATHERS = {
    -5: {"temp": 6.2, "feels_like": 3.1, "humidity": 78, "wind_speed": 4.5, "code": 61, "desc": "Rain", "icon": "🌧️", "high": 9.0, "low": 3.0, "daily_code": 61, "daily_desc": "Rain", "daily_icon": "🌧️"},
    -4: {"temp": 14.5, "feels_like": 13.8, "humidity": 42, "wind_speed": 1.2, "code": 0, "desc": "Clear sky", "icon": "☀️", "high": 17.0, "low": 8.0, "daily_code": 0, "daily_desc": "Clear sky", "daily_icon": "☀️"},
    -3: {"temp": 11.0, "feels_like": 9.5, "humidity": 55, "wind_speed": 2.8, "code": 3, "desc": "Overcast", "icon": "☁️", "high": 13.0, "low": 5.0, "daily_code": 3, "daily_desc": "Overcast", "daily_icon": "☁️"},
    -2: {"temp": 9.0, "feels_like": 7.2, "humidity": 50, "wind_speed": 1.5, "code": 1, "desc": "Mainly clear", "icon": "🌤️", "high": 12.0, "low": 4.0, "daily_code": 1, "daily_desc": "Mainly clear", "daily_icon": "🌤️"},
    -1: {"temp": 15.8, "feels_like": 15.0, "humidity": 38, "wind_speed": 0.8, "code": 0, "desc": "Clear sky", "icon": "☀️", "high": 19.0, "low": 9.0, "daily_code": 0, "daily_desc": "Clear sky", "daily_icon": "☀️"},
    0: {"temp": 13.2, "feels_like": 12.5, "humidity": 45, "wind_speed": 1.0, "code": 1, "desc": "Mainly clear", "icon": "🌤️", "high": 16.0, "low": 7.0, "daily_code": 2, "daily_desc": "Partly cloudy", "daily_icon": "⛅"},
}


async def seed():
    await init_db()

    pool = await get_pool()
    async with pool.acquire() as conn:
        # Clean existing demo data
        await conn.execute("DELETE FROM moment_embeddings WHERE user_id = $1", DEMO_UID)
        await conn.execute("DELETE FROM moments WHERE user_id = $1", DEMO_UID)
        await conn.execute("DELETE FROM diaries WHERE user_id = $1", DEMO_UID)
        await conn.execute("DELETE FROM user_profiles WHERE user_id = $1", DEMO_UID)

        # Insert moments with weather + images
        import json
        for day_offset, time_str, content_ko, content_en, content_ja, emotion in MOMENTS:
            date = _day(day_offset)
            image_url, ref_photo = IMAGES.get((day_offset, time_str), ("", ""))
            weather = WEATHERS.get(day_offset, WEATHERS[0])
            await conn.execute(
                "INSERT INTO moments (user_id, date, time, content, emotion, weather, image_url, ref_photo) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
                DEMO_UID, date, time_str, content_ko, emotion, json.dumps(weather), image_url, ref_photo,
            )

        # Insert diaries with emotion
        for day_offset, langs in DIARIES.items():
            date = _day(day_offset)
            emotion = langs.get("emotion", "📝")
            await conn.execute(
                "INSERT INTO diaries (user_id, date, content, emotion) VALUES ($1, $2, $3, $4)",
                DEMO_UID, date, langs["ko"], emotion,
            )

    # User profile
    await update_user_profile(DEMO_UID, PROFILE)

    print(f"✓ Demo data seeded for uid='{DEMO_UID}'")
    print(f"  - {len(MOMENTS)} moments ({len(set(m[0] for m in MOMENTS))} days)")
    print(f"  - {len(DIARIES)} diaries")
    print(f"  - Profile: {PROFILE['name']} ({PROFILE['gender']}, {PROFILE['age_group']})")

    # Generate embeddings
    print(f"\n  Generating embeddings (Vertex AI → pgvector)...")
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, date, time, content, emotion FROM moments WHERE user_id = $1 ORDER BY date, time",
            DEMO_UID,
        )
        db_moments = [dict(row) for row in rows]

    indexed = 0
    for m in db_moments:
        try:
            await index_moment(m, user_id=DEMO_UID)
            indexed += 1
            if indexed % 10 == 0:
                print(f"  [{indexed}/{len(db_moments)}]...")
        except Exception as e:
            print(f"  [err] {m['content'][:30]}... — {e}")

    print(f"\n✓ Embeddings: {indexed}/{len(db_moments)}")
    print(f"\n  Demo: https://34.22.82.6.nip.io (click 'Try demo')")


if __name__ == "__main__":
    asyncio.run(seed())
