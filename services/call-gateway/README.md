# In-house call gateway

The self-hosted telephony brain for Revenue Recall. It lets the product place
and hold **real phone calls** where the AI listens and speaks — with **your**
speech-to-text, **your** Opus brain, and **your** neural voice — running on
**your** hardware. No voice vendor, no per-minute platform markup. The honest
meaning of "in-house": every layer is yours except the wholesale dial-tone.

```
 Revenue Recall app ──(webhook: place call)──▶  call-gateway
                                                   │
                          ┌────────────────────────┼─────────────────────────┐
                          ▼                         ▼                          ▼
                   FreeSWITCH / SIP          STT (faster-whisper)      TTS (your neural-voice
                   ↕ media (RTP)             — hears the prospect       service over WebSocket)
                          │                         │                          ▲
                          └──────────▶ agent loop: STT ▶ Opus (brain) ▶ TTS ───┘
                                                   │
                                          SIP trunk (dial-tone) ──▶ ☎ real phone
```

## What's yours vs the one unavoidable outside line
| Layer | In-house? |
|---|---|
| Speech-to-text (listening) | ✅ `faster-whisper`, your hardware, open model |
| Brain (what to say) | ✅ Opus via your `ANTHROPIC_API_KEY` (you chose Opus) |
| Voice (speaking) | ✅ your `neural-voice` service (your weights, your cloning) |
| Call control + media | ✅ self-hosted **FreeSWITCH** (open-source, MPL) |
| **Reaching a real phone number** | ⚠️ a **SIP trunk** — wholesale dial-tone. *Physics + telecom law: no one can originate a PSTN call without carrier interconnect.* Commodity (≈¢/min), not a software/voice vendor. |

So: you own the AI, the voice, the logic, the media server. The only thing you
"pay outside" for is the phone line itself — and that's true for everyone,
including the big platforms (they resell the same trunks with a markup you skip).

## Honest status (read this)
- **AI voice-agent core — real and built here:** the STT → Opus → neural-voice
  turn-taking loop (`agent.py`, `stt.py`, `brain.py`, `tts.py`) and the app
  webhook contract (`server.py`) are real, importable Python.
- **Live PSTN media — your stand-up:** the SIP/RTP bridge (`sip.py`) drives
  **FreeSWITCH** (originate + `audio_fork` media over WebSocket). FreeSWITCH and
  a SIP trunk run on *your* box; that part can't be exercised from CI without a
  trunk + a phone. It's wired and documented, not magic.
- **Reaching true "better than everyone" on live calls is earned in production**
  — latency tuning, barge-in feel, voice quality — on your hardware. This gives
  you the best possible foundation to get there; it does not pretend a phone
  agent is flawless on day one.

## How the app talks to it
The app's comms layer (`src/lib/comms.ts`) already routes voice/SMS to a generic
webhook with **zero app code** — point it here:
```
VOICE_WEBHOOK_URL = https://your-gateway/voice
SMS_WEBHOOK_URL   = https://your-gateway/sms        # optional, same trunk
COMMS_WEBHOOK_TOKEN = <shared secret>               # sent as Bearer; we verify it
```
The app POSTs `{ channel, to, from }` plus optional briefing fields the agent
uses: `context` (who/why), `opener` (personalized first line), `voiceId`,
`voicemail` (a ready, personalized message to leave if the line goes to a
machine — speak it from your answering-machine-detection hook, see
`CallAgent.leave_voicemail`), and `meta` (echoed back to `/api/calls/log`). The
gateway originates the call and runs the agent. Nothing in the app changes —
flip the env var and calls go in-house.

## Answering-machine detection (voicemail) — opt-in
Off by default. When enabled (Twilio path), the gateway runs Twilio AMD on each
call and Twilio POSTs the human/machine verdict to `/twilio/amd` (signed with a
per-call token). A call that hits voicemail is then logged with `outcome:
"voicemail"` instead of being mislabeled `no-answer` — which is exactly what the
app's voicemail follow-up + call-retry logic (`src/lib/calls/retry.ts`) keys on.
```
AMD_ENABLED = true
PUBLIC_HTTPS_BASE = https://your-gateway      # optional; defaults from PUBLIC_WSS_BASE
AMD_TIMEOUT_SEC = 30                           # optional
```
AMD runs async, so the live `<Connect><Stream>` (and the agent) start
immediately. The prepared `voicemail` line is already threaded to
`CallAgent.leave_voicemail`; wiring the verdict to *speak* it mid-call (vs. just
labeling the outcome) is the one step to validate against your deployed gateway.
Pure logic (`amd.py`, `twilio_out.call_params`) is covered by
`python3 -m unittest discover -s tests`.

## Premium call voice (ElevenLabs) — opt-in
Off by default: calls speak in your in-house neural voice (zero marginal cost).
To speak calls in ElevenLabs instead (premium quality), set on the gateway:
```
CALL_TTS_PROVIDER = elevenlabs
ELEVENLABS_API_KEY = sk_...
ELEVENLABS_MODEL = eleven_flash_v2_5            # optional; low-latency for calls
CALL_ELEVENLABS_VOICE_ID = <voice id>           # optional; used for unmapped/clone voices
```
ElevenLabs streams `pcm_8000` — the exact telephony format — so there's no
resampling. House voice ids map to ElevenLabs voices in `tts.py` (mirrors the
app's `ELEVEN_VOICES`). A hosted request that fails *before* any audio falls back
to the in-house voice when `NEURAL_VOICE_URL` is set, so a hosted hiccup never
kills a live call. The pure logic (voice mapping + emotion settings) is covered
by `python3 -m unittest discover -s tests`; the network/audio path runs only on
the gateway, so **validate a real call after enabling**. Trade-off: ElevenLabs adds a
per-character cost and the phone codec (8 kHz) masks much of its HD edge, so the
in-house voice is usually the better economics for high-volume dialing — reserve
this for premium tiers / signature voices.

## Run it
```bash
cd services/call-gateway
pip install -r requirements.txt

# point at your own services + trunk (see config.py for all vars):
export NEURAL_VOICE_URL=ws://localhost:8765          # your neural-voice service
export ANTHROPIC_API_KEY="<your Opus key>"           # your Opus brain
export FREESWITCH_ESL_HOST=127.0.0.1                 # your FreeSWITCH
export SIP_TRUNK_GATEWAY=my_trunk                    # your SIP trunk (in FreeSWITCH)
export COMMS_WEBHOOK_TOKEN=<shared secret>

uvicorn server:app --host 0.0.0.0 --port 8080
```
`docker build -t rr-call-gateway . && docker run -p 8080:8080 rr-call-gateway`

## Why this beats a managed platform for you
- **Your voice, unlimited** — clone each rep, no per-character bill.
- **Your data** — call audio never leaves your infra (STT + TTS are local).
- **Your economics** — wholesale trunk minutes, no platform markup on voice/AI.
- **Your control** — swap the STT/voice/brain models freely; the seams are stable.
