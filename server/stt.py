"""Google Cloud Speech-to-Text V2 streaming transcription."""

import asyncio
import logging
import queue
import threading

from google.cloud.speech_v2 import SpeechClient
from google.cloud.speech_v2.types import cloud_speech as cloud_speech_types

from server.config import Config

logger = logging.getLogger(__name__)


class SpeechStreamer:
    """Streams PCM audio to Cloud STT and yields transcription results."""

    def __init__(self, on_transcript):
        """
        Args:
            on_transcript: async callback(text: str, is_final: bool)
        """
        self._on_transcript = on_transcript
        self._audio_queue: queue.Queue[bytes | None] = queue.Queue()
        self._thread: threading.Thread | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._running = False

    def start(self, loop: asyncio.AbstractEventLoop):
        """Start the STT streaming thread."""
        self._loop = loop
        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def add_audio(self, chunk: bytes):
        """Add a PCM audio chunk to the queue."""
        if self._running:
            self._audio_queue.put(chunk)

    def stop(self):
        """Stop the STT stream."""
        self._running = False
        self._audio_queue.put(None)
        if self._thread:
            self._thread.join(timeout=5)
            self._thread = None

    def _build_config_request(self) -> cloud_speech_types.StreamingRecognizeRequest:
        recognition_config = cloud_speech_types.RecognitionConfig(
            explicit_decoding_config=cloud_speech_types.ExplicitDecodingConfig(
                encoding=cloud_speech_types.ExplicitDecodingConfig.AudioEncoding.LINEAR16,
                sample_rate_hertz=16000,
                audio_channel_count=1,
            ),
            language_codes=["ko-KR"],
            model="latest_long",
        )
        streaming_config = cloud_speech_types.StreamingRecognitionConfig(
            config=recognition_config,
            streaming_features=cloud_speech_types.StreamingRecognitionFeatures(
                interim_results=True,
            ),
        )
        return cloud_speech_types.StreamingRecognizeRequest(
            recognizer=f"projects/{Config.GOOGLE_CLOUD_PROJECT}/locations/global/recognizers/_",
            streaming_config=streaming_config,
        )

    def _request_generator(self):
        yield self._build_config_request()
        while self._running:
            try:
                chunk = self._audio_queue.get(timeout=0.1)
            except queue.Empty:
                continue
            if chunk is None:
                return
            yield cloud_speech_types.StreamingRecognizeRequest(audio=chunk)

    def _run(self):
        client = SpeechClient()
        while self._running:
            try:
                # Drain stale chunks before starting new stream
                while not self._audio_queue.empty():
                    try:
                        self._audio_queue.get_nowait()
                    except queue.Empty:
                        break

                logger.info("[STT] Stream starting")
                responses = client.streaming_recognize(requests=self._request_generator())
                for response in responses:
                    if not self._running:
                        return
                    for result in response.results:
                        if result.alternatives:
                            text = result.alternatives[0].transcript
                            is_final = result.is_final
                            if text and self._loop:
                                asyncio.run_coroutine_threadsafe(
                                    self._on_transcript(text, is_final),
                                    self._loop,
                                )
            except Exception as e:
                if not self._running:
                    return
                logger.warning(f"[STT] Stream reconnecting: {e}")
        logger.info("[STT] Stream ended")
