# In-house neural voice service

The real, self-hosted TTS backend for Revenue Recall's voice surfaces. It runs
on **your** hardware, uses an **open-source neural model**, and **no audio ever
leaves your infrastructure**. No third-party API in the hot path: this is the
honest meaning of "in-house, not a vendor."

It speaks the exact WebSocket protocol the web app's neural seam expects
(`src/lib/voice/neural.ts`), so turning it on is a single env var — every voice
surface (AI briefs, call prep, role-play) upgrades from the browser voice to the
neural voice with **zero app code changes**.

## Engines

| Engine | Model | Notes |
|---|---|---|
| **`kokoro`** (default) | Kokoro 82M, Apache-2.0 | Top of open TTS leaderboards; **54 voices**; native **24 kHz**; ~**0.3× real-time on CPU** (faster than real-time); genuinely close to commercial quality. |
| `piper` | VITS, MIT | Lighter/faster, lower fidelity. Set `VOICE_ENGINE=piper`. |

### Honest quality note

Straight talk: this does **not** claim to beat ElevenLabs on raw naturalness —
ElevenLabs is at the frontier. Kokoro gets you **genuinely close**, and you win
decisively on the axes a vendor can't touch: **it's yours** — your weights, your
serving, ~**zero marginal cost**, full privacy, unlimited per-rep voices, and no
vendor lock-in or per-character bill. Reaching true frontier parity is the
audio-model training effort in `docs/neural-voice.md`; getting there swaps only
`synthesize()` in `server.py` — the protocol, the app, and this deployment stay
identical.

## Verified working

Run end-to-end in CI/sandbox: model loads (54 voices), a WebSocket client sending
the exact frame `src/lib/voice/neural.ts` sends receives a real PCM stream
(tested with two voices — `af_heart`, `am_adam`) followed by the `end` frame,
~1 s first-byte latency on CPU. The offline `render` command writes a valid
24 kHz 16-bit mono WAV.

## Quick start (local)

```bash
cd services/neural-voice
pip install -r requirements.txt

# Download Kokoro model files once (≈330 MB + 28 MB):
curl -L -o kokoro-v1.0.onnx  https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
curl -L -o voices-v1.0.bin   https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin

python server.py            # ws://0.0.0.0:8765
```

Hear it without the app:

```bash
python server.py render "Hey Jordan, you free Thursday?" hello.wav
```

Pick a voice (54 available — `af_heart`, `af_bella`, `am_adam`, `am_michael`, …):

```bash
VOICE_ID=am_adam python server.py
```

## Point the app at it

Set this env var (locally in `.env.local`, or in Vercel for the deployed app):

```
NEXT_PUBLIC_NEURAL_VOICE_URL=ws://localhost:8765
```

In production use `wss://` (TLS) — browsers block insecure `ws://` from an https
page. Put the service behind a TLS-terminating proxy and point the var at the
`wss://` URL. The client's `voiceId` selects the voice; `rate` controls speed.

## Docker

```bash
docker build -t rr-neural-voice .     # bakes the Kokoro model into the image
docker run -p 8765:8765 rr-neural-voice
```

## GPU

CPU is already faster than real-time for one stream. For high concurrency, set
`PIPER_CUDA=1` (piper) or run `kokoro-onnx[gpu]` with the CUDA ONNX runtime;
`synthesize()` is unchanged.

## Voice cloning (a rep's own voice — in-house)

The thing ElevenLabs charges most for, done on your own hardware. Uses
**Chatterbox** (Resemble AI, **MIT** — commercial-safe) for zero-shot cloning
from a short reference clip, with an **inaudible watermark** (PerthNet) on every
generated clip for provenance / anti-deepfake.

**Consent is enforced, not optional** (per `docs/neural-voice.md §4`): synthesis
**refuses** unless a recorded consent marker exists for that voice. A rep may
only clone their own verified voice or a voice with explicit written consent.

```bash
# 1) Enroll a rep with a 30-60s clean clip + a verified consent identity:
python server.py enroll rep_michael ./michael_sample.wav "Michael R. (verified self-enrollment)"

# 2) Synthesize in their cloned voice (client sends voiceId "clone:rep_michael"):
python server.py render "Hey Jordan, you free Thursday?" out.wav "clone:rep_michael"
```

From the app, set the rep's persona `voiceId` to `clone:<id>` and every surface
speaks in their voice. Without the consent marker the service errors and the app
falls back (via `getSynth()`) to a stock neural voice — it never clones silently.
Enrollment clips + consent markers live under `voices_clones/` and are
**gitignored** (sensitive, never committed).

Tested end-to-end: enrollment writes a consent record; cloning **refuses**
without it and **succeeds** (watermarked) with it. CPU is ~10x real-time for
cloning — use a GPU (`CLONE_CUDA=1`) for production latency.
