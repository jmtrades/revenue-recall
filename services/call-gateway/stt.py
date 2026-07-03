"""Speech-to-text via faster-whisper — local, open model, audio stays on your box."""
from __future__ import annotations

from config import WHISPER_MODEL, WHISPER_DEVICE, TELEPHONY_SAMPLE_RATE

_model = None


def _get_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel

        # int8 keeps it fast on CPU; use device="cuda" for GPU concurrency.
        _model = WhisperModel(WHISPER_MODEL, device=WHISPER_DEVICE, compute_type="int8")
    return _model


def _resample(x: "np.ndarray", src: int, dst: int) -> "np.ndarray":
    import numpy as np

    if src == dst or len(x) == 0:
        return x
    n = int(round(len(x) * dst / src))
    if n <= 0:
        return x
    idx = np.linspace(0, len(x) - 1, n)
    return np.interp(idx, np.arange(len(x)), x).astype(np.float32)


def normalize_lang(code) -> str:
    """Coerce an app-supplied language hint to a safe ISO 639-1 code for Whisper.
    Accepts "es", "es-MX", "ES"; anything that doesn't look like a language code
    falls back to English rather than erroring mid-call."""
    if not isinstance(code, str):
        return "en"
    short = code.strip().lower().split("-")[0].split("_")[0]
    return short if len(short) == 2 and short.isalpha() else "en"


def transcribe(pcm_s16le: bytes, sample_rate: int = TELEPHONY_SAMPLE_RATE, language: str = "en") -> str:
    """Transcribe one mono PCM s16le utterance to text. Whisper wants 16 kHz float.
    `language` pins Whisper to the call's language (from the app's org/contact
    setting) — auto-detection on short telephony utterances is unreliable."""
    if not pcm_s16le:
        return ""
    import numpy as np

    audio = np.frombuffer(pcm_s16le, dtype=np.int16).astype(np.float32) / 32768.0
    audio = _resample(audio, sample_rate, 16000)
    segments, _ = _get_model().transcribe(audio, language=normalize_lang(language), vad_filter=True)
    return " ".join(s.text.strip() for s in segments).strip()
