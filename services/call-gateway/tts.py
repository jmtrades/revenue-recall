"""Text-to-speech via ElevenLabs — the only voice engine.

Streams ElevenLabs PCM (16 kHz s16le mono) for `text` and downsamples it to the
telephony 8 kHz the call transports expect, yielding chunks as they arrive — the
same async-generator protocol the agent loop consumes, so streaming/barge-in is
unchanged. The HTTP client (aiohttp) is imported lazily so the orchestration
layer/tests load without it; downsampling is pure stdlib (no numpy at import).
"""
import array
import sys

from config import ELEVENLABS_API_KEY, ELEVENLABS_MODEL, ELEVENLABS_VOICE_ID, TELEPHONY_SAMPLE_RATE
from voices import eleven_voice

# ElevenLabs' lowest PCM output is 16 kHz; we average sample pairs down to 8 kHz.
EL_OUTPUT_FORMAT = "pcm_16000"


def downsample_16k_to_8k(pcm: bytes) -> bytes:
    """16 kHz PCM s16le mono → 8 kHz, averaging consecutive sample pairs. Expects a
    whole number of sample PAIRS (len a multiple of 4); a trailing partial pair is
    dropped (the caller carries the remainder across chunks). Pure stdlib."""
    n = len(pcm) - (len(pcm) % 4)
    if n == 0:
        return b""
    a = array.array("h")  # native-endian signed 16-bit
    a.frombytes(pcm[:n])
    if sys.byteorder == "big":  # PCM is little-endian; normalize on a BE host
        a.byteswap()
    out = array.array("h", [(a[i] + a[i + 1]) // 2 for i in range(0, len(a), 2)])
    if sys.byteorder == "big":
        out.byteswap()
    return out.tobytes()


async def synthesize(text, voice_id=None, rate=1.0, emotion=None, sample_rate=TELEPHONY_SAMPLE_RATE):
    """Async generator yielding PCM s16le mono @ `sample_rate` (8 kHz) for `text`,
    spoken in the resolved ElevenLabs voice."""
    import aiohttp  # lazy so the orchestration layer imports without the dep

    if not ELEVENLABS_API_KEY:
        raise RuntimeError("ELEVENLABS_API_KEY not set — voice is ElevenLabs-only")
    voice = eleven_voice(voice_id, ELEVENLABS_VOICE_ID)
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice}/stream?output_format={EL_OUTPUT_FORMAT}"
    headers = {"xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json"}
    body = {
        "text": text,
        "model_id": ELEVENLABS_MODEL,
        "voice_settings": {"stability": 0.4, "similarity_boost": 0.75, "style": 0.3, "use_speaker_boost": True},
    }

    carry = b""  # bytes left over from a chunk that didn't end on a sample-pair
    async with aiohttp.ClientSession() as session:
        async with session.post(url, headers=headers, json=body) as resp:
            if resp.status != 200:
                detail = (await resp.text())[:200]
                raise RuntimeError(f"ElevenLabs {resp.status}: {detail}")
            async for chunk in resp.content.iter_chunked(4096):
                carry += chunk
                n = len(carry) - (len(carry) % 4)
                if n:
                    out = downsample_16k_to_8k(carry[:n])
                    carry = carry[n:]
                    if out:
                        yield out
    # Flush any final whole pair (drop a trailing <4-byte remainder).
    tail = downsample_16k_to_8k(carry)
    if tail:
        yield tail
