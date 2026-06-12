# Deploying Revenue Recall

Revenue Recall runs **zero-config** (seeded demo data, template drafting, logged
comms) and progressively lights up as you add credentials. Nothing below is
required to boot — start with a key and add the rest when you're ready to sell.

## 1. See & use it (≈2 minutes)

1. **Vercel → Add New → Project → Import** `jmtrades/revenue-recall`.
2. Set the **Production Branch** to the branch you want live (the default branch
   once PR #1 is merged).
3. Add **`ANTHROPIC_API_KEY`** in the project's Environment Variables → live AI
   drafting. (Skip it and the app still runs on high-quality templates.)
4. **Deploy.** You get a live URL with the entire clickable system.

`vercel.json` already registers the daily cron (`/api/agent/cron`, 13:00 UTC)
that advances sequences, collects draft batches, and sends digests.

## 2. Environment variables (by capability)

The app boots with none of these. Add a group to unlock that capability, then
redeploy.

| Capability | Variables |
|---|---|
| **Live AI** | `ANTHROPIC_API_KEY` (req); `ANTHROPIC_MODEL` (default `claude-opus-4-8`), `ANTHROPIC_EFFORT` (`low\|medium\|high\|xhigh\|max`), `AI_MONTHLY_BUDGET_USD` |
| **Persistence + auth + multi-tenant** | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_DB_URL`, `NEXT_PUBLIC_AUTH_REQUIRED=true` |
| **Billing** | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*` |
| **Email/SMS sending** | `RESEND_API_KEY` or `SENDGRID_API_KEY`; Twilio (`TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_FROM_NUMBER`); or `EMAIL_WEBHOOK_URL`/`SMS_WEBHOOK_URL`/`VOICE_WEBHOOK_URL` |
| **A CRM** (optional) | one of `HUBSPOT_ACCESS_TOKEN`, `PIPEDRIVE_API_TOKEN`, `CLOSE_API_KEY`, `SALESFORCE_ACCESS_TOKEN`+`SALESFORCE_INSTANCE_URL` (or `SALESFORCE_REFRESH_TOKEN`+`SALESFORCE_CLIENT_ID`), or `CRM_HTTP_BASE_URL` |
| **Org identity** | `NEXT_PUBLIC_ORG_NAME`, `NEXT_PUBLIC_INDUSTRY`, `NEXT_PUBLIC_MONTHLY_QUOTA`, `NEXT_PUBLIC_ORG_LANGUAGE` |
| **Cron + autonomy** | `CRON_SECRET` (Bearer auth for `/api/agent/cron`); `SEQUENCE_AUTOPILOT`, `SEQUENCE_BATCH`, `REPLY_AUTOPILOT`, `AGENT_*` guardrails |

See `.env.example` for the full annotated list.

## 3. Database (only when using Supabase)

Apply all migrations once, in order:

```bash
SUPABASE_DB_URL="postgresql://postgres:PASSWORD@db.<ref>.supabase.co:5432/postgres" npm run db:migrate
```

Or paste **every** file from `supabase/migrations/` into the Supabase SQL Editor,
in numeric order — the folder is the source of truth (don't trust any doc that
names a count; new migrations land regularly). Migrations are idempotent
(`create … if not exists`); prefer `npm run db:migrate`, which tracks what ran.

## 4. Verify

```bash
npm run build && npm run smoke      # boots prod server, asserts every route renders
npm run test                        # unit + integration suite
CRM_LIVE_SMOKE=1 npm run smoke:crm  # live CRM check (needs provider creds)
AI_LIVE_SMOKE=1 npm run smoke:ai    # live AI check (needs ANTHROPIC_API_KEY)
```

## 5. Go-live checklist

- [ ] Import repo to Vercel, set production branch, deploy.
- [ ] `ANTHROPIC_API_KEY` set (live drafting).
- [ ] Supabase configured + migrations `0001`–`0018` applied (multi-tenant, persistence).
- [ ] `NEXT_PUBLIC_AUTH_REQUIRED=true` (require sign-in for tenants).
- [ ] Stripe keys + webhook (billing).
- [ ] A sending provider connected; run **Settings → Send a test** and **Test AI**.
- [ ] `CRON_SECRET` set; confirm the daily cron runs.
- [ ] Compliance: org sender identity + physical address set (CAN-SPAM).
- [ ] If using `SEQUENCE_BATCH=true`: validate one batch round-trip (submit → later
      cron tick collects drafts into Approvals).
</content>
