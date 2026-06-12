# Wiring Revenue Recall — the complete guide

Everything is **optional**. With zero configuration the app runs on a built-in
in-memory CRM with template AI, so you can explore immediately. You light up real
capabilities by adding keys. There are two ways things get wired:

- **Operator (you) — set once as env vars** on your host (e.g. Vercel → Project →
  Settings → Environment Variables). These are platform-wide: AI, database,
  billing, email/SMS/voice providers, social OAuth apps.
- **Each user — connects in-app**, self-serve, under **Settings → Integrations /
  Channels**. Their CRM, database, social accounts, and numbers are stored
  **encrypted per org**. This needs `ENCRYPTION_KEY` set at deploy time.

> `NEXT_PUBLIC_*` values are inlined at **build time** — after changing one,
> redeploy (uncheck "use existing build cache") for it to take effect.

---

## ✅ Already live on recall-touch.com
- **Database** — Supabase (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`)
- **AI** — Anthropic (`ANTHROPIC_API_KEY`)
- **Per-user accounts** — auto-enabled because a database is connected
- **GDPR/CCPA data rights** — self-serve: customers export everything or permanently delete their account from Settings → Billing → Your data (no config needed)

---

## 1) Turn on real sending (highest impact)

Until a channel is connected it **logs** instead of sending. Pick the no-lock-in
webhook path *or* a built-in adapter — you only need one per channel.

### Email — pick ONE
| Option | Vars | Where |
|---|---|---|
| Resend (easiest) | `RESEND_API_KEY`, `EMAIL_FROM` | resend.com → API Keys |
| SendGrid | `SENDGRID_API_KEY`, `EMAIL_FROM` | sendgrid.com |
| Any provider (webhook) | `EMAIL_WEBHOOK_URL`, `COMMS_WEBHOOK_TOKEN` | your gateway; we POST `{channel,to,subject,body,from}` |

Turning email on also unlocks **signup confirmation, team invites, password
reset, and outreach** emails.

### SMS — pick ONE
| Option | Vars |
|---|---|
| Twilio | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` |
| Any provider (webhook) | `SMS_WEBHOOK_URL`, `COMMS_WEBHOOK_TOKEN` |

### Voice / power dialer — pick ONE
| Option | Vars |
|---|---|
| Twilio | `TWILIO_*` above + optional `CALL_TWIML_URL` |
| Any provider (webhook) | `VOICE_WEBHOOK_URL` |

### The spoken voice is studio-grade by default — and free
Every spoken surface (read-aloud, call prep, role-play) uses **Kokoro, a
neural voice model running on-device in the browser**: zero per-use cost, no
vendor, audio never leaves the machine. It downloads once in the background
(~90 MB, cached; WebGPU when available) — until it's ready, or on devices that
can't run it, the next engine down answers. **No configuration needed.**

Hosted voices for PHONE calls, in priority order (quality-first):

| Option | Vars | Notes |
|---|---|---|
| **ElevenLabs (the best voice — default leader)** | `ELEVENLABS_API_KEY` | the most human delivery on the market; ~$0.06/min on Flash (the shipped call default) |
| Cartesia Sonic | `CARTESIA_API_KEY` + `CARTESIA_VOICE_ID` (optional `CARTESIA_VOICE_MAP`) | ~90 ms latency, ~$0.04/min — pin it to trade a little polish for margin |
| OpenAI TTS | `OPENAI_API_KEY` | solid + cheapest (~$0.015/min) |

Pin one with `VOICE_TTS_PROVIDER=cartesia|elevenlabs|openai`; otherwise the
best-configured wins (ElevenLabs > Cartesia > OpenAI).

**Two-tier ElevenLabs quality (automatic):** live calls use **Flash v2.5**
(~75 ms, the model the minute-margin math is priced on); in-app read-aloud,
voice previews, and the landing demo use **`eleven_multilingual_v2`** — the
most natural production model — because latency is invisible there and fidelity
is the whole point. Override either independently: `ELEVENLABS_MODEL` (realtime
calls) and `ELEVENLABS_MODEL_HQ` (non-realtime, e.g. set to `eleven_v3` once
it's GA for your account).

**Voice economics (the margin math, all knobs env-overridable —
`VOICE_COST_*_PER_MIN`):** the unit is a CONNECTED TALK MINUTE, not a dial — a
no-answer is free and a voicemail drop is ~30 s, so 100 dials/day consumes
only ~64 talk min (15% connect × 3 min + 38% voicemail × 0.5 min). A connected
minute costs telephony ($0.014) + STT ($0.006) + LLM (~$0.005) + the voice —
**≈ $0.085/min on ElevenLabs Flash (the shipped call default)**, $0.065
Cartesia, $0.04 OpenAI. Allowances sell rep-scale dial volume; margins below
are the WORST CASE (full allowance consumed — real utilization runs lower):

| Plan | Talk minutes | ≈ dials it covers | Voice COGS (full) | % of price | Worst-case margin |
|---|---|---|---|---|---|
| Starter (free) | 0 phone (unlimited on-device practice) | — | $0 | 0% | — |
| Operator $399 | 1,500 / mo | ~2,300/mo (≈100/day) | ~$127.50 | 32% | **~68%** |
| Autopilot $899 | 4,000 pooled | ~6,000/mo across the desk | ~$340 | 38% | **~62%** |
| Scale (custom) | unmetered | — | priced per deal | — | — |

(Pin `VOICE_TTS_PROVIDER=cartesia` and those floors rise to ~76% / ~71%.
Repricing is **self-healing**: amounts changed in `billing/catalog.ts` are
noticed by the hourly platform tick, which mints the new Stripe prices itself
— `transfer_lookup_key` keeps existing subscribers grandfathered. Re-running
`POST /api/billing/setup` does the same thing immediately if you don't want
to wait for the next tick. Either way a `billing.catalog.selfheal` alert
records that it happened.)

Minutes meter automatically from the call gateway's reported durations
(feature `call_minutes` in the usage ledger — COGS lands in the operator's
Settings → Billing breakdown). When billing enforcement is on and an org runs
out, new calls pause with a friendly upgrade message; email, SMS, and
on-device practice keep working. Hosted audio is only ever spent on seconds of
actual speech — never on page views.

House voices (Aria, Adam, …) are native Kokoro ids and auto-map on the hosted
backends; delivery (warm / calm / energetic…) is shaped per line everywhere.
(`NEXT_PUBLIC_NEURAL_VOICE_URL` — the self-hosted GPU service — takes priority
over everything when set.)

### Phone numbers
- Bring your own caller ID: `OUTBOUND_FROM_NUMBER`
- Search/buy in-app via any provider: `NUMBERS_WEBHOOK_URL`, `NUMBERS_WEBHOOK_TOKEN`

### ⚠️ Compliance — REQUIRED before real sending
- `OUTBOUND_ORG_NAME` — your company name
- `COMPLIANCE_ADDRESS` — a physical postal address (legally required in commercial email)
- `OUTBOUND_COMPLIANCE=true` (default; appends CAN-SPAM footer + SMS "Reply STOP")

### Two-way (inbound replies)
- Point your SMS provider's webhook at `…/api/inbound/sms` and your email
  provider's inbound-parse webhook at `…/api/inbound/email`
- `INBOUND_TOKEN` (verifies inbound when not using Twilio signatures)
- `REPLY_AUTOPILOT=true` to auto-reply in your voice (else replies queue to Approvals)

---

## 2) Billing — to charge customers (Stripe)
Checkout/portal stay inactive until set. Create products/prices in Stripe and
point a webhook at `…/api/billing/webhook`.

| Var | Purpose |
|---|---|
| `STRIPE_SECRET_KEY` | API key (Stripe → Developers → API keys) |
| `STRIPE_WEBHOOK_SECRET` | from the `…/api/billing/webhook` endpoint |
| `STRIPE_PRICE_GROWTH` (Operator, $399 **per unit**) / `STRIPE_PRICE_TEAM` (Autopilot, $899 flat) | monthly price IDs |
| `STRIPE_PRICE_GROWTH_ANNUAL` ($3,990/yr per unit) / `STRIPE_PRICE_TEAM_ANNUAL` ($8,990/yr) | optional annual price IDs (~2 months free) |
| `BILLING_ENFORCE=true` | enforce plan limits + action allowances (off = unrestricted) |

**No trials:** paid checkouts charge immediately — a completed checkout is an `active` subscription. Starter stays free with no card. The pricing CTAs flow straight through: choose a paid plan → sign up → the dashboard auto-opens checkout.

**Usage top-ups (buy extra AI actions):** create **one-time** prices in Stripe and paste the ids — each pack is purchasable only once its price is set. Amounts are defined in `src/lib/billing/topups.ts`.

| Var | Pack | Suggested price |
|---|---|---|
| `STRIPE_PRICE_TOPUP_1K` | +1,000 AI messages | $29 (one-time) |
| `STRIPE_PRICE_TOPUP_5K` | +5,000 AI messages | $99 (one-time) |
| `STRIPE_PRICE_TOPUP_25K` | +25,000 AI messages | $399 (one-time) |
| `STRIPE_PRICE_TOPUP_M300` | +300 talk minutes (≈450 dials) | $59 (one-time) |
| `STRIPE_PRICE_TOPUP_M1000` | +1,000 talk minutes (≈1,500 dials) | $159 (one-time) |
| `STRIPE_PRICE_TOPUP_M3000` | +3,000 talk minutes (best rate) | $469 (one-time) |

An "AI message" = each email, text, call script, or reply the AI writes. Included monthly pools: Starter 50 · Operator 1,500 · Autopilot 10,000 · Scale unlimited. Customers see live meters + buy both kinds of top-up in Settings → Billing; minute packs also keep the dialer running the moment a plan's talk minutes run dry (per-minute pack rates clear ~45–60% margin even at full premium-voice burn). The platform also nudges by itself: when a workspace crosses **80%** of its monthly minutes or messages (and again at 100%), the owner gets one email with the remaining runway in dials and the pack prices — at most one "low" + one "out" per pool per month, automatic on the hourly cron.

### Skip the Stripe dashboard — auto-create everything
You don't have to create products/prices by hand. Set **`STRIPE_SECRET_KEY`** (and `ADMIN_TOKEN`) in Vercel, redeploy, then run this **once**:

```bash
curl -X POST https://recall-touch.com/api/billing/setup \
     -H "Authorization: Bearer $ADMIN_TOKEN"
```

It creates every product, plan price (monthly + annual), and top-up pack in your Stripe — at the exact public prices — and **wires them automatically** (resolved by stable lookup keys, so no `STRIPE_PRICE_*` vars needed). It's idempotent: safe to re-run, and any `STRIPE_PRICE_*` you *do* set still overrides. You only ever add the webhook + `STRIPE_WEBHOOK_SECRET` yourself.

---

## 3) Connect an existing CRM (optional — built-in CRM works with none)
Set one and it's auto-selected; otherwise users connect in-app.

| CRM | Vars | Where |
|---|---|---|
| HubSpot | `HUBSPOT_ACCESS_TOKEN` | Settings → Integrations → Private Apps |
| Pipedrive | `PIPEDRIVE_API_TOKEN` (+ `PIPEDRIVE_API_BASE`) | Settings → Personal → API |
| Salesforce | `SALESFORCE_ACCESS_TOKEN` + `SALESFORCE_INSTANCE_URL` (+ refresh creds) | Connected App |
| Close | `CLOSE_API_KEY` | Close settings |
| Any CRM | `CRM_HTTP_BASE_URL`, `CRM_HTTP_TOKEN` | your thin REST adapter |

**In-app, per user:** Settings → Integrations → *Connect your database* — point at
any PostgREST / Supabase / Airtable / NocoDB / Sheets-as-JSON endpoint
(`DATA_SOURCE_URL`, `DATA_SOURCE_TOKEN`, optional `DATA_SOURCE_MAPPING`). Columns
auto-map.

---

## 4) Omnichannel social (unified inbox)
Each platform is inert until its keys are set; point its webhook at
`…/api/social/<platform>`. Inbound DMs land in one inbox; replies go back out on
the same channel.

| Platform | Vars |
|---|---|
| WhatsApp | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN` |
| Instagram | `IG_TOKEN`, `IG_APP_SECRET`, `IG_VERIFY_TOKEN` |
| Messenger | `MESSENGER_PAGE_TOKEN`, `MESSENGER_APP_SECRET`, `MESSENGER_VERIFY_TOKEN` |
| Telegram | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` |
| X (Twitter) | `X_BEARER_TOKEN`, `X_API_SECRET` |
| LinkedIn | `LINKEDIN_ACCESS_TOKEN` (send-only) |

**One-click "Connect with…" (no token pasting):** register a dev app and set its
client id/secret — then Settings shows an OAuth button.
- Meta (IG + Messenger): `META_APP_ID`, `META_APP_SECRET`
- X: `X_CLIENT_ID`, `X_CLIENT_SECRET`
- LinkedIn: `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`

---

## 5) Autopilot, scheduling & guardrails
| Var | Purpose |
|---|---|
| `CRON_SECRET` | protects `…/api/agent/cron` (Vercel Cron is auto-trusted; schedule in `vercel.json`) |
| `OPERATOR_EMAIL` | YOUR email — turns on the weekly **platform pulse** (Mondays): workspaces, paid subs, estimated MRR, AI/voice usage + COGS, straight from the live DB |

> **Cron cadence:** `vercel.json` ships the **hourly** schedule (`0 * * * *`) — this requires Vercel **Pro** (Hobby rejects anything more frequent than daily, which makes every production deploy fail). On Hobby, change it to a daily expression, or point any external scheduler (cron-job.org, GitHub Actions, your own box) at `GET /api/agent/cron` with `Authorization: Bearer $CRON_SECRET` — the endpoint is built for it.
| `SEQUENCE_AUTOPILOT=true` | auto-send due sequence steps (else queue to Approvals) |
| `REPLY_AUTOPILOT=true` | auto-send AI replies |
| `AGENT_COOLDOWN_DAYS` / `AGENT_DECLINE_COOLDOWN_DAYS` | re-touch spacing |
| `AGENT_DAILY_SEND_CAP` | max autonomous sends per run |
| `AGENT_QUIET_START_UTC` / `AGENT_QUIET_END_UTC` | quiet-hours window |
| `AI_MONTHLY_BUDGET_USD` | cap AI spend per org/month (then falls back to templates) |

---

## 6) Security & infra (recommended)
| Var | Purpose |
|---|---|
| `ENCRYPTION_KEY` | **required for the in-app Connect UI** — encrypts per-org secrets (≥16 chars; keep stable) |
| `ADMIN_TOKEN` | protects the one-time bootstrap endpoint |
| `NEXT_PUBLIC_SITE_URL` | canonical URL for SEO + OAuth redirects (e.g. `https://recall-touch.com`) |
| `NEXT_PUBLIC_NEURAL_VOICE_URL` | optional self-hosted neural TTS (else browser voice) |

---

## Recommended go-live order
1. **Email provider + compliance** (`RESEND_API_KEY` + `EMAIL_FROM` + `OUTBOUND_ORG_NAME` + `COMPLIANCE_ADDRESS`) → real signup/invite/outreach emails.
2. **`ENCRYPTION_KEY`** → unlocks the in-app Connect UI for everyone.
3. **Stripe** → start charging.
4. **SMS/voice + a number** → full multichannel outbound.
5. **Social OAuth apps** → one-click channel connects.
6. **`CRON_SECRET` + autopilot flags** → hands-off operation.

### Auth note
Because a database is connected, sign-in is required automatically. Since email
is currently off, make sure **Supabase → Authentication → Email → "Confirm
email" is OFF** so email/password signups get an instant session. **Google
sign-in works regardless** and needs no email.

A live `…/api/health` always shows the current capability + launch-readiness
verdict (`launch.ready`, `blockers`, `warnings`).
