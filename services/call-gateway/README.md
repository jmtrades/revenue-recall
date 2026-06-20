# In-house call gateway

The self-hosted telephony brain for Revenue Recall. It lets the product place
and hold **real phone calls** where the AI listens and speaks — with **your**
speech-to-text and **your** Opus brain running on **your** hardware, speaking in
a natural **ElevenLabs** voice (a stock voice or each rep's own clone). The honest
meaning of "in-house": the listening, the thinking, and the call control are yours;
the voice is ElevenLabs and the dial-tone is a wholesale trunk.

```
 Revenue Recall app ──(webhook: place call)──▶  call-gateway
                                                   │
                          ┌────────────────────────┼─────────────────────────┐
                          ▼                         ▼                          ▼
                   FreeSWITCH / SIP          STT (faster-whisper)      TTS (ElevenLabs,
                   or Twilio · media          — hears the prospect       Turbo v2.5, streamed)
                          │                         │                          ▲
                          └──────────▶ agent loop: STT ▶ Opus (brain) ▶ TTS ───┘
                                                   │
                                       trunk / Twilio (dial-tone) ──▶ ☎ real phone
```

## What's yours vs the outside pieces
| Layer | Where it runs |
|---|---|
| Speech-to-text (listening) | ✅ in-house — `faster-whisper`, your hardware, open model |
| Brain (what to say) | ✅ in-house — Opus via your `ANTHROPIC_API_KEY` |
| Voice (speaking) | 🗣️ **ElevenLabs** (Turbo v2.5) via your `ELEVENLABS_API_KEY` — a stock voice or each rep's own clone; per-character, top-tier quality |
| Call control + media | ✅ self-hosted **FreeSWITCH** (open-source, MPL) — or Twilio Media Streams |
| **Reaching a real phone number** | ⚠️ a **SIP trunk / Twilio** — wholesale dial-tone. *No one can originate a PSTN call without carrier interconnect.* Commodity (≈¢/min). |

So: you own the listening, the thinking, the logic, and the media server. You pay
outside for the voice (ElevenLabs) and the phone line (a trunk) — the AI agent
itself (listen→think→speak→log) is the part vendors don't give you.

## Honest status (read this)
- **AI voice-agent core — real and built here:** the STT → Opus → ElevenLabs
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

## Run it
```bash
cd services/call-gateway
pip install -r requirements.txt

# point at your keys + trunk (see config.py for all vars):
export ELEVENLABS_API_KEY="<your ElevenLabs key>"    # the voice (required)
export ANTHROPIC_API_KEY="<your Opus key>"           # your Opus brain
export FREESWITCH_ESL_HOST=127.0.0.1                 # your FreeSWITCH (or use the Twilio path)
export SIP_TRUNK_GATEWAY=my_trunk                    # your SIP trunk (in FreeSWITCH)
export COMMS_WEBHOOK_TOKEN=<shared secret>

uvicorn server:app --host 0.0.0.0 --port 8080
```
`docker build -t rr-call-gateway . && docker run -p 8080:8080 rr-call-gateway`

## Why this beats a managed platform for you
- **Your agent** — the full listen→think→speak→log loop is yours, not a vendor's black box.
- **Local STT + brain** — the prospect's audio is transcribed on your hardware, and the brain is Opus on your Anthropic key.
- **Top-tier voice with cloning** — ElevenLabs (Turbo v2.5), with each rep's own cloned voice; per-character, not a per-minute platform markup on the whole call.
- **Your economics** — wholesale trunk minutes (or Twilio at cost); no platform reselling you the trunk + AI + voice as one marked-up bundle.
- **Your control** — swap the STT/brain models and the ElevenLabs voice freely; the seams (`tts.py`, `voices.py`) are stable.
