# Go live with AI phone calls — click-by-click

Three websites, ~30–45 minutes. When you're done, the app dials a real number,
the AI listens → thinks → speaks in your voice, and logs the transcript to the
CRM. Twilio is just the phone line; the AI + voice are yours.

**Two values you'll reuse in more than one place — keep them handy:**

| Value | What it is |
|---|---|
| `COMMS_WEBHOOK_TOKEN` | One shared secret. Use the **same** value in Render **and** Vercel. (Your app already has one in Vercel — reuse it, or set both to a fresh strong value.) |
| `CALL_STATUS_WEBHOOK_URL` | Always exactly `https://recall-touch.com/api/calls/log` |

---

## 1) Anthropic — the AI brain key
🔗 https://console.anthropic.com → **API Keys** → **Create Key** → copy it (starts `sk-ant-…`).
(You already use this in the app; the call-gateway needs its own copy.)

## 2) ElevenLabs — the voice key
🔗 https://elevenlabs.io → **Profile → API Keys** → copy it (starts `sk_…`).
Voice is **ElevenLabs-only** — the gateway speaks through this key. Optional: copy a
**Voice ID** from **Voices → (pick one) → ID** to set the default voice; otherwise a
sensible default is used and each org can still pick its own voice in the app.

## 3) Twilio — the phone line + a number
1. Sign up 🔗 https://www.twilio.com/try-twilio
2. **Buy a number** 🔗 https://console.twilio.com/us1/develop/phone-numbers/manage/search
   → tick **Voice** capability → **Buy**. Copy the number in `+1XXXXXXXXXX` form.
3. **Get your credentials** 🔗 https://console.twilio.com → on the home dashboard, **Account Info** →
   copy **Account SID** (`AC…`) and **Auth Token**.
4. **US numbers only:** complete the A2P/voice registration Twilio prompts you for (regulatory; one-time).

## 4) Render — host the call gateway (one blueprint)
1. Sign up and connect GitHub 🔗 https://dashboard.render.com/register
2. 🔗 https://dashboard.render.com → **New +** → **Blueprint** → pick the **`jmtrades/revenue-recall`** repo → **Apply**.
   Render reads `render.yaml` and creates the single **rr-call-gateway** service, then asks for these — paste:

   | Field | Paste this |
   |---|---|
   | `ANTHROPIC_API_KEY` | your `sk-ant-…` from step 1 |
   | `ELEVENLABS_API_KEY` | your `sk_…` from step 2 |
   | `ELEVENLABS_VOICE_ID` | optional — a voice id from step 2 (or leave blank for the default) |
   | `TWILIO_ACCOUNT_SID` | your `AC…` from step 3 |
   | `TWILIO_AUTH_TOKEN` | your Twilio Auth Token |
   | `TWILIO_FROM_NUMBER` | your Twilio number, e.g. `+14155551234` |
   | `COMMS_WEBHOOK_TOKEN` | your shared secret (same one you'll put in Vercel) |
   | `PUBLIC_WSS_BASE` | leave blank for now |

3. Wait for the first deploy. Open **rr-call-gateway** → copy its URL, e.g.
   `https://rr-call-gateway-xxxx.onrender.com`.
4. Same service → **Environment** → set **`PUBLIC_WSS_BASE`** = `wss://rr-call-gateway-xxxx.onrender.com`
   (same host, but `wss://`) → **Save** (it redeploys).
5. Check it: open `https://rr-call-gateway-xxxx.onrender.com/health` → you should see
   `"transport":"twilio"` and `"voice":true,"brain":true`. (`"voice":true` means the
   ElevenLabs key is set; if it's `false`, re-check `ELEVENLABS_API_KEY`.)

## 5) Vercel — point the app at the gateway
🔗 https://vercel.com/dashboard → your **revenue-recall** project → **Settings → Environment Variables**. Add/confirm:

| Name | Value |
|---|---|
| `VOICE_WEBHOOK_URL` | `https://rr-call-gateway-xxxx.onrender.com/voice` (your gateway URL + `/voice`) |
| `COMMS_WEBHOOK_TOKEN` | the **same** shared secret you used on Render |
| `OUTBOUND_FROM_NUMBER` | your Twilio number, `+1…` |

Then **Deployments → ⋯ → Redeploy** so the new vars take effect. (No code change — the app already routes calls to the gateway the moment `VOICE_WEBHOOK_URL` is set.)

## 6) Test it
Add **your own phone number** as a lead in the app, open it, and hit **Call now** (or Power Dialer).
Your phone rings, the AI talks to you, and after you hang up the transcript appears on that lead's timeline. 🎉

---

## What it costs (honest)
- **Twilio:** ~$1.15/mo per number + ~$0.013/min outbound (US). Pay-as-you-go.
- **Render:** ~$7–25/mo for the one gateway service. A GPU plan makes Whisper STT snappier but isn't required.
- **ElevenLabs:** per-character TTS — a few cents per call, on your ElevenLabs plan.
- **Anthropic:** per-call tokens — cents per call, metered in your usage.

## Honest notes
- **Voice** is ElevenLabs (Turbo v2.5 on live calls). Each org picks its voice in the app — a stock ElevenLabs voice or its own cloned voice — and the gateway speaks in it; `ELEVENLABS_VOICE_ID` is just the fallback default.
- **Compliance:** only call people who've consented. Set `CALL_RECORDING_DISCLOSURE` on the gateway to have the agent open with a recording notice (two-party-consent states). Opted-out / do-not-contact leads are skipped automatically.
- **Latency/quality** is earned in production — tune the VAD thresholds in `twilio_media.py` and use a GPU for the snappiest back-and-forth.
