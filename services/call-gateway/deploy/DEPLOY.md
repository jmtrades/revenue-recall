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
