"""Twilio Media Streams transport — bridge a Twilio call's audio to the in-house
agent with NO FreeSWITCH. Twilio streams 8 kHz mu-law (G.711) frames as base64
JSON over a WebSocket; we decode them to PCM s16le for the agent (STT) and encode
the agent's PCM voice back to mu-law frames Twilio plays into the call.

Implements the same small MediaTransport interface the agent uses
(collect_utterance / send_audio / interrupted / closed), so agent.py is unchanged.

NOTE: mu-law conversion uses the stdlib `audioop` (present in Python 3.11, this
service's runtime). The protocol is per Twilio's Media Streams docs; tune the VAD
thresholds against your real call audio.
"""
import audioop
import base64
import json

import numpy as np

from config import TELEPHONY_SAMPLE_RATE

# Twilio media is 8 kHz mono mu-law in 20 ms frames (160 samples = 320 PCM16 bytes).
_FRAME_BYTES = int(TELEPHONY_SAMPLE_RATE * 0.02) * 2  # 320


def _rms(pcm: bytes) -> float:
    if not pcm:
        return 0.0
    a = np.frombuffer(pcm, dtype=np.int16).astype(np.float32)
    return float(np.sqrt(np.mean(a * a))) if a.size else 0.0


class TwilioMediaTransport:
    def __init__(self, ws, silence_ms=700, min_speech_ms=200, threshold=500.0, frame_ms=20):
        self.ws = ws  # a FastAPI/Starlette WebSocket
        self.stream_sid = None
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

    async def recv_event(self):
        """Receive + parse one Twilio JSON event, or None when the socket closes."""
        try:
            raw = await self.ws.receive_text()
        except Exception:
            self._closed = True
            return None
        try:
            return json.loads(raw)
        except (ValueError, TypeError):
            return {}

    async def send_audio(self, pcm: bytes) -> None:
        """Play PCM s16le 8 kHz into the call as 20 ms mu-law frames. Stops early
        on barge-in and flushes Twilio's buffer so the caller isn't talked over."""
        if self._closed or not self.stream_sid:
            return
        self._speaking_out = True
        self._barge = False
        try:
            for i in range(0, len(pcm), _FRAME_BYTES):
                if self._barge or self._closed:
                    # Caller cut in — drop anything Twilio has queued.
                    await self.ws.send_text(json.dumps({"event": "clear", "streamSid": self.stream_sid}))
                    break
                ulaw = audioop.lin2ulaw(pcm[i:i + _FRAME_BYTES], 2)
                await self.ws.send_text(json.dumps({
                    "event": "media",
                    "streamSid": self.stream_sid,
                    "media": {"payload": base64.b64encode(ulaw).decode("ascii")},
                }))
        except Exception:
            self._closed = True
        finally:
            self._speaking_out = False

    async def collect_utterance(self):
        """Accumulate caller audio (decoded to PCM s16le) until a silence tail
        closes the turn; returns the utterance, or None when the call ends."""
        buf = bytearray()
        speech_ms = 0
        silence_ms = 0
        while not self._closed:
            ev = await self.recv_event()
            if ev is None:
                break
            event = ev.get("event")
            if event == "start":
                self.stream_sid = self.stream_sid or (ev.get("start", {}) or {}).get("streamSid") or ev.get("streamSid")
                continue
            if event == "stop":
                self._closed = True
                break
            if event != "media":
                continue
            payload = (ev.get("media") or {}).get("payload")
            if not payload:
                continue
            try:
                pcm = audioop.ulaw2lin(base64.b64decode(payload), 2)
            except Exception:
                continue
            voiced = _rms(pcm) >= self.threshold
            if voiced and self._speaking_out:
                self._barge = True  # caller talked over us → agent cuts its TTS
            if voiced:
                buf.extend(pcm)
                speech_ms += self.frame_ms
                silence_ms = 0
            elif buf:
                buf.extend(pcm)
                silence_ms += self.frame_ms
                if speech_ms >= self.min_speech and silence_ms >= self.silence_tail:
                    return bytes(buf)
        return bytes(buf) if buf else None
