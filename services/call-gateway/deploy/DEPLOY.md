# Deploying the in-house call agent

Two pieces:

1. **call-gateway** — the AI agent: **local Whisper STT → Opus brain → ElevenLabs
   TTS**, with barge-in and streamed replies. This service.
2. **A dial-tone** — either **Twilio** (fastest, no media server) or **FreeSWITCH +
   a SIP trunk** (fully in-house). Pick one.

Voice is **ElevenLabs-only** — the gateway speaks through your `ELEVENLABS_API_KEY`
(Turbo v2.5 on live calls). There is no separate voice service to run.

`docker-compose.yml` here brings up the gateway. FreeSWITCH + the trunk (if you go
that route) are yours to run; the gateway drives FreeSWITCH over ESL and FreeSWITCH
streams call audio back to the gateway's `/media` WebSocket.

> Honest scope: the gateway is turnkey here. The FreeSWITCH path is real telephony
> infra — the exact `mod_audio_fork` framing and bidirectional playback are
> FreeSWITCH-build specific, so treat those bits as **reference templates to
> finalize on your box** (or use [Jambonz](https://jambonz.org), open-source, which
> bridges WebSocket-media-to-agent cleanly and points at the same `/media` URL).

---

## ⚡ Fastest path to LIVE calls — Twilio (no FreeSWITCH)

If you want real calls working this week, **skip FreeSWITCH** and let Twilio be the
dial-tone. Twilio places the call and streams its audio to the gateway over a
WebSocket (Media Streams); the in-house agent — **your** Whisper STT, **your** Opus
brain, **your** ElevenLabs voice — runs the whole conversation. The only thing
"outside" is the phone line itself (≈¢/min), unavoidable for *anyone* making PSTN
calls. Built in and turnkey: set the env vars below.

> Honest note: this makes calls **work**, end to end. We're a full *calling agent*
> (listen→think→speak→log), not just a TTS — that's the part vendors don't give you.

**Steps (~30 min):**
1. **Twilio**: create an account, buy a voice-capable number, grab your Account SID
   + Auth Token. (US: complete the number/voice registration Twilio prompts for.)
2. **ElevenLabs**: grab an API key (Profile → API Keys, `sk_…`). Optional: a Voice
   ID for the default voice.
3. **Deploy** the gateway (the `docker-compose.yml` here) on a host with a public
   HTTPS/WSS domain (Fly.io, Render, Railway, or a VPS behind Caddy/nginx TLS). The
   gateway must be reachable at a `wss://` URL.
4. **Env** (next to `docker-compose.yml`):

   | Variable | What to put |
   |---|---|
   | `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | from the Twilio console |
   | `TWILIO_FROM_NUMBER` | your Twilio number, E.164 (e.g. `+14155551234`) |
   | `PUBLIC_WSS_BASE` | public `wss://` URL of this gateway (e.g. `wss://calls.yourco.com`) |
   | `ANTHROPIC_API_KEY` · `ELEVENLABS_API_KEY` · `COMMS_WEBHOOK_TOKEN` · `CALL_STATUS_WEBHOOK_URL` | as in the table below |
   | `ELEVENLABS_VOICE_ID` | optional — default voice (else a built-in default; each org can still pick its own) |

   When these are set, `/health` reports `"transport":"twilio"` and the gateway
   originates via Twilio + bridges media on `/twilio/media` automatically — no
   FreeSWITCH, no SIP-trunk vars needed.
5. **Point the app** at the gateway (same as step 4 below): `VOICE_WEBHOOK_URL =
   https://<your-gateway>/voice`, `COMMS_WEBHOOK_TOKEN = <shared secret>`.
6. **Call**: from the app (Power Dialer / `POST /api/calls/place`) → gateway →
   Twilio dials → audio streams to the agent → it greets, listens, thinks, speaks →
   transcript posts back to your CRM.

The FreeSWITCH/SIP path below is the **fully-in-house alternative** (you own the
media server too) — more setup, no Twilio. Same agent either way.

## 1) Gateway env (both paths)
Create a `.env` file next to `docker-compose.yml` (var names only here — see the
repo's `.env.example` for full descriptions):

| Variable | What to put |
|---|---|
| `ANTHROPIC_API_KEY` | your Anthropic (Opus) key — the call brain |
| `ELEVENLABS_API_KEY` | your ElevenLabs key — the voice (required; `/health` `"voice"` is false without it) |
| `ELEVENLABS_VOICE_ID` | optional default voice id |
| `ELEVENLABS_MODEL` | optional, defaults to `eleven_turbo_v2_5` |
| `COMMS_WEBHOOK_TOKEN` | the shared webhook secret (same value as the app) |
| `CALL_STATUS_WEBHOOK_URL` | the app's `https://<app>/api/calls/log` — where finished-call transcripts post so they land on the CRM timeline |

**Twilio path** adds: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `PUBLIC_WSS_BASE` (see above).

**FreeSWITCH path** adds instead: `FREESWITCH_ESL_HOST`, `FREESWITCH_ESL_PASSWORD`, `SIP_TRUNK_GATEWAY`, `OUTBOUND_FROM_NUMBER`, and `PUBLIC_WS_BASE` (the `ws://` URL of the gateway, reachable by FreeSWITCH).

Then bring it up and check health:
```bash
cd services/call-gateway/deploy
docker compose up -d --build
curl localhost:8080/health     # {"status":"ok","voice":true,"brain":true,...}
```

## 2) FreeSWITCH + your SIP trunk (in-house path only)
- Install FreeSWITCH with **`mod_audio_fork`** (drachtio build) or run **Jambonz**.
- Add your SIP trunk as a Sofia gateway named to match `SIP_TRUNK_GATEWAY`
  (`conf/sip_profiles/external/my_trunk.xml`): your provider's host, username,
  password, register true.
- Drop `freeswitch/rr_agent.lua` (reference) into your scripts dir. On an answered
  leg it forks call audio (8 kHz mono) to the gateway's `/media/<call_id>` and
  parks. Confirm the `audio_fork` args + bidirectional playback against your build.

## 3) Point the app at the gateway (one env var, no app change)
In Vercel:
```
VOICE_WEBHOOK_URL   = https://<your-gateway>/voice
COMMS_WEBHOOK_TOKEN = <same shared secret as above>
```
Optionally `SMS_WEBHOOK_URL` once you wire SMS in `server.py`.

## 4) Test
From the app, place a call (Power Dialer, **Call now** on a deal, or
`POST /api/calls/place`). The app POSTs `{to, context, opener, voiceId}` → gateway
`originate()` → Twilio/FreeSWITCH dials → media bridges to the agent → it greets
with your `opener`, listens (Whisper), thinks (Opus), speaks (ElevenLabs). After
hangup the transcript posts back to `/api/calls/log` and lands on the CRM timeline.

## Going to 10/10
- **Latency:** run Whisper STT on a **GPU** (`WHISPER_DEVICE=cuda`); keep STT
  chunking tight (tune the VAD in `transport.py`). ElevenLabs TTS is streamed, so
  the voice itself isn't the bottleneck.
- **Naturalness:** each org picks a stock ElevenLabs voice **or its own cloned
  voice** in the app; the app passes that `voiceId` per call, so the gateway speaks
  in it. Keep Opus turns short (already capped) for snappy back-and-forth.
- **Barge-in feel:** tune `threshold` / `silence_ms` in `WebSocketMediaTransport`.
