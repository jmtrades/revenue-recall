# In-house neural voice — build spec

The goal: a spoken voice that is **indistinguishable from a real person on a
sales call**, that is **ours** (no third-party TTS vendor in the hot path), that
can **clone a rep's own voice** from a short sample, and that streams in
**real time** for live calls. This document is the executable plan. It is not
runnable inside the web-app container (it needs audio data + GPU/serving infra),
so it lives as a spec the team executes where that infra exists.

What already exists in this repo and stays unchanged:

- **The words & the conversation** — `src/lib/ai/draft.ts`, `reply.ts`,
  `refine.ts`, `tones.ts`, and `src/lib/voice/conversation.ts`. Best-in-class and
  scenario-tested; the neural voice only changes *how it sounds*, never *what it
  says*.
- **The drop-in seam** — `src/lib/voice/synth.ts` defines `VoiceSynth`. The
  browser engine implements it today; the neural backend implements the same
  interface and registers via `setSynth(...)`. **No caller changes.**
- **Text normalization & prosody** — `speakable()` and `humanizeChunks()` in
  `src/lib/voice/speech.ts` are model-agnostic and feed the neural backend too.

---

## 1. Quality bar (definition of done)

| Dimension | Target |
|---|---|
| Naturalness (MOS, 1–5) | ≥ 4.3, within 0.1 of human ground truth |
| Human ABX "can you tell?" | ≤ 55% correct (≈ chance) on a blind panel of ≥ 30 listeners × ≥ 40 clips |
| Speaker similarity (cloned voice, SECS/cosine) | ≥ 0.80 vs the rep's reference |
| Intelligibility (WER via ASR re-transcription) | ≤ 3% |
| First-audio latency (streaming) | ≤ 300 ms after first token |
| Real-time factor | ≤ 0.3 (generate 1 s of audio in ≤ 0.3 s) on target GPU |
| Telephony quality | clean at 8 kHz μ-law (PSTN) and 24 kHz (web) |

"Indistinguishable" is operationalized as the **ABX panel + a CI gate** (§7), not
a vibe. Ship only when both pass.

---

## 2. Architecture

Recommended: a **neural-codec language-model TTS** stack, the current
state-of-the-art for zero/few-shot cloning and streaming.

```
text ─▶ normalize (speakable) ─▶ G2P / tokenizer
     ─▶ acoustic LM (predict discrete audio codec tokens, autoregressive, streaming)
     ─▶ neural codec decoder / vocoder (tokens ─▶ waveform)
     ─▶ chunked PCM out ─▶ {WebAudio | Twilio media stream}
        ▲
   speaker embedding (from rep enrollment clip) conditions the acoustic LM
```

Components:

1. **Frontend** — text normalization (reuse `speakable()`), grapheme-to-phoneme,
   prosody/break tags. Deterministic, CPU, already partly built.
2. **Acoustic model** — autoregressive transformer that predicts **discrete
   audio-codec tokens** conditioned on phonemes + a **speaker embedding** + style
   controls (rate/pitch/energy/emotion). Autoregressive = natural streaming.
3. **Neural codec / vocoder** — decodes tokens to waveform (a residual-VQ codec
   decoder, or a GAN/flow vocoder). Must be streaming-capable.
4. **Speaker encoder** — produces the embedding that *is* the cloned voice from a
   short enrollment clip (§4).

Make-vs-buy honesty: train acoustic + codec on **permissively-licensed / owned**
data so the runtime is genuinely ours. Open architectures (VITS-family,
codec-LM-family, GAN vocoders) are viable starting points; "ours" means our
weights, our data rights, our serving — not a hosted vendor API at call time.

Fallback ladder (already wired via `getSynth()`): neural (if available & healthy)
→ browser engine → written-only. A call never fails because TTS is down.

---

## 3. Data

- **Base multi-speaker corpus**: 500–2,000 hrs, 24 kHz, clean, with transcripts,
  diverse speakers/accents/ages. Source from **licensed or owned/consented**
  datasets only; record a proprietary studio set for the house voices.
- **Conversational/phone slice**: spontaneous, telephone-bandwidth speech with
  disfluencies — this is what makes sales calls sound real (breaths, "uh", soft
  laughs, trailing intonation). Under-represented in audiobook corpora; record it.
- **Per-rep enrollment**: 30–60 s of consented clean speech → speaker embedding
  (few-shot, no per-voice training). Optional 10–30 min for a fine-tuned premium
  voice.
