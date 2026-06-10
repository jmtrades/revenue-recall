# Revenue Recall — Go‑Live Runbook (hand-off)

Everything needed to take the product to **100% working**: compliant email, SMS,
and live AI phone calls. The app is already deployed and live at
**https://recall-touch.com** — this finishes the outside connections.

> A teammate will give you the **shared secret** (`COMMS_WEBHOOK_TOKEN`). Use that
> exact value everywhere this doc says `<SHARED_SECRET>`. Don't commit it anywhere.

---

## Access you need first
- A **login** to https://recall-touch.com (ask the owner to invite you).
- **Vercel** access to the `revenue-recall` project (to set env vars).
- A **GitHub** account with access to `jmtrades/revenue-recall` (for the Render deploy).
- Ability to create a **Twilio** account and a **Render** account (company card).

## What's already live — do NOT redo
Database (Supabase), AI brain (Anthropic), login/accounts, **email sending**, and
**billing** (Stripe, live — paid checkouts charge immediately; no trial). You're only
adding: compliance info, **SMS**, **phone calls**, and **numbers**.

## Cost (so there are no surprises)
- **Twilio:** ~$1.15/mo per number + ~$0.013/min outbound (US), ~$0.0079/SMS. Pay-as-you-go.
- **Render:** ~$7–25/mo per service × 2 services (the call engine). Only needed for phone calls.
- **Anthropic:** cents per call/message, metered.

---

## STEP 1 — Compliance info (3 min, required before any real outreach)
Email/SMS law (CAN‑SPAM/TCPA) requires a real business name + postal address in the footer.
1. Go to **https://recall-touch.com/settings → General**.
2. Set **Business name** and **Postal address**. Save.

## STEP 2 — Turn on SMS (5 min)
1. Twilio console → copy **Account SID** (`AC…`) and **Auth Token**: **https://console.twilio.com**
2. If you don't have a number yet, buy one (tick **Voice + SMS**): **https://console.twilio.com/us1/develop/phone-numbers/manage/search**
   (US: complete the A2P/10DLC registration Twilio prompts for.)
3. **https://vercel.com/dashboard → revenue-recall → Settings → Environment Variables** → add (Production):
   | Name | Value |
   |---|---|
   | `TWILIO_ACCOUNT_SID` | your `AC…` |
   | `TWILIO_AUTH_TOKEN` | your Twilio Auth Token |
   | `TWILIO_FROM_NUMBER` | your Twilio number, `+1XXXXXXXXXX` |
   | `OUTBOUND_FROM_NUMBER` | the same number, `+1XXXXXXXXXX` |
4. **Deployments → ⋯ → Redeploy.**
5. ✅ Check: open **https://recall-touch.com/api/health** → `"sms": true`.

## STEP 3 — Turn on AI phone calls (~30 min)
The live‑call engine must run on a real server (Vercel can't host it). One‑click via Render.
1. **Anthropic key** for the engine: **https://console.anthropic.com/settings/keys** → Create Key → copy `sk-ant-…`.
2. **Render:** sign up **https://dashboard.render.com/register** (connect GitHub) →
   **https://dashboard.render.com/blueprints** → **New Blueprint Instance** → pick **`jmtrades/revenue-recall`** → **Apply**. Paste when prompted:
   | Field | Value |
   |---|---|
   | `ANTHROPIC_API_KEY` | your `sk-ant-…` |
   | `TWILIO_ACCOUNT_SID` | your `AC…` |
   | `TWILIO_AUTH_TOKEN` | your Twilio Auth Token |
   | `TWILIO_FROM_NUMBER` | your Twilio number `+1…` |
   | `COMMS_WEBHOOK_TOKEN` | `<SHARED_SECRET>` |
   | `PUBLIC_WSS_BASE` | leave blank for now |
3. After it deploys, open the **rr-call-gateway** service → copy its URL
   (e.g. `https://rr-call-gateway-xxxx.onrender.com`) → set
   **`PUBLIC_WSS_BASE` = `wss://rr-call-gateway-xxxx.onrender.com`** (same host, `wss://`) → Save (redeploys).
4. ✅ Check: open `https://rr-call-gateway-xxxx.onrender.com/health` → `"transport":"twilio"`, `"voice":true`, `"brain":true`.
5. Back in **Vercel** env (same place as Step 2) add:
   | Name | Value |
   |---|---|
   | `VOICE_WEBHOOK_URL` | `https://rr-call-gateway-xxxx.onrender.com/voice` |
   | `COMMS_WEBHOOK_TOKEN` | `<SHARED_SECRET>` (same as Render) |
   → **Redeploy.**
6. ✅ Check: **https://recall-touch.com/api/health** → `"voice": true`.

## STEP 4 — Get phone numbers in-app (2 min)
Once Twilio is connected (Steps 2/3), buy numbers without the Twilio console:
**https://recall-touch.com/settings → Numbers** → search an area code → **Buy**.

## STEP 5 — Final test
On **https://recall-touch.com**, add **your own phone** as a lead → open it → **Call**.
Your phone rings, the AI talks, and the transcript appears on that lead's timeline. 🎉
Also send yourself a test SMS from the lead to confirm texting.

---

## Optional — fuller autonomy (not required to sell)
- **Two-way replies:** in Twilio, set the number's **Messaging** webhook to
  `https://recall-touch.com/api/inbound/sms`; point your email forwarding at
  `https://recall-touch.com/api/inbound/email` and set `INBOUND_SIGNING_SECRET` in Vercel.
- **Hourly outreach** (default is once daily): ask the dev to enable the GitHub Actions
  schedule, or upgrade Vercel to Pro.

## Done = 100%
`https://recall-touch.com/api/health` shows **`email: true`, `sms: true`, `voice: true`**,
`launch.ready: true`, and a test call + text both work. That's everything.

## Troubleshooting
- `sms`/`voice` still `false` after redeploy → an env var is missing or you didn't Redeploy after saving.
- Gateway `/health` not `"transport":"twilio"` → a `TWILIO_*` var is blank on Render, or `PUBLIC_WSS_BASE` isn't set.
- Call connects but no transcript in the CRM → `COMMS_WEBHOOK_TOKEN` differs between Render and Vercel (they must match exactly).
- Twilio "number not voice-capable" → buy a number with the **Voice** capability ticked.
