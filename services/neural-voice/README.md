# In-house neural voice service

The real, self-hosted TTS backend for Revenue Recall's voice surfaces. It runs
on **your** hardware, uses an **open-source neural model** (Piper, a VITS-family
network — permissively licensed), and **no audio ever leaves your
infrastructure**. There is no third-party API in the hot path: this is the
honest meaning of "in-house, not a vendor."

It speaks the exact WebSocket protocol the web app's neural seam expects
(`src/lib/voice/neural.ts`), so turning it on is a single env var — every voice
surface (AI briefs, call prep, role-play) upgrades from the browser voice to the
neural voice with **zero app code changes**.

## Quick start (local)

```bash
cd services/neural-voice
pip install -r requirements.txt
python -m piper.download_voices en_US-amy-medium   # one-time model download
python server.py                                    # ws://0.0.0.0:8765
```

Hear it without the app:

```bash
python server.py render "Hey Jordan — quick one. You free Thursday?" hello.wav
```

## Point the app at it

Set this env var (locally in `.env.local`, or in Vercel for the deployed app):

```
NEXT_PUBLIC_NEURAL_VOICE_URL=ws://localhost:8765
```

In production this must be `wss://` (TLS) — browsers block insecure `ws://` from
an https page. Put the service behind a TLS-terminating proxy / load balancer and
point the env var at the `wss://` URL.

## Docker

```bash
docker build -t rr-neural-voice .
docker run -p 8765:8765 rr-neural-voice
```

## Choosing / adding voices

Browse voices at the Piper voices catalog, then:

```bash
python -m piper.download_voices en_GB-alan-medium
PIPER_VOICE=en_GB-alan-medium python server.py
```

`*-high` variants sound better and cost more compute. The client sends a
`voiceId`; map it to a model here if you host several voices.

## Where this sits on the quality ladder

This is **M0→M1** of `docs/neural-voice.md`: a genuine, self-hosted neural voice
that is clearly more human than the browser engine and fully owned. It is not yet
the studio/clone-grade, phone-streaming model in M2–M5 — reaching that ABX-"can't
tell it's AI" bar is the audio-model build (training data + GPUs + eval gates)
described in the spec. Crucially, getting there means swapping only
`synthesize()` in `server.py`; the protocol, the web app, and this deployment
shape stay exactly the same.

## Notes on quality vs. "10,000× better than ElevenLabs"

Straight talk: no single drop-in is "10,000× better than ElevenLabs" — ElevenLabs
is already near the frontier. What this gives you that a vendor can't: **it's
yours** — your weights, your data rights, your serving, your cost curve, your
privacy story, and no per-character vendor bill. The path to *matching* frontier
quality is the training effort in the spec; this server is the production-shaped
foundation you train into, not a toy.
