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
| `STRIPE_PRICE_GROWTH` (Operator, $149 **per unit**) / `STRIPE_PRICE_TEAM` (Autopilot, $549 flat) | monthly price IDs |
| `STRIPE_PRICE_GROWTH_ANNUAL` ($1,490/yr per unit) / `STRIPE_PRICE_TEAM_ANNUAL` ($5,490/yr) | optional annual price IDs (~2 months free) |
| `BILLING_ENFORCE=true` | enforce plan limits + action allowances (off = unrestricted trial) |

**Usage top-ups (buy extra AI actions):** create **one-time** prices in Stripe and paste the ids — each pack is purchasable only once its price is set. Amounts are defined in `src/lib/billing/topups.ts`.

| Var | Pack | Suggested price |
|---|---|---|
| `STRIPE_PRICE_TOPUP_1K` | +1,000 actions | $29 (one-time) |
| `STRIPE_PRICE_TOPUP_5K` | +5,000 actions | $99 (one-time) |
| `STRIPE_PRICE_TOPUP_25K` | +25,000 actions | $399 (one-time) |

Included monthly pools: Starter 50 · Operator 1,500 · Autopilot 10,000 · Scale unlimited. Customers see a live meter + buy top-ups in Settings → Billing.

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
