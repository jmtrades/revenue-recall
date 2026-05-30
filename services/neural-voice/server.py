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

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)s  %(message)s")
log = logging.getLogger("neural-voice")

HOST = os.environ.get("NEURAL_VOICE_HOST", "0.0.0.0")
PORT = int(os.environ.get("NEURAL_VOICE_PORT", "8765"))
# Engine: "kokoro" (frontier-class open model, default) or "piper" (lighter fallback).
ENGINE = os.environ.get("VOICE_ENGINE", "kokoro").lower()
# Default voice id per engine; the client may override via `voiceId`.
DEFAULT_VOICE = os.environ.get("VOICE_ID", "af_heart" if ENGINE == "kokoro" else "en_US-amy-medium")
# ~100ms chunks at the client rate — small chunks = low first-audio latency.
CHUNK_FRAMES = 2400
MAX_TEXT = 4000

# Kokoro model files (ONNX). Download once (see README); resolved from common dirs.
KOKORO_MODEL = os.environ.get("KOKORO_MODEL", "kokoro-v1.0.onnx")
KOKORO_VOICES = os.environ.get("KOKORO_VOICES", "voices-v1.0.bin")

_engine = None  # lazily-loaded engine instance (Kokoro or PiperVoice)


def _find(name: str) -> str:
    """Locate a model file across common locations (cwd, /data, ~, env path)."""
    if os.path.isabs(name) and os.path.exists(name):
        return name
    for base in filter(None, [os.getcwd(), os.environ.get("MODEL_DIR", ""), "/data", os.path.expanduser("~")]):
        cand = os.path.join(base, name)
        if os.path.exists(cand):
            return cand
    return name  # let the loader raise a clear error if truly missing


# ─── Kokoro engine (default) ──────────────────────────────────────────────────
def _load_kokoro():
    from kokoro_onnx import Kokoro

    model, voices = _find(KOKORO_MODEL), _find(KOKORO_VOICES)
    log.info("loading Kokoro model: %s", model)
    k = Kokoro(model, voices)
    log.info("Kokoro loaded; %d voices, native 24kHz", len(k.get_voices()))
    return k


def _kokoro_synth(text: str, voice: str, rate: float) -> tuple[np.ndarray, int]:
    k = _engine
    samples, sr = k.create(text, voice=voice, speed=max(0.5, min(2.0, rate or 1.0)), lang="en-us")
    return np.asarray(samples, dtype=np.float32), int(sr)


# ─── Piper engine (lighter fallback) ──────────────────────────────────────────
def _load_piper():
    from piper import PiperVoice

    name = DEFAULT_VOICE
    path = name if (name.endswith(".onnx") and os.path.exists(name)) else _find(f"{name}.onnx")
    log.info("loading Piper model: %s", path)
    use_cuda = os.environ.get("PIPER_CUDA", "").lower() in ("1", "true", "yes")
    v = PiperVoice.load(path, use_cuda=use_cuda)
    log.info("Piper loaded; native %d Hz", v.config.sample_rate)
    return v


def _piper_synth(text: str, voice: str, rate: float) -> tuple[np.ndarray, int]:
    from piper.config import SynthesisConfig

    v = _engine
    syn = SynthesisConfig(length_scale=1.0 / max(0.5, min(2.0, rate or 1.0)))
    pcm = bytearray()
    sr = v.config.sample_rate
    for chunk in v.synthesize(text, syn_config=syn):
        pcm.extend(chunk.audio_int16_bytes)
        sr = chunk.sample_rate
    samples = np.frombuffer(bytes(pcm), dtype="<i2").astype(np.float32) / 32768.0
    return samples, sr


def load_voice():
    """Load the configured engine once, lazily, and keep it warm in memory."""
    global _engine
    if _engine is not None:
        return _engine
    _engine = _load_kokoro() if ENGINE == "kokoro" else _load_piper()
    return _engine


def synthesize(text: str, rate: float = 1.0, voice: str | None = None) -> tuple[np.ndarray, int]:
    """Run the active neural engine → mono float32 waveform in [-1,1] + sample rate."""
    load_voice()
    v = voice or DEFAULT_VOICE
    if ENGINE == "kokoro":
        return _kokoro_synth(text, v, rate)
    return _piper_synth(text, v, rate)


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
        voice = req.get("voiceId") or None
        log.info("synthesize %d chars for %s @ %dHz (voice=%s)", len(text), peer, dst_rate, voice or DEFAULT_VOICE)

        # Synthesis is CPU/GPU-bound: run it off the event loop so the socket
        # stays responsive (and a future client can barge-in / disconnect).
        samples, src_rate = await asyncio.to_thread(synthesize, text, rate, voice)
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
