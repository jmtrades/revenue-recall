# Deploy the call-gateway from a prebuilt image (no GitHub connection)

If Render's GitHub connection won't cooperate, skip it entirely. The CI workflow
`build-call-stack.yml` publishes the **whole calling stack** (in-house neural
voice + call-gateway) as **one image** to GitHub Container Registry. You deploy
that image as a single Render service — no Blueprint, no repo picker.

Image:

```
ghcr.io/jmtrades/revenue-recall-call-stack:latest
```

## 1. Make the image public (one-time)
GHCR images start private. Make this one public so Render can pull it without
credentials:

1. GitHub → your profile → **Packages** → **revenue-recall-call-stack**.
2. **Package settings** (right side) → scroll to **Danger Zone** → **Change visibility** → **Public**.

(If you'd rather keep it private, in Render add a registry credential: a GitHub
Personal Access Token with `read:packages`, username = your GitHub username.)

## 2. Create the Render service from the image
1. Render → **New +** → **Web Service**.
2. Choose **"Deploy an existing image"**.
3. Image URL: `ghcr.io/jmtrades/revenue-recall-call-stack:latest`
4. Instance type: **Standard** (the baked Whisper STT model needs ~1–2 GB RAM).
5. Add these environment variables:

   | Key | Value |
   |-----|-------|
   | `ANTHROPIC_API_KEY` | your Anthropic key (the call brain) |
   | `ELEVENLABS_API_KEY` | your ElevenLabs key (the voice — required) |
   | `ELEVENLABS_VOICE_ID` | optional default voice id |
   | `TWILIO_ACCOUNT_SID` | from Twilio |
   | `TWILIO_AUTH_TOKEN` | from Twilio |
   | `TWILIO_FROM_NUMBER` | your platform fallback number, e.g. `+14155551234` |
   | `COMMS_WEBHOOK_TOKEN` | the **same** secret you set in Vercel |
   | `CALL_STATUS_WEBHOOK_URL` | `https://recall-touch.com/api/calls/log` |
   | `PUBLIC_WSS_BASE` | leave blank for now (step 3) |

   (`WHISPER_MODEL` is baked into the image — no need to set it. Voice is
   ElevenLabs, so there's no neural-voice host/engine to configure.)
6. **Create Web Service.** Wait for the green **Live** dot. Health check path is
   `/health`.

## 3. Wire the public URL (two values)
After it's Live, copy the service URL at the top of the page (e.g.
`https://revenue-recall-call-stack.onrender.com`). Then:

- **On this Render service:** set `PUBLIC_WSS_BASE = wss://<that-host>` → it
  redeploys. (Twilio needs this to stream call audio back. Calls won't connect
  until it's set.)
- **In Vercel:** set `VOICE_WEBHOOK_URL = https://<that-host>/voice` → redeploy.

## 4. Verify
- `https://<that-host>/health` → JSON like `{"ok":true,...,"voice":true,...}`.
- `https://recall-touch.com/api/health` → `voice:true`.
- Place a real test call to your own phone from the app.

## Optional: your own subdomain
In Render → the service → **Settings → Custom Domains** → add
`calls.recall-touch.com`, add the CNAME it gives you at your DNS, then use
`https://calls.recall-touch.com/voice` and `wss://calls.recall-touch.com`
instead of the onrender.com host.
