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

from text_norm import normalize, split_sentences

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)s  %(message)s")
log = logging.getLogger("neural-voice")

HOST = os.environ.get("NEURAL_VOICE_HOST", "0.0.0.0")
# Bind $PORT when the host injects one (Render/Railway/Fly), else NEURAL_VOICE_PORT, else 8765.
PORT = int(os.environ.get("PORT") or os.environ.get("NEURAL_VOICE_PORT") or "8765")
# Engine: "kokoro" (frontier-class open model, default), "voxcpm" (OpenBMB
# VoxCPM — tokenizer-free, highly expressive, native zero-shot cloning + voice
# design), or "piper" (lighter fallback).
ENGINE = os.environ.get("VOICE_ENGINE", "kokoro").lower()


def _default_voice() -> str:
    if ENGINE == "kokoro":
        return "af_heart"
    if ENGINE == "voxcpm":
        # VoxCPM has no fixed voice catalogue — it speaks in a neutral default
        # voice unless given a reference clip ("clone:<id>") or a voice-design
        # description ("design:<style>"). "default" is just a sentinel here.
        return "default"
    return "en_US-amy-medium"


# Default voice id per engine; the client may override via `voiceId`.
DEFAULT_VOICE = os.environ.get("VOICE_ID", _default_voice())
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


# ─── VoxCPM engine (OpenBMB — expressive, tokenizer-free, zero-shot cloning) ───
# https://github.com/OpenBMB/VoxCPM  — a MiniCPM-family TTS that produces notably
# more natural, context-aware prosody than VITS-class models, and clones a voice
# zero-shot from a few seconds of reference audio. Heavier than Kokoro/Piper
# (diffusion decoder; GPU strongly recommended), so it's opt-in via VOICE_ENGINE.
VOXCPM_MODEL = os.environ.get("VOXCPM_MODEL", "openbmb/VoxCPM2")
VOXCPM_CFG = float(os.environ.get("VOXCPM_CFG", "2.0"))
VOXCPM_TIMESTEPS = int(os.environ.get("VOXCPM_TIMESTEPS", "10"))
_voxcpm_sr = 0  # native sample rate, resolved once at load (constant per model)


def _load_voxcpm():
    from voxcpm import VoxCPM

    global _voxcpm_sr
    log.info("loading VoxCPM model: %s", VOXCPM_MODEL)
    # load_denoiser=False keeps startup light; enable VOXCPM_DENOISER=1 to clean
    # noisy reference clips during cloning.
    denoise = os.environ.get("VOXCPM_DENOISER", "").lower() in ("1", "true", "yes")
    m = VoxCPM.from_pretrained(VOXCPM_MODEL, load_denoiser=denoise)
    _voxcpm_sr = _read_voxcpm_sample_rate(m)
    log.info("VoxCPM loaded; native %d Hz", _voxcpm_sr)
    return m


def _read_voxcpm_sample_rate(model) -> int:
    """VoxCPM's native sample rate, read defensively across versions. Called once
    at load; the value is cached in _voxcpm_sr (it's constant per model)."""
    for getter in (lambda: model.tts_model.sample_rate, lambda: model.sample_rate):
        try:
            sr = int(getter())
            if sr > 0:
                return sr
        except Exception:
            pass
    return int(os.environ.get("VOXCPM_SAMPLE_RATE", "16000"))


def _voxcpm_synth(text: str, voice: str, rate: float) -> tuple[np.ndarray, int]:
    m = _engine
    # "design:<style>" exposes VoxCPM's voice-design: the leading "(style)" tells
    # the model how to sound (e.g. "warm, energetic, professional"). Any other
    # voiceId falls through to the default voice — VoxCPM has no fixed catalogue.
    if voice and voice.startswith("design:"):
        desc = voice[len("design:") :].strip()
        if desc:
            text = f"({desc}){text}"
    wav = m.generate(text=text, cfg_value=VOXCPM_CFG, inference_timesteps=VOXCPM_TIMESTEPS)
    samples = np.asarray(wav, dtype=np.float32).reshape(-1)
    # VoxCPM controls its own pacing; server-side `rate` doesn't apply (the client
    # can still nudge playbackRate). Accepting `rate` keeps the engine interface
    # uniform across Kokoro/Piper/VoxCPM.
    _ = rate
    return samples, _voxcpm_sr or _read_voxcpm_sample_rate(m)


def _load_engine():
    if ENGINE == "kokoro":
        return _load_kokoro()
    if ENGINE == "voxcpm":
        return _load_voxcpm()
    return _load_piper()


def load_voice():
    """Load the configured engine once, lazily, and keep it warm in memory."""
    global _engine
    if _engine is not None:
        return _engine
    _engine = _load_engine()
    return _engine


# ─── Voice cloning (per-rep, consent-gated, watermarked) ──────────────────────
# Chatterbox (Resemble AI, MIT) does zero-shot cloning from a short reference
# clip and embeds an inaudible watermark (PerthNet) on every output — the
# anti-deepfake provenance docs/neural-voice.md §4 requires. A rep's enrollment
# clip is stored as a .wav under CLONE_DIR keyed by their voice id; we only clone
# when a matching CONSENT marker exists, never otherwise.
CLONE_DIR = os.environ.get("CLONE_DIR", os.path.join(os.getcwd(), "voices_clones"))
_clone_model = None


def _load_clone_model():
    global _clone_model
    if _clone_model is not None:
        return _clone_model
    from chatterbox.tts import ChatterboxTTS

    device = "cuda" if os.environ.get("CLONE_CUDA", "").lower() in ("1", "true", "yes") else "cpu"
    log.info("loading voice-clone model (Chatterbox) on %s", device)
    _clone_model = ChatterboxTTS.from_pretrained(device=device)
    log.info("clone model loaded; watermarking active")
    return _clone_model


