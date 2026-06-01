"""Speech-to-text via faster-whisper — local, open model, audio stays on your box."""
import numpy as np

from config import WHISPER_MODEL, WHISPER_DEVICE, TELEPHONY_SAMPLE_RATE

_model = None


def _get_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel

        # int8 keeps it fast on CPU; use device="cuda" for GPU concurrency.
        _model = WhisperModel(WHISPER_MODEL, device=WHISPER_DEVICE, compute_type="int8")
    return _model


def _resample(x: np.ndarray, src: int, dst: int) -> np.ndarray:
    if src == dst or len(x) == 0:
        return x
    n = int(round(len(x) * dst / src))
    if n <= 0:
        return x
    idx = np.linspace(0, len(x) - 1, n)
    return np.interp(idx, np.arange(len(x)), x).astype(np.float32)


def transcribe(pcm_s16le: bytes, sample_rate: int = TELEPHONY_SAMPLE_RATE) -> str:
    """Transcribe one mono PCM s16le utterance to text. Whisper wants 16 kHz float."""
    if not pcm_s16le:
        return ""
    audio = np.frombuffer(pcm_s16le, dtype=np.int16).astype(np.float32) / 32768.0
    audio = _resample(audio, sample_rate, 16000)
    segments, _ = _get_model().transcribe(audio, language="en", vad_filter=True)
    return " ".join(s.text.strip() for s in segments).strip()
