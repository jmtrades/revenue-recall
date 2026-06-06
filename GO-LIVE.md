# Go-Live Runbook

Everything required to take Revenue Recall from a green build to a live,
revenue-generating deployment. Work top to bottom. Items marked **[required]**
are needed for a basic launch; **[optional]** unlock a capability when you want
it. Companion docs: `SETUP.md` (local/dev), `GO-LIVE-CALLS.md` and
`services/call-gateway/README.md` (AI calls), `DEPLOY.md` (hosting notes).

---

## 0. Accounts you'll need
- **Supabase** project (Postgres + Auth) — **[required]**
- **Vercel** project (hosting the Next.js app) — **[required]**
- **Anthropic** API key — **[required for live AI drafting/calls]** (without it the app runs on deterministic templates)
- **Stripe** account — **[required to charge]**
- An **email sending** provider: Resend *or* SendGrid *or* your own webhook — **[required to send email]**
- **Twilio** (or a SIP trunk) — **[optional, for SMS + phone]**
- A host for the **call-gateway** (e.g. Render) — **[optional, for autonomous AI calls]**

---

## 1. Database (Supabase)
1. Create the project; copy the **Project URL**, **anon key**, and **service-role key**.
2. Apply migrations in `supabase/migrations/` in order (Supabase CLI `db push`, or paste each `.sql`). The schema is currently at **0035**.
3. Confirm Row Level Security is on (the migrations enable it). The app's
   service-role calls are explicitly org-scoped, but RLS is the backstop.

## 2. Vercel environment variables
Set these in **Vercel → Project → Settings → Environment Variables** (Production).

### Core **[required]**
| Var | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key (server-only — never `NEXT_PUBLIC`) |
| `NEXT_PUBLIC_SITE_URL` | `https://app.recall-touch.com` (your canonical app URL; used for unsubscribe/form/inbound/calendar URLs) |
| `ENCRYPTION_KEY` | a random string **≥16 chars** (encrypts connection secrets at rest) |

### Security secrets **[required]** — generate long random values (`openssl rand -hex 32`)
| Var | Purpose |
|---|---|
| `CRON_SECRET` | authenticates the cron endpoint + its per-tenant fan-out |
| `INBOUND_SIGNING_SECRET` | authenticates inbound email/SMS/bounce + derives per-org inbound tokens |
| `UNSUBSCRIBE_SECRET` | signs unsubscribe / hosted-form / calendar-feed links |
| `COMMS_WEBHOOK_TOKEN` | shared secret between the app and the call-gateway |

> These also fail **closed** in production: with no secret set, the inbound and cron endpoints reject everything.

### AI **[required for live AI]**
| Var | Value |
|---|---|
| `ANTHROPIC_API_KEY` | your key (omit to run on templates) |
| `AI_MONTHLY_BUDGET_USD` | optional hard spend cap (margin guard) |

### Email sending — pick ONE **[required to send email]**
- **Resend:** `RESEND_API_KEY` + `EMAIL_FROM` (a verified-domain address)
- **SendGrid:** `SENDGRID_API_KEY` + `EMAIL_FROM`
- **Your gateway:** `EMAIL_WEBHOOK_URL` (+ `COMMS_WEBHOOK_TOKEN`)

> `EMAIL_FROM` must be a **real, verified** address — the placeholder `sales@example.com` is treated as "not configured" and email falls back to logging.

### SMS + Voice **[optional]**
- **Twilio (simplest):** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
- **Or webhooks:** `SMS_WEBHOOK_URL`, `VOICE_WEBHOOK_URL` (+ `COMMS_WEBHOOK_TOKEN`)
- Per-org caller ID is set in-app (Settings → Numbers); these are the platform fallback.
- **In-app number buying [optional]:** `NUMBERS_WEBHOOK_URL` + `NUMBERS_WEBHOOK_TOKEN` to provision numbers from Settings → Numbers.

### Billing (Stripe) **[required to charge]** — see §3
`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`,
`STRIPE_WEBHOOK_SECRET`, the price ids (`STRIPE_PRICE_GROWTH`, `STRIPE_PRICE_TEAM`,
`STRIPE_PRICE_SCALE`, their `_ANNUAL` variants, `STRIPE_PRICE_TOPUP_*`), and
optionally `STRIPE_TRIAL_DAYS`. Set `BILLING_ENFORCE=true` to enforce plan limits.

### Autopilot toggles **[optional — start conservative]**
| Var | Effect |
|---|---|
| `REPLY_AUTOPILOT=true` | auto-send inbound replies (else queued to Approvals) |
| `SEQUENCE_AUTOPILOT=true` | auto-send cadence steps (else queued) |
| `AGENT_QUIET_START_UTC` / `AGENT_QUIET_END_UTC` / `AGENT_TIMEZONE` | quiet hours |
| `AGENT_DAILY_SEND_CAP` | max autonomous sends per run |
| `CALL_RECORDING_DISCLOSURE` | spoken first on calls (two-party-consent states) |

