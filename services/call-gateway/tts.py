"""Text-to-speech for live calls.

Default voice is YOUR in-house neural-voice service (NEURAL_VOICE_URL) — zero
marginal cost, audio never leaves your infra. It speaks the exact WebSocket
protocol that service implements (see the app's src/lib/voice/neural.ts): send
one JSON frame, receive PCM s16le mono frames, terminated by an {"type":"end"}
frame or socket close.

Optionally (CALL_TTS_PROVIDER=elevenlabs + ELEVENLABS_API_KEY) calls speak in
ElevenLabs instead — the premium-quality path. ElevenLabs streams `pcm_8000`,
the EXACT telephony format the agent consumes, so there's no resampling. If a
hosted request fails BEFORE any audio is produced, the call falls back to the
in-house voice when it's configured, so a hosted hiccup never kills a live call.

NOTE: this module's network paths run only on the call gateway and are not
exercised by the app's (JS) test suite. The ElevenLabs path is OFF by default;
validate a real call after enabling it.
"""
import json

from config import (
    NEURAL_VOICE_URL,
    TELEPHONY_SAMPLE_RATE,
    CALL_TTS_PROVIDER,
    ELEVENLABS_API_KEY,
    ELEVENLABS_MODEL,
    CALL_ELEVENLABS_VOICE_ID,
)

# House-voice id → ElevenLabs voice id. Mirrors ELEVEN_VOICES in the app's
# src/lib/voice/tts.ts (keep in sync). A clone:/unknown id uses
# CALL_ELEVENLABS_VOICE_ID, else the default (Rachel).
_ELEVEN_VOICES = {
    "af_heart": "21m00Tcm4TlvDq8ikWAM",
    "af_bella": "EXAVITQu4vr4xnSDxMaL",
    "af_nicole": "FGY2WhTYpPnrIDTdsKH5",
    "af_nova": "XB0fDUnXU5powFXDhCwa",
    "af_sarah": "cgSgspJ2msm6clMCkdW9",
    "af_sky": "9BWtsMINqrJLrRacOk9x",
    "af_jessica": "XrExE9yKIg1WjnnlVkGX",
    "af_river": "SAz9YHcvj6GT2YYXdXww",
    "am_adam": "pNInz6obpgDQGcFmaJgB",
    "am_michael": "TxGEqnHWrfWFTfGW9XjX",
    "am_onyx": "onwK4e9ZLuTAKqWW03F9",
    "am_echo": "iP95p4xoKVk53GoZ742B",
    "am_eric": "cjVigY5qzO86Huf0OWal",
    "am_liam": "TX3LPaxmHKxFdv7VOQHJ",
    "am_fenrir": "nPczCjzI2devNBz1zQrb",
    "am_puck": "bIHbv24MWmeRgasZH58o",
    "bf_emma": "Xb7hH8MSUJpSbSDYk0k2",
    "bf_alice": "ThT5KcBeYPX3keUQqHPh",
    "bf_lily": "pFZP5JQG7iQjIQuC4Bku",
    "bm_george": "JBFqnCBsd6RMkjVDRZzb",
    "bm_daniel": "onwK4e9ZLuTAKqWW03F9",
}
_DEFAULT_ELEVEN_VOICE = "21m00Tcm4TlvDq8ikWAM"  # Rachel
# ElevenLabs PCM output rates; the telephony default (8 kHz) is supported, so we
# request the exact rate the agent wants and never resample.
_PCM_RATES = {8000, 16000, 22050, 24000, 44100}


def _eleven_voice(voice_id):
    if voice_id and not voice_id.startswith("clone:") and voice_id in _ELEVEN_VOICES:
        return _ELEVEN_VOICES[voice_id]
    return CALL_ELEVENLABS_VOICE_ID or _DEFAULT_ELEVEN_VOICE


def _eleven_settings(emotion):
    """Delivery per emotion — mirrors elevenSettings() in the app's tts.ts."""
    table = {
        "energetic": {"stability": 0.35, "similarity_boost": 0.75, "style": 0.45},
        "warm": {"stability": 0.45, "similarity_boost": 0.8, "style": 0.3},
        "empathetic": {"stability": 0.55, "similarity_boost": 0.8, "style": 0.25},
        "calm": {"stability": 0.65, "similarity_boost": 0.8, "style": 0.1},
        "confident": {"stability": 0.5, "similarity_boost": 0.75, "style": 0.3},
    }
    s = table.get(emotion, {"stability": 0.5, "similarity_boost": 0.75, "style": 0.2})
    return {**s, "use_speaker_boost": True}


async def _neural_synthesize(text, voice_id=None, rate=1.0, emotion=None, sample_rate=TELEPHONY_SAMPLE_RATE):
    """Yield PCM s16le mono chunks from the in-house neural-voice service."""
    import websockets  # lazy: keeps this module importable (for unit tests) without it

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


async def _elevenlabs_synthesize(text, voice_id=None, emotion=None, sample_rate=TELEPHONY_SAMPLE_RATE):
    """Yield PCM s16le mono chunks streamed from ElevenLabs at the telephony rate.

    httpx is imported lazily so this module stays importable on a gateway that
    only runs the in-house voice (httpx ships with the anthropic dep already)."""
    import httpx

    rate = sample_rate if sample_rate in _PCM_RATES else 8000
    voice = _eleven_voice(voice_id)
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice}/stream?output_format=pcm_{rate}"
    headers = {"xi-api-key": ELEVENLABS_API_KEY, "content-type": "application/json"}
    body = {"text": text, "model_id": ELEVENLABS_MODEL, "voice_settings": _eleven_settings(emotion)}
    async with httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0)) as client:
        async with client.stream("POST", url, headers=headers, json=body) as resp:
            if resp.status_code >= 400:
                detail = (await resp.aread())[:200]
                raise RuntimeError(f"elevenlabs {resp.status_code}: {detail!r}")
            async for chunk in resp.aiter_bytes():
                if chunk:
                    yield chunk


async def synthesize(text, voice_id=None, rate=1.0, emotion=None, sample_rate=TELEPHONY_SAMPLE_RATE):
    """Async generator yielding PCM s16le mono chunks for `text` in your voice.

    Default: the in-house neural voice. With CALL_TTS_PROVIDER=elevenlabs (+ key)
    the call speaks in ElevenLabs; a pre-audio failure falls back to the in-house
    voice when configured (a hosted hiccup must not kill a live call), while a
    mid-utterance failure stops cleanly rather than re-speaking on a second engine.
    """
    if CALL_TTS_PROVIDER == "elevenlabs" and ELEVENLABS_API_KEY:
        produced = False
        try:
            async for chunk in _elevenlabs_synthesize(text, voice_id=voice_id, emotion=emotion, sample_rate=sample_rate):
                produced = True
                yield chunk
            return
        except Exception:
            if produced or not NEURAL_VOICE_URL:
                raise
            # else: nothing spoken yet and the in-house voice exists → fall back.
    async for chunk in _neural_synthesize(text, voice_id=voice_id, rate=rate, emotion=emotion, sample_rate=sample_rate):
        yield chunk
