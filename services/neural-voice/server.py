#!/usr/bin/env python3
"""
In-house neural voice service — the real, self-hosted TTS backend.

This is the "our own, no vendor in the hot path" server that the web app's
neural seam (src/lib/voice/neural.ts) connects to. It runs on YOUR hardware
(CPU works; GPU is faster), uses an open-source neural model (Piper — a
VITS-family neural TTS, permissively licensed), and streams raw PCM over a
WebSocket using the exact protocol the client expects.

This is genuinely in-house: the weights live on your machine, no audio leaves
your infrastructure, and there is no third-party API call when it speaks. It is
the honest, runnable starting point on the ladder in docs/neural-voice.md — not
a hosted vendor, and good enough to sound clearly more human than the browser
voice. Swapping Piper for a higher-fidelity codec-LM model later (M2–M4 in the
spec) means changing only `synthesize()`; the protocol and the web app stay put.

────────────────────────────────────────────────────────────────────────────
PROTOCOL (must match src/lib/voice/neural.ts exactly)
  Client connects, then sends ONE JSON text frame:
    { "text": str, "voiceId"?: str, "rate"?: float, "pitch"?: float,
      "emotion"?: str, "lang"?: str, "sampleRate": int, "format": "pcm_s16le" }
  Server replies with BINARY frames of signed-16-bit little-endian mono PCM at
  `sampleRate`, then a final text frame {"type":"end"}. On failure it sends
  {"type":"error","message":...} and closes.

RUN
  pip install -r requirements.txt
  python -m piper.download_voices en_US-amy-medium   # one-time, downloads weights
  PIPER_VOICE=en_US-amy-medium python server.py       # ws://0.0.0.0:8765

POINT THE APP AT IT
  Set NEXT_PUBLIC_NEURAL_VOICE_URL=ws://localhost:8765  (wss:// behind TLS in prod)
  Every voice surface (briefs, call prep, role-play) upgrades automatically.
────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import wave
from io import BytesIO

import numpy as np
import websockets
from scipy.signal import resample_poly

try:
    from piper import PiperVoice  # type: ignore
except Exception:  # pragma: no cover - import guard for a clear error
    PiperVoice = None  # noqa: N816

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)s  %(message)s")
log = logging.getLogger("neural-voice")

HOST = os.environ.get("NEURAL_VOICE_HOST", "0.0.0.0")
PORT = int(os.environ.get("NEURAL_VOICE_PORT", "8765"))
VOICE = os.environ.get("PIPER_VOICE", "en_US-amy-medium")
# ~100ms chunks at the client rate — small chunks = low first-audio latency.
# (Piper's native rate is model-dependent, e.g. 22050 Hz; we resample to the
# client's requested sampleRate before chunking.)
CHUNK_FRAMES = 2400
MAX_TEXT = 4000

_voice: "PiperVoice | None" = None


def _resolve_model_path() -> str:
    """
    Resolve the model file. PIPER_VOICE may be a full path to a .onnx, or a voice
    name whose model was fetched via `python -m piper.download_voices <name>`
    (downloaded into the current dir or DATA_DIR).
    """
    if VOICE.endswith(".onnx") and os.path.exists(VOICE):
        return VOICE
    search = [os.getcwd(), os.environ.get("PIPER_DATA_DIR", ""), "/data", os.path.expanduser("~")]
    for base in filter(None, search):
        cand = os.path.join(base, f"{VOICE}.onnx")
        if os.path.exists(cand):
            return cand
    # Last resort: let Piper's own download dir resolution find it by name.
    return f"{VOICE}.onnx"


def load_voice() -> "PiperVoice":
    """Load the Piper neural model once, lazily, and keep it warm in memory."""
    global _voice
    if _voice is not None:
        return _voice
    if PiperVoice is None:
        raise RuntimeError(
            "piper-tts is not installed. Run: pip install -r requirements.txt && "
            "python -m piper.download_voices " + VOICE
        )
    path = _resolve_model_path()
    log.info("loading neural voice model: %s", path)
    use_cuda = os.environ.get("PIPER_CUDA", "").lower() in ("1", "true", "yes")
    _voice = PiperVoice.load(path, use_cuda=use_cuda)
    log.info("model loaded; native sample rate = %d Hz", _voice.config.sample_rate)
    return _voice


def synthesize(text: str, rate: float = 1.0) -> tuple[np.ndarray, int]:
    """
    Run the neural model → mono float32 waveform in [-1, 1] plus its sample rate.
    `rate` adjusts speaking speed (length_scale is inverse: faster => shorter).
    """
    from piper.config import SynthesisConfig

    voice = load_voice()
    syn = SynthesisConfig(length_scale=1.0 / max(0.5, min(2.0, rate or 1.0)))

    pcm = bytearray()
    sample_rate = voice.config.sample_rate
    # synthesize() yields AudioChunk objects; concatenate their int16 PCM.
    for chunk in voice.synthesize(text, syn_config=syn):
        pcm.extend(chunk.audio_int16_bytes)
        sample_rate = chunk.sample_rate
    samples = np.frombuffer(bytes(pcm), dtype="<i2").astype(np.float32) / 32768.0
    return samples, sample_rate


def to_pcm16(samples: np.ndarray, src_rate: int, dst_rate: int) -> bytes:
    """Resample to the client's requested rate and pack as signed-16 LE PCM."""
    if src_rate != dst_rate and samples.size:
        # Polyphase resample keeps it clean (24k native -> 24k web, or 8k phone).
        from math import gcd

        g = gcd(src_rate, dst_rate)
        samples = resample_poly(samples, dst_rate // g, src_rate // g)
    clipped = np.clip(samples, -1.0, 1.0)
    return (clipped * 32767.0).astype("<i2").tobytes()


async def handle(ws: "websockets.WebSocketServerProtocol") -> None:
    peer = getattr(ws, "remote_address", "?")
    try:
        raw = await asyncio.wait_for(ws.recv(), timeout=15)
        req = json.loads(raw)
        text = (req.get("text") or "").strip()[:MAX_TEXT]
        if not text:
            await ws.send(json.dumps({"type": "error", "message": "empty text"}))
            return
        dst_rate = int(req.get("sampleRate", 24000))
        rate = float(req.get("rate", 1.0))
        log.info("synthesize %d chars for %s @ %dHz", len(text), peer, dst_rate)

        # Synthesis is CPU/GPU-bound: run it off the event loop so the socket
        # stays responsive (and a future client can barge-in / disconnect).
        samples, src_rate = await asyncio.to_thread(synthesize, text, rate)
        pcm = to_pcm16(samples, src_rate, dst_rate)

        # Stream in small chunks for low first-audio latency + barge-in support.
        step = CHUNK_FRAMES * 2  # bytes (2 per frame, mono)
        for i in range(0, len(pcm), step):
            await ws.send(pcm[i : i + step])
        await ws.send(json.dumps({"type": "end"}))
        log.info("done: %d PCM bytes streamed to %s", len(pcm), peer)
    except asyncio.TimeoutError:
        await _safe_error(ws, "timed out waiting for request")
    except json.JSONDecodeError:
        await _safe_error(ws, "first frame must be JSON")
    except websockets.ConnectionClosed:
        pass  # client disconnected / barge-in — normal
    except Exception as exc:  # pragma: no cover - defensive
        log.exception("synthesis failed")
        await _safe_error(ws, f"synthesis failed: {exc}")


async def _safe_error(ws, message: str) -> None:
    try:
        await ws.send(json.dumps({"type": "error", "message": message}))
    except Exception:
        pass


def render_wav(text: str, path: str) -> None:
    """Offline helper: render one line to a .wav so you can hear it without the app."""
    samples, src_rate = synthesize(text)
    pcm = to_pcm16(samples, src_rate, src_rate)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(src_rate)
        w.writeframes(pcm)
    log.info("wrote %s (%.1fs)", path, len(samples) / src_rate)


async def main() -> None:
    load_voice()  # fail fast with a clear message if the model isn't installed
    log.info("neural voice service listening on ws://%s:%d", HOST, PORT)
    async with websockets.serve(handle, HOST, PORT, max_size=2**20):
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    import sys

    if len(sys.argv) >= 3 and sys.argv[1] == "render":
        # `python server.py render "hello there" out.wav`
        render_wav(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "out.wav")
    else:
        try:
            asyncio.run(main())
        except KeyboardInterrupt:
            log.info("shutting down")