- **Pipeline**: VAD + de-noise + loudness-normalize, forced alignment, ASR-verify
  transcripts (drop high-WER), de-dup, hold out per-speaker test sets.

---

## 4. Voice cloning ("their own voice")

- Few-shot: enrollment clip → speaker encoder → embedding stored per rep.
- **Consent is mandatory and recorded**: a rep may only clone their *own* voice
  (verified) or a voice with explicit written consent. Store consent with the
  embedding; refuse synthesis without it.
- **Audible + inaudible watermark** on all generated audio (provenance, anti-
  deepfake). Disclosure controls per jurisdiction (some require AI-call
  disclosure — make it a config the conversation layer can speak).

---

## 5. Training & infra

- **Train**: 8–32× A100/H100-class GPUs; acoustic LM days–weeks, vocoder
  separately. Track MOS/SECS/WER per checkpoint; early-stop on the eval gate.
- **Experiment tracking**, dataset versioning, reproducible configs.
- **Artifacts**: versioned weights (`rr-neural-vN`) in a model registry; never in
  git.

---

## 6. Serving (the real-time hot path)

- **GPU inference service** (separate from this Next.js app): gRPC/WebSocket,
  streams audio chunks as the acoustic LM emits tokens. Target latency/RTF in §1.
- **Two output profiles**: 24 kHz PCM for web (WebAudio playback) and 8 kHz μ-law
  for **Twilio Media Streams** (live PSTN calls).
- **Live-call loop**: caller audio → streaming ASR → `conversation.nextRepTurn()`
  → neural TTS stream → caller, with **barge-in** (cancel synthesis when the
  prospect starts talking — reuse the `stop()` on `SpeakHandle`).
- **Scale/cost**: autoscale on GPU utilization; cache embeddings; optionally
  pre-synthesize stable openers. Budget per audio-minute; cap concurrency per org.
- **Privacy**: document data flow; offer a no-retention mode; encrypt voice data
  at rest; regional routing where required.

---

## 7. Evaluation & CI gates

- **Objective, automated** (block release if regressed): MOS proxy, SECS vs
  reference, WER via ASR re-transcription, latency/RTF on the target GPU.
- **Human ABX panel**: blind "AI or human?" — must land ≈ chance (§1).
- **Adversarial**: feed generated audio to public AI-speech detectors; track and
  drive down detectability.
- **Behavioral** (already green here): the words still pass
  `tests/voice-corpus.test.ts` and the conversation gates — the voice change must
  not regress content.

---

## 8. Integration with this app (the seam is already here)

Implement `VoiceSynth` from `src/lib/voice/synth.ts`:

```ts
import { setSynth, type VoiceSynth } from "@/lib/voice/synth";

const neural: VoiceSynth = {
  id: "rr-neural-v1",
  kind: "neural",
  available: () => Boolean(process.env.NEXT_PUBLIC_NEURAL_VOICE_URL),
  async speak(text, opts) {
    // open a stream to the GPU service, play chunks via WebAudio,
    // return a SpeakHandle whose stop() cancels the stream (barge-in).
  },
};
setSynth(neural); // every surface now uses it; browser remains the fallback
```

- `speakable()` still normalizes the text first.
- `SpeakButton`, `RolePlay`, `VoiceControls` need **no changes** — they resolve
  the backend through `getSynth()`/the same `speak` contract.
- Voice selection (`VoiceControls`, `lib/voice/prefs.ts`) extends to list cloned
  rep voices alongside system voices.

---

## 9. Roadmap

1. **M0 — seam (done):** `VoiceSynth` interface + browser backend + fallback +
   tests. Live now.
2. **M1 — data:** license/record corpora; build the processing pipeline; eval
   harness + CI gates.
3. **M2 — model v0:** train acoustic + vocoder on house voices; hit MOS ≥ 4.0
   offline.
4. **M3 — streaming serve:** GPU service, web playback behind `setSynth()`; hit
   latency targets; ship to internal users.
5. **M4 — cloning:** speaker encoder + consent/watermark; per-rep voices.
6. **M5 — live calls:** Twilio Media Streams + barge-in; ABX panel at ≈ chance;
   GA behind the quality gate.

## 10. Risks

- **Realism plateau** on conversational/phone speech → invest in the spontaneous
  corpus early (§3); it's the differentiator.
- **Latency** for autoregressive streaming → chunked decoding, smaller vocoder,
  GPU co-location with telephony.
- **Misuse / deepfake & legal** → consent gating + watermarking + AI-call
  disclosure are non-negotiable (§4).
- **Cost** → per-org concurrency caps, opener caching, right-sized GPUs.
