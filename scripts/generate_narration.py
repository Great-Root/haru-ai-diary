"""Generate narration audio for demo video using Google Cloud TTS."""
import os
from google.cloud import texttospeech

client = texttospeech.TextToSpeechClient()

# Haru's voice — calm, warm female
voice = texttospeech.VoiceSelectionParams(
    language_code="en-US",
    name="en-US-Journey-F",  # Natural female voice, calm tone
)

audio_config = texttospeech.AudioConfig(
    audio_encoding=texttospeech.AudioEncoding.MP3,
    speaking_rate=0.9,  # Calm and gentle pace
)

NARRATIONS = {
    # 01 — 문제 정의: 매일 기억은 흐려지고, 일기 쓸 시간은 없다
    "01-problem": (
        "Every day is full of moments worth remembering. "
        "But by the end of the day, the details start to fade. "
        "We all want to keep a diary... but who has the time to write one?"
        # 매일은 기억할 만한 순간들로 가득하지만,
        # 하루가 끝나면 그 디테일은 흐려진다.
        # 누구나 일기를 쓰고 싶지만... 누가 그럴 시간이 있을까?
    ),
    # 02 — 하루 소개: AI 음성 일기, 말만 하면 된다
    "02-intro": (
        "Meet Hah-ru. Your AI voice diary. "
        "Just talk about your day, and Hah-ru takes care of the rest."
        # 하루를 소개합니다. 당신의 AI 음성 일기장.
        # 그냥 하루에 대해 이야기하세요. 나머지는 하루가 알아서 해요.
    ),
    # 03 — 아키텍처: Gemini Live API + ADK + Vertex AI + GCE
    "03-architecture": (
        "Haru is powered by Gemini Live API through Google's Agent Development Kit, "
        "with Vertex AI for image generation, embeddings, and diary writing. "
        "Everything runs on Google Cloud Compute Engine with auto-TLS."
        # 하루는 Google ADK를 통한 Gemini Live API로 구동되며,
        # 이미지 생성, 임베딩, 일기 작성에 Vertex AI를 사용합니다.
        # 모든 것이 자동 TLS가 적용된 Google Cloud Compute Engine에서 실행됩니다.
    ),
    # 04 — 음성 대화 데모: 친구처럼 대화하면 자동으로 모먼트 저장
    "04-demo-voice": (
        "Let me show you. I'll just talk to Haru about my day, like chatting with a friend. "
        "Notice how Haru automatically saves key moments as diary fragments — "
        "complete with emotions, timestamps, and even the current weather. "
        "All without lifting a finger."
        # 보여드릴게요. 친구와 수다 떨듯이 하루에게 이야기하면,
        # 하루가 핵심 순간들을 자동으로 일기 조각으로 저장해요.
        # 감정, 시간, 현재 날씨까지 — 손가락 하나 까딱 안 해도요.
    ),
    # 04b — 홈 화면: 오늘의 순간들이 필름릴처럼 스크롤
    "04b-demo-home": (
        "Back on the home screen, today's moments scroll through like a film reel. "
        "Each one is a piece of my day, ready to become part of tonight's diary."
        # 홈 화면으로 돌아오면, 오늘의 순간들이 필름릴처럼 흘러가요.
        # 각각이 오늘 하루의 조각이고, 오늘 밤 일기의 일부가 될 거예요.
    ),
    # 05 — 이미지 생성: 사진 업로드 → HITL 승인 → 수채화 일러스트
    "05-demo-image": (
        "I can share a photo and ask Haru to turn it into an illustration. "
        "Haru asks for my approval first — this is our Human in the Loop design. "
        "No expensive API calls happen without your say. "
        "The generated illustration uses my avatar as a character reference, "
        "and the original photo is kept alongside for comparison."
        # 사진을 공유하고 하루에게 일러스트로 바꿔달라고 할 수 있어요.
        # 하루는 먼저 승인을 요청해요 — 이게 우리의 Human in the Loop 디자인.
        # 당신의 허락 없이는 비싼 API 호출이 일어나지 않아요.
        # 생성된 일러스트는 내 아바타를 캐릭터 참조로 사용하고,
        # 원본 사진도 비교를 위해 함께 보관돼요.
    ),
    # 06 — 일기 생성: HITL 승인 → 필기체 + 볼드 + 하이라이트 + 일러스트 임베딩
    "06-demo-diary": (
        "At the end of the day, I ask Haru to write my diary. "
        "Again, Haru waits for my approval before generating. "
        "The result is a beautifully formatted diary — bold highlights for key moments, "
        "marker effects for the most memorable lines, "
        "and illustrations woven right into the text. "
        "All rendered in a handwritten notebook style with lined paper."
        # 하루가 끝나면, 하루에게 일기를 써달라고 해요.
        # 역시 하루는 생성 전에 승인을 기다려요.
        # 결과는 아름답게 서식이 적용된 일기 — 핵심 순간에 볼드,
        # 가장 기억에 남는 문장에 형광펜 효과,
        # 그리고 일러스트가 텍스트 사이에 자연스럽게 녹아들어요.
        # 줄 노트 위에 필기체로 렌더링됩니다.
    ),
    # 07 — 캘린더: 날짜별 이모지/날씨, 모먼트/일러스트/일기 탐색
    "07-demo-calendar": (
        "The diary tab shows my complete history. "
        "A calendar view with emoji indicators and weather for each day. "
        "Tap any date to see that day's moments, illustrations, and diary entry."
        # 다이어리 탭에서 전체 기록을 볼 수 있어요.
        # 날짜별 이모지와 날씨가 표시된 캘린더 뷰.
        # 아무 날짜나 탭하면 그날의 순간, 일러스트, 일기를 볼 수 있어요.
    ),
    # 07b — PWA: 모바일 최적화, 홈 화면 설치
    "07b-demo-mobile": (
        "Haru is a Progressive Web App, fully optimized for mobile. "
        "Install it on your home screen and it feels just like a native app."
        # 하루는 PWA로 모바일에 완전히 최적화되어 있어요.
        # 홈 화면에 설치하면 네이티브 앱처럼 느껴져요.
    ),
    # 08 — 다국어: 한/영/일, 대화 중 언어 전환, 모먼트/일기도 해당 언어로
    "08-demo-multilang": (
        "Haru speaks your language. Korean, English, and Japanese are all supported. "
        "You can even switch languages mid-conversation, and Haru follows naturally. "
        "Moments and diary entries are written in whatever language you're speaking."
        # 하루는 당신의 언어를 이해해요. 한국어, 영어, 일본어 모두 지원.
        # 대화 중에 언어를 바꿔도 하루가 자연스럽게 따라와요.
        # 모먼트와 일기도 당신이 말하는 언어로 작성돼요.
    ),
    # 09 — 기억 검색: RRF 하이브리드 검색으로 과거 회상
    "09-demo-rag": (
        "Haru remembers everything you've shared. "
        "Ask about a specific day, and Haru pulls up that day's moments. "
        "Or ask something like — who did I have barbecue with? — "
        "and Haru uses hybrid search, combining keyword matching and semantic similarity, "
        "to recall that it was with Suyeon last week."
        # 하루는 당신이 공유한 모든 걸 기억해요.
        # 특정 날짜를 물으면 그날의 모먼트를 가져오고,
        # "삼겹살 누구랑 먹었었지?" 같은 질문에는
        # RAG 메모리로 이야기를 검색해서 지난주에 수연이랑 먹었다고 알려줘요.
    ),
    # 10 — 배포: GCE 서울 리전 + Caddy + auto-TLS
    "10-deploy": (
        "Haru is live on Google Cloud Compute Engine in Seoul, "
        "with Caddy handling HTTPS and automatic TLS certificates."
        # 하루는 서울 리전 Google Cloud Compute Engine에서 라이브 중이고,
        # Caddy가 HTTPS와 자동 TLS 인증서를 처리해요.
    ),
    # 10b — 기술 하이라이트 6가지
    "10b-highlights": (
        "Here are some technical highlights. "
        "Gemini Live API for real-time bidirectional voice streaming through ADK. "
        "Human in the Loop — a floating approval UI that prevents unwanted API calls. "
        "Canvas-based chromakey rendering for the mascot animation. "
        "Transparent session resumption for seamless reconnection. "
        "Hybrid RAG memory — keyword plus semantic search merged via Reciprocal Rank Fusion. "
        "And a rich diary renderer with recursive formatting and notebook-style CSS."
        # 기술 하이라이트입니다.
        # ADK를 통한 Gemini Live API로 실시간 양방향 음성 스트리밍.
        # Human in the Loop — 비싼 API 호출을 방지하는 플로팅 승인 UI.
        # Canvas 기반 크로마키로 마스코트 애니메이션 렌더링.
        # 투명한 세션 재개로 끊김 없는 재연결.
        # pgvector를 활용한 RAG 메모리로 세션 간 기억 검색.
        # 재귀적 서식 파싱과 노트북 CSS를 적용한 리치 일기 렌더러.
    ),
    # 10c — 체험 안내: 데모 버튼으로 바로 체험 가능
    "10c-tryit": (
        "Want to try it yourself? Visit the live demo and tap Try Demo "
        "to explore with sample data right away. "
        "Or start fresh and talk to Hah-ru about your day."
        # 직접 해보고 싶으세요? 라이브 데모에 접속해서 "데모 체험하기"를 누르면
        # 샘플 데이터로 바로 둘러볼 수 있어요.
        # 아니면 처음부터 시작해서 하루에게 오늘 하루를 이야기해보세요.
    ),
    # 11 — 아웃트로
    "11-outro": (
        "Hah-ru. Just talk about your day."
        # 하루. 그냥 오늘 하루에 대해 이야기하세요.
    ),
}

os.makedirs("docs/narration", exist_ok=True)

for name, text in NARRATIONS.items():
    print(f"Generating {name}...")
    input_text = texttospeech.SynthesisInput(text=text)
    response = client.synthesize_speech(
        input=input_text, voice=voice, audio_config=audio_config
    )
    path = f"docs/narration/{name}.mp3"
    with open(path, "wb") as f:
        f.write(response.audio_content)
    print(f"  -> {path} ({len(response.audio_content) // 1024}KB)")

print("\nDone! All narration files in docs/narration/")
