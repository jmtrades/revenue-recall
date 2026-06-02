# Deploying the in-house voice stack

Three pieces, all on your own infrastructure:

1. **neural-voice** — your TTS (the voices). `services/neural-voice`.
2. **call-gateway** — the AI agent (STT → Opus → your voice). This service.
3. **FreeSWITCH + a SIP trunk** — call control + the dial-tone to reach phones.

`docker-compose.yml` here brings up (1) and (2). FreeSWITCH + the trunk are (3) —
yours to run; the gateway drives FreeSWITCH over ESL and FreeSWITCH streams call
audio back to the gateway's `/media` WebSocket.

> Honest scope: (1) and (2) are turnkey here. (3) is real telephony infra — the
> exact `mod_audio_fork` framing and bidirectional playback are FreeSWITCH-build
> specific, so treat the FreeSWITCH bits as **reference templates to finalize on
> your box** (or use [Jambonz](https://jambonz.org), open-source, which does the
> WebSocket-media-to-agent bridge cleanly and points at the same `/media` URL).

---

## ⚡ Fastest path to LIVE calls — Twilio (no FreeSWITCH)

If you want real calls working this week, **skip FreeSWITCH** and let Twilio be
the dial-tone. Twilio places the call and streams its audio to the gateway over a
WebSocket (Media Streams); the in-house agent — **your** Whisper STT, **your**
Opus brain, **your** neural voice — runs the whole conversation. The only thing
"outside" is the phone line itself (≈¢/min), which is unavoidable for *anyone*
making PSTN calls. This is built in and turnkey: set four env vars.

> Honest note on quality: this makes calls **work**, end to end. Voice fidelity
> is whatever your `neural-voice` service produces (in-house Kokoro = genuinely
> good, yours, unlimited, zero per-word cost) — swap in a higher-fidelity model
> behind the same WS protocol if you want frontier timbre. We're a full *calling
> agent* (listen→think→speak→log), not just a TTS — that's the part vendors don't
> give you.

**Steps (~30 min):**
1. **Twilio**: create an account, buy a voice-capable number, grab your Account
   SID + Auth Token. (US: complete number/voice registration Twilio prompts for.)
2. **Deploy** the gateway + neural-voice (the `docker-compose.yml` here) on a host
   with a public HTTPS/WSS domain (Fly.io, Render, Railway, or a VPS behind
   Caddy/nginx TLS). The gateway must be reachable at a `wss://` URL.
3. **Env** (next to `docker-compose.yml`):

   | Variable | What to put |
   |---|---|
   | `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | from the Twilio console |
   | `TWILIO_FROM_NUMBER` | your Twilio number, E.164 (e.g. `+14155551234`) |
   | `PUBLIC_WSS_BASE` | public `wss://` URL of this gateway (e.g. `wss://calls.yourco.com`) |
   | `ANTHROPIC_API_KEY` · `NEURAL_VOICE_URL` · `COMMS_WEBHOOK_TOKEN` · `CALL_STATUS_WEBHOOK_URL` | as in the table below |

   When these are set, `/health` reports `"transport":"twilio"` and the gateway
   originates via Twilio + bridges media on `/twilio/media` automatically — no
   FreeSWITCH, no SIP-trunk vars needed.
4. **Point the app** at the gateway (same as step 4 below): `VOICE_WEBHOOK_URL =
   https://<your-gateway>/voice`, `COMMS_WEBHOOK_TOKEN = <shared secret>`.
5. **Call**: from the app (Power Dialer / `POST /api/calls/place`) → gateway →
   Twilio dials → audio streams to the agent → it greets, listens, thinks, speaks
   → transcript posts back to your CRM.

The FreeSWITCH/SIP path below is the **fully-in-house alternative** (you own the
media server too) — more setup, no Twilio. Same agent either way.

## 1–2) Gateway + voices
Create a `.env` file next to `docker-compose.yml` with these values (var names
only shown here — see the repo's `.env.example` for the full descriptions):

| Variable | What to put |
|---|---|
| `ANTHROPIC_API_KEY` | your Anthropic (Opus) key |
| `FREESWITCH_ESL_HOST` | host running FreeSWITCH (e.g. `host.docker.internal`) |
| `FREESWITCH_ESL_PASSWORD` | your FreeSWITCH ESL credential |
| `SIP_TRUNK_GATEWAY` | the FreeSWITCH gateway name for your SIP trunk |
| `OUTBOUND_FROM_NUMBER` | your caller-ID number |
| `COMMS_WEBHOOK_TOKEN` | the shared webhook secret (same value as the app) |
| `CALL_STATUS_WEBHOOK_URL` | the app's `https://<app>/api/calls/log` — where finished-call transcripts are posted so they land on the CRM timeline |
| `PUBLIC_WS_BASE` | `ws://` URL of the gateway, reachable by FreeSWITCH |

Then bring it up and check health:
```bash
cd services/call-gateway/deploy
docker compose up -d --build
curl localhost:8080/health     # {"status":"ok","voice":true,"brain":true,"trunk":true}
```

## 3) FreeSWITCH + your SIP trunk
- Install FreeSWITCH with **`mod_audio_fork`** (drachtio build) or run **Jambonz**.
- Add your SIP trunk as a Sofia gateway named to match `SIP_TRUNK_GATEWAY`
  (`conf/sip_profiles/external/my_trunk.xml`): your provider's host, username,
  password, register true.
- Drop `freeswitch/rr_agent.lua` (reference) into your scripts dir. On an answered
  leg it forks call audio (8 kHz mono) to `rr_media_ws` (the gateway's
  `/media/<call_id>`) and parks. Confirm the `audio_fork` args + bidirectional
  playback against your build.

## 4) Point the app at the gateway (one env var, no app change)
In Vercel:
```
VOICE_WEBHOOK_URL   = https://<your-gateway>/voice
COMMS_WEBHOOK_TOKEN = <same shared secret as above>
```
Optionally `SMS_WEBHOOK_URL` once you wire SMS in `server.py`.

## 5) Test
From the app, place a call (Power Dialer, or `POST /api/calls/place`). The app
POSTs `{to, context, opener}` → gateway `originate()` → FreeSWITCH dials your
trunk → media bridges to the agent → it greets with your `opener`, listens
(Whisper), thinks (Opus), and speaks (your neural voice), with barge-in. After
hangup, wire `agent.run()`'s returned transcript back to the CRM to log the call.

## Going to 10/10
- **Latency:** run Whisper + neural-voice on a **GPU** (`WHISPER_DEVICE=cuda`,
  `kokoro-onnx[gpu]`); keep STT chunking tight (tune the VAD in `transport.py`).
- **Naturalness:** clone the rep's own voice (`neural-voice` README) and pass its
  `voiceId`; keep Opus turns short (already capped) for snappy back-and-forth.
- **Barge-in feel:** tune `threshold` / `silence_ms` in `WebSocketMediaTransport`.