def _clone_paths(voice_id: str) -> tuple[str, str]:
    """Reference clip + consent marker paths for a cloned voice id (sanitized)."""
    safe = "".join(c for c in voice_id if c.isalnum() or c in "-_")[:64]
    return os.path.join(CLONE_DIR, f"{safe}.wav"), os.path.join(CLONE_DIR, f"{safe}.consent")


def _clone_synth(text: str, voice_id: str) -> tuple[np.ndarray, int]:
    """Synthesize `text` in a rep's cloned voice. Refuses without a consent marker."""
    ref, consent = _clone_paths(voice_id)
    if not os.path.exists(ref):
        raise RuntimeError(f"no enrollment clip for voice '{voice_id}'")
    if not os.path.exists(consent):
        # Hard refusal: cloning without recorded consent is never allowed (§4).
        raise RuntimeError(f"voice '{voice_id}' has no recorded consent; refusing to synthesize")
    model = _load_clone_model()
    wav = model.generate(text, audio_prompt_path=ref)  # watermarked output
    samples = wav.squeeze().detach().cpu().numpy().astype(np.float32)
    return samples, int(model.sr)


def _synthesize_raw(text: str, rate: float = 1.0, voice: str | None = None) -> tuple[np.ndarray, int]:
    """Run the active neural engine → mono float32 waveform in [-1,1] + sample rate.
    Assumes `text` is already normalized (see `normalize`)."""
    v = voice or DEFAULT_VOICE
    # A "clone:<id>" voice id routes to the cloning engine (the rep's own voice).
    if v.startswith("clone:"):
        return _clone_synth(text, v[len("clone:") :])
    load_voice()
    if ENGINE == "kokoro":
        return _kokoro_synth(text, v, rate)
    if ENGINE == "voxcpm":
        return _voxcpm_synth(text, v, rate)
    return _piper_synth(text, v, rate)


def synthesize(text: str, rate: float = 1.0, voice: str | None = None) -> tuple[np.ndarray, int]:
    """Normalize sales text to spoken form, then synthesize the whole utterance.
    (The WebSocket path in `handle` normalizes once and synthesizes per sentence
    for lower first-audio latency; this one-shot form backs the offline helpers.)"""
    return _synthesize_raw(normalize(text), rate, voice)


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

        # Normalize sales content (money/percent/times/acronyms → spoken form) ONCE,
        # then synthesize sentence-by-sentence and stream each as it's ready: the
        # caller hears sentence one while the rest is still rendering — a big
        # first-audio latency win on long lines (and natural sentence pauses).
        sentences = split_sentences(normalize(text))
        step = CHUNK_FRAMES * 2  # bytes (2 per frame, mono) — small = low latency + barge-in
        total = 0
        for sent in sentences:
            # Synthesis is CPU/GPU-bound: run it off the event loop so the socket
            # stays responsive (client can barge-in / disconnect mid-utterance).
            samples, src_rate = await asyncio.to_thread(_synthesize_raw, sent, rate, voice)
            pcm = to_pcm16(samples, src_rate, dst_rate)
            for i in range(0, len(pcm), step):
                await ws.send(pcm[i : i + step])
            total += len(pcm)
        await ws.send(json.dumps({"type": "end"}))
        log.info("done: %d PCM bytes streamed to %s (%d sentence(s))", total, peer, len(sentences))
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


def render_wav(text: str, path: str, voice: str | None = None) -> None:
    """Offline helper: render one line to a .wav so you can hear it without the app."""
    samples, src_rate = synthesize(text, voice=voice)
    pcm = to_pcm16(samples, src_rate, src_rate)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(src_rate)
        w.writeframes(pcm)
    log.info("wrote %s (%.1fs)", path, len(samples) / src_rate)


def enroll(voice_id: str, clip_path: str, consent_by: str) -> None:
    """
    Register a rep's voice for cloning. Copies their enrollment clip and writes a
    consent marker — synthesis later refuses if the marker is absent (§4). Pass
    `consent_by` as the verified identity that authorized cloning THIS voice.
    """
    import shutil

    if not consent_by.strip():
        raise SystemExit("refusing to enroll without a consent identity (consent_by)")
    os.makedirs(CLONE_DIR, exist_ok=True)
    ref, consent = _clone_paths(voice_id)
    shutil.copyfile(clip_path, ref)
    with open(consent, "w") as f:
        json.dump({"voiceId": voice_id, "consentBy": consent_by, "enrolledAt": __import__("time").time()}, f)
    log.info("enrolled cloned voice '%s' (consent by %s) → use voiceId 'clone:%s'", voice_id, consent_by, voice_id)


async def main() -> None:
    load_voice()  # fail fast with a clear message if the model isn't installed
    log.info("neural voice service listening on ws://%s:%d", HOST, PORT)
    async with websockets.serve(handle, HOST, PORT, max_size=2**20):
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    import sys

    if len(sys.argv) >= 2 and sys.argv[1] == "render":
        # `python server.py render "hello there" out.wav [voiceId]`
        render_wav(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "out.wav", sys.argv[4] if len(sys.argv) > 4 else None)
    elif len(sys.argv) >= 2 and sys.argv[1] == "enroll":
        # `python server.py enroll <voiceId> <clip.wav> <consentBy>`
        enroll(sys.argv[2], sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else "")
    else:
        try:
            asyncio.run(main())
        except KeyboardInterrupt:
            log.info("shutting down")
