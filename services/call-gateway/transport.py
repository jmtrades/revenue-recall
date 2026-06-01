"""Bidirectional call media for the agent. The agent only depends on this small
interface; the WebSocket implementation bridges FreeSWITCH media (mod_audio_fork)."""
import numpy as np

from config import TELEPHONY_SAMPLE_RATE


def _rms(pcm: bytes) -> float:
    if not pcm:
        return 0.0
    a = np.frombuffer(pcm, dtype=np.int16).astype(np.float32)
    return float(np.sqrt(np.mean(a * a))) if a.size else 0.0


class MediaTransport:
    async def send_audio(self, pcm: bytes) -> None:
        raise NotImplementedError

    async def collect_utterance(self):
        raise NotImplementedError

    def interrupted(self) -> bool:
        return False

    def closed(self) -> bool:
        return False


class WebSocketMediaTransport(MediaTransport):
    """Caller audio arrives as binary PCM s16le frames; we send PCM back to speak.
    Utterances are bounded by energy VAD with a silence tail, and we flag barge-in
    when the caller talks over our voice so the agent can stop mid-sentence."""

    def __init__(self, ws, sample_rate=TELEPHONY_SAMPLE_RATE,
                 silence_ms=700, min_speech_ms=200, threshold=500.0, frame_ms=20):
        self.ws = ws
        self.sample_rate = sample_rate
        self.silence_tail = silence_ms
        self.min_speech = min_speech_ms
        self.threshold = threshold
        self.frame_ms = frame_ms
        self._closed = False
        self._speaking_out = False
        self._barge = False

    def interrupted(self) -> bool:
        return self._barge

    def closed(self) -> bool:
        return self._closed

    async def send_audio(self, pcm: bytes) -> None:
        self._speaking_out = True
        self._barge = False
        try:
            await self.ws.send(pcm)
        except Exception:
            self._closed = True
        finally:
            self._speaking_out = False

    async def collect_utterance(self):
        buf = bytearray()
        speech_ms = 0
        silence_ms = 0
        while not self._closed:
            try:
                msg = await self.ws.recv()
            except Exception:
                self._closed = True
                break
            if not isinstance(msg, (bytes, bytearray)) or len(msg) == 0:
                continue
            voiced = _rms(bytes(msg)) >= self.threshold
            if voiced and self._speaking_out:
                self._barge = True  # caller talked over us → agent will cut its TTS
            if voiced:
                buf.extend(msg)
                speech_ms += self.frame_ms
                silence_ms = 0
            elif buf:
                buf.extend(msg)
                silence_ms += self.frame_ms
                if speech_ms >= self.min_speech and silence_ms >= self.silence_tail:
                    return bytes(buf)
        return bytes(buf) if buf else None