> Recommended launch posture: leave the AUTOPILOT flags **off** first (everything queues to Approvals), watch the drafts, then flip them on.

### Operational **[optional]**
| Var | Effect |
|---|---|
| `ALERT_WEBHOOK_URL` | POST a JSON alert on cron failures / partial fan-out failures (wire to Slack/PagerDuty). Without it, failures still log to the server. |
| `WRITE_RATE_LIMIT_PER_MIN` · `AI_RATE_LIMIT_PER_MIN` · `IMPORT_RATE_LIMIT_PER_MIN` | per-client throttle overrides (defaults 120 · 30 · 10/min) — leave unset unless tuning. |
| `DIGEST_SEND_HOUR_UTC` | hour (UTC) the daily digest/reminders go out; default `13`. The cron runs hourly but the digest only fires in/after this hour, so it never lands at midnight. |

## 3. Stripe setup **[required to charge]**
1. Create **Products/Prices** matching the catalog in `src/lib/billing/plans.ts` (Growth, Team, Scale — monthly + annual — and the top-up packs). Put each price id in the matching `STRIPE_PRICE_*` env var.
2. **Webhook:** add an endpoint to `https://<app>/api/billing/webhook`, subscribe to `checkout.session.completed`, `customer.subscription.*`, and `invoice.*`; copy its signing secret to `STRIPE_WEBHOOK_SECRET`.
3. Test with Stripe test mode + a test card before switching to live keys.

## 4. Cron (the autonomous engine) **[required for autonomy]**
Schedule a POST to `/api/agent/cron` with header `Authorization: Bearer $CRON_SECRET`.
- **Vercel Cron:** already configured in `vercel.json` to run **hourly** (`0 * * * *` — needs the Pro plan); Vercel sends the bearer automatically when `CRON_SECRET` is set.
- The endpoint fans out per-org, advances cadences hourly, ticks Autopilot tasks, and sends the daily digest once per day in/after `DIGEST_SEND_HOUR_UTC` — all idempotent and lock-guarded, so the hourly cadence never double-sends or emails the digest twice.

## 5. DNS **[required]**
1. **App domain:** point `app.recall-touch.com` (or apex) at Vercel. **Remove the apex→www redirect if www is disabled** — that's what currently returns 402.
2. **Email auth (deliverability):** add **SPF**, **DKIM**, and **DMARC** records for your sending domain per your email provider's instructions. Skipping this lands mail in spam and wrecks sender reputation.

## 6. AI calls **[optional]**
Deploy the in-house call-gateway (`services/call-gateway/`, e.g. on Render) and set:
`VOICE_WEBHOOK_URL=https://<gateway>/voice`, `COMMS_WEBHOOK_TOKEN` (same as the app),
and on the gateway `CALL_STATUS_WEBHOOK_URL=https://<app>/api/calls/log` plus its
STT/TTS/trunk config. Full steps: `services/call-gateway/README.md` and `GO-LIVE-CALLS.md`.
Verify in-app at **Settings → Channels → Calling gateway** (it live-pings the gateway).

> **Voicemail detection [optional]:** set `AMD_ENABLED=true` on the gateway so a call that hits voicemail is logged as `voicemail` (which fires the app's voicemail follow-up + call-retry) instead of `no-answer`. See `services/call-gateway/README.md`.

## 7. Inbound (replies, bounces, opt-outs)
In **Settings → Channels → Inbound email & SMS**, copy each org's private inbound
URL and configure it in that org's email provider (inbound-parse) and SMS number
(webhook). Bounce/complaint events → the bounce URL. These carry a per-org token
so messages land on the right tenant.

---

## 8. Go-live verification (smoke test after deploy)
- [ ] `https://<app>/api/health` → 200
- [ ] Sign up → land in onboarding → reach the dashboard
- [ ] **Settings → Channels** shows your email/SMS/voice as **live** (not "log")
- [ ] Create a deal; it appears in the pipeline and (when it slips) the Recall queue
- [ ] Send a test message (Settings → Test send) and confirm it arrives
- [ ] Trigger the cron once manually (`curl -XPOST -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/agent/cron`) → `{ ok: true }`
- [ ] Complete a Stripe test checkout → the plan updates in-app
- [ ] (calls) Place a test call from the Dialer → it dials via the gateway

## 9. Recommended launch posture
1. Start with AUTOPILOT flags **off** — everything drafts to Approvals; review quality.
2. Turn on `SEQUENCE_AUTOPILOT`, then `REPLY_AUTOPILOT`, once you trust the drafts.
3. Set quiet hours + a daily send cap before going fully autonomous.
4. Keep `BILLING_ENFORCE=true` so plan limits actually apply.
