"""Text-to-speech via YOUR in-house neural-voice service.

Speaks the exact WebSocket protocol that service implements (see the app's
src/lib/voice/neural.ts): send one JSON frame, receive PCM s16le mono frames,
terminated by an {"type":"end"} frame or socket close. No third-party voice API.
"""
import json

from config import NEURAL_VOICE_URL, TELEPHONY_SAMPLE_RATE


async def synthesize(text, voice_id=None, rate=1.0, emotion=None, sample_rate=TELEPHONY_SAMPLE_RATE):
    """Async generator yielding PCM s16le mono chunks for `text` in your voice."""
    import websockets  # lazy so the orchestration layer imports without the dep

    if not NEURAL_VOICE_URL:
        raise RuntimeError("NEURAL_VOICE_URL not set — point at your neural-voice service")
    frame = {
        "text": text,
        "voiceId": voice_id,
        "rate": rate,
        "emotion": emotion,
        "sampleRate": sample_rate,
        "format": "pcm_s16le",
    }
    async with websockets.connect(NEURAL_VOICE_URL, max_size=None) as ws:
        await ws.send(json.dumps({k: v for k, v in frame.items() if v is not None}))
        async for msg in ws:
            if isinstance(msg, (bytes, bytearray)):
                yield bytes(msg)
                continue
            try:
                data = json.loads(msg)
            except (ValueError, TypeError):
                continue
            kind = data.get("type")
            if kind == "end":
                return
            if kind == "error":
                raise RuntimeError(data.get("message", "neural-voice error"))
