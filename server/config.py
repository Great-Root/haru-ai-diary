import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))


class Config:
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GOOGLE_CLOUD_PROJECT: str = os.getenv("GOOGLE_CLOUD_PROJECT", "")
    GOOGLE_CLOUD_LOCATION: str = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
    GEMINI_LIVE_MODEL: str = os.getenv("GEMINI_LIVE_MODEL", "gemini-live-2.5-flash-native-audio")
    GEMINI_IMAGE_MODEL: str = os.getenv("GEMINI_IMAGE_MODEL", "gemini-3-pro-image-preview")
    PORT: int = int(os.getenv("PORT", "8080"))
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "./uploads")
    GENERATED_DIR: str = os.getenv("GENERATED_DIR", "./generated")
    TEST_MODE: bool = os.getenv("TEST_MODE", "false").lower() == "true"
    PG_DSN: str = os.getenv("PG_DSN", "postgresql://haru:haru2026@localhost:5432/harudb")
    DEBUG_AUDIO: bool = os.getenv("DEBUG_AUDIO", "false").lower() == "true"
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
