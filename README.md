# Revenue Recall

A **universal sales OS**: run your entire sales process — pipeline, leads, cadences,
and forecasting — for *any* industry, backed by *any* CRM or none at all. Its
flagship feature, the **Revenue Recall engine**, finds revenue that's slipping
away (deals going cold, stalled mid-pipeline, or marked lost but winnable) and
tells a rep the single best next action.

## Why it's universal

- **Any CRM, or none.** Every backend implements one small `CrmProvider`
  interface. Ships with a fully-working built-in CRM (seeded demo data, zero
  setup), a read+write Close CRM adapter, and stubs for HubSpot / Salesforce /
  Pipedrive that document exactly how to add the next one.
- **Any industry.** Industry templates remap terminology, pipelines, stages, and
  fields. Real estate, mortgage, insurance, SaaS, agency, automotive, home
  services, and a generic fallback ship in the box — add more by appending to
  `src/lib/industries`.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000. With no configuration it boots on the built-in CRM
with realistic demo data for the **real estate** vertical. Copy `.env.example`
to `.env.local` to change industry, org name, or connect a CRM.

## Architecture

```
src/lib/crm/types.ts        Universal domain model + CrmProvider interface
src/lib/crm/providers/      builtin · supabase (full DB) · close · stub (hubspot/sf/pipedrive)
src/lib/crm/registry.ts     Resolves the active provider; auto-selects Supabase when configured
src/lib/supabase/           Row types, tenant resolution, bootstrap (seed a fresh org)
src/lib/comms.ts            Email/SMS/voice — Resend·SendGrid·Twilio adapters + logging fallback
src/lib/industries/         Industry templates (pipelines, terms, fields) + per-vertical voice playbooks
src/lib/copy.ts             Human-voice helpers + the canonical list of "AI tells" to never emit
src/lib/humanness.ts        Scores any copy 0–100 for "sounds human"; flags AI tells live as reps type
src/lib/recall/engine.ts    Revenue Recall scoring + recommendations
src/lib/analytics.ts        Pipeline metrics & weighted forecast
src/lib/queries.ts          Server-side data facade for the UI
src/lib/sequences.ts        Multi-channel outreach cadence definitions (per industry)
src/lib/cadence.ts          Cadence runtime: enroll deals/contacts, advance steps on schedule
src/lib/digest.ts           Scheduled email: daily pipeline digest + task reminders (cron, prefs-gated)
src/lib/webhook.ts          Twilio request-signature verification (HMAC-SHA1)
src/lib/ai/                 AI execution layer (Claude): draft + deal brief, template fallback
src/lib/automations.ts      Trigger → action automation rules
src/lib/templates.ts        Email & SMS template library (merge tokens)
src/components/charts.tsx   Dependency-free SVG charts
src/app/(app)/              Authenticated shell + product pages
src/app/(auth)/             Login / signup (chrome-free layout)
src/app/onboarding/         First-run setup wizard
src/app/api/                Route handlers (create, move, log, search, meta, notifications, sequence enroll, cron)
supabase/migrations/        Org-scoped Postgres schema (RLS) for the built-in CRM
```

## Surfaces

- **Dashboard** — KPIs, revenue trend, goal ring, funnel, recall highlights, activity feed, leaderboard.
- **Autopilot** — users describe a task in plain English ("re-engage cold deals and offer a call"); an AI agent works each matching deal (drafts in review mode, or sends + logs in autonomous mode) and records every action to an immutable run/outcome ledger. Custom scope (recall queue / all open / a stage), channel, autonomy, and **trigger** (manual / daily / on-idle / on-new-lead) per task. Scheduled tasks, due sequence steps, and opted-in digest/reminder emails all run via `/api/agent/cron` (Vercel Cron in `vercel.json`, protected by `CRON_SECRET`).
- **Two-way conversations** — inbound email/SMS webhooks (`/api/inbound/email`, `/api/inbound/sms`) match the contact, log the message, and draft a human-voiced reply — queued to Approvals, or auto-sent when `REPLY_AUTOPILOT=true`. The SMS webhook verifies Twilio's `X-Twilio-Signature` when `TWILIO_AUTH_TOKEN` is set (provably from Twilio), and falls back to a shared `INBOUND_TOKEN` query param otherwise.
- **Approvals inbox** — review-mode AI drafts and inbound-reply drafts queue here; approve to send (+ auto-log) or dismiss, one click each.
- **Your Voice** — no boring forms: describe how you sound or paste a few of your real messages, and AI distills your voice profile. Every draft and call is written *as you* — human, never AI-sounding. Tune it per workspace in Settings → Voice, including your own go-to next-steps and re-engagement openers, which override the industry defaults in every draft and reply.
- **Human-ness check** — a live "does this sound human?" meter under the deal composer scores your copy 0–100 and flags AI tells (clichés, em-dash overuse, no contractions) so nothing robotic ever goes out.
- **AI execution layer** — Claude drafts personalized email/SMS/call outreach per deal and generates strategic deal briefs (situation, next step, talking points, risk). On the deal page and inline in the recall queue. Falls back to high-quality templates with no API key; set `ANTHROPIC_API_KEY` to go live.
- **Revenue Recall** — ranked at-risk queue with reason filters, next-best-action, and one-click AI draft.
- **Pipeline** — drag-and-drop kanban; **Deal** & **Contact** detail with timelines and inline logging.
- **Leads** — searchable directory. **Tasks** — prioritized next actions.
- **Power Dialer** — work the highest-value calls back-to-back: AI call prep (talk track), click-to-call, and AI post-call summary that sets the outcome/sentiment and auto-logs to the timeline.
- **Inbox** — unified email/SMS/call threads with real send (logs to timeline until a provider is configured). **Calendar** — month grid + agenda.
- **Sequences** — multi-step, multi-channel cadences per industry, with a real runtime: enroll the recall queue, all open deals, or a specific deal/contact, and the cron tick works each step on its scheduled day (drafts in-voice → Approvals, or auto-sends under `SEQUENCE_AUTOPILOT`). Closed-won deals drop out; closed-lost stay enrolled for re-engagement. **Templates**, **Automations** — engagement tooling per industry.
- **Reports** & **Forecast** — funnel, sources, leaderboard, commit/best-case/weighted.
- **Settings** — general (incl. the **language** the workspace sells in — drives AI drafting + voice locale), **appearance** (per-org accent that re-themes the whole UI chrome, saved to the org), industry, pipeline, integrations, **team** (invite teammates by email; a matching pending invite joins them to your workspace as a member on first sign-in, instead of provisioning a new org), fields, notifications (saved per-org; the toggles gate the in-app "needs attention" feed — recall flags, new deals, stage moves — and the scheduled emails: daily pipeline digest and task reminders, sent once a day by the cron when an email provider is configured), CSV import (creates contacts + deals via the active provider), and **billing** — real Stripe Checkout + customer portal + a signature-verified webhook that syncs subscription state per org. Inactive (shows the current plan/seat summary) until `STRIPE_*` keys are set; then self-serve upgrades go live.
- Global ⌘K search, quick-create, notifications, responsive mobile nav.

> Every surface works with zero setup on the seeded in-memory store. The real
> backends are fully built behind their interfaces — set env vars to go live,
> no code changes:
>
> - **Database:** set `SUPABASE_*`, run `supabase/migrations/*`, then
>   `POST /api/admin/bootstrap` (Bearer `ADMIN_TOKEN`) to seed an org. The app
>   auto-switches to the multi-tenant Supabase provider.
> - **Email/SMS/Voice:** set `RESEND_API_KEY`/`SENDGRID_API_KEY` and/or
>   `TWILIO_*` and sends/calls go live; otherwise they log to the timeline.
> - **AI:** set `ANTHROPIC_API_KEY` for live drafting, briefs, and call
>   summaries; otherwise high-quality templates. Every live call is metered
>   (tokens + USD cost, shown in Settings → Billing); set `AI_MONTHLY_BUDGET_USD`
>   to cap spend per org — when hit, drafting transparently falls back to the
>   free templates so costs never run away.
>
> The built-in CRM is in-memory and reseeds each boot. For real persistence use
> Supabase; or, on local/self-hosted node, set `BUILTIN_PERSIST=true` to write the
> demo store through to disk (`.data/`) so edits survive restarts.

### Connecting any CRM

Three ways, in increasing effort:

1. **Zero code** — set `CRM_HTTP_BASE_URL` (+ optional `CRM_HTTP_TOKEN`) to a thin
   REST adapter that returns the universal shape (endpoints documented in
   `src/lib/crm/providers/http.ts`). Auto-selected when set. Point it at your CRM,
   an automation tool, or a small proxy you host — connect *anything* without
   touching the app.
2. **Built-in adapters** — Supabase and Close ship ready; HubSpot / Salesforce /
   Pipedrive are stubbed with the exact interface to fill in.
3. **Native adapter** — implement `CrmProvider` (`src/lib/crm/types.ts`) and
   register it in `src/lib/crm/registry.ts`. The rest of the app — dashboard,
   recall engine, board, analytics — works unchanged because it only ever talks
   to the interface.

### Adding an industry

Append an `IndustryTemplate` to `INDUSTRIES` in `src/lib/industries/index.ts`.
You get terminology, a default pipeline, custom fields, and a **voice playbook**
(buyer goal, real objections, natural next-steps per channel, re-engagement
openers, sample rep lines, vocabulary) with no other changes. The playbook feeds
both the live AI prompt and the no-API-key fallbacks, so outreach reads like a
real rep in that vertical — never like AI. TypeScript enforces that every
industry ships a complete playbook.

### Sounding human, never like AI

Every customer-facing generator (drafts, replies, call talk-tracks) is built to
be indistinguishable from a real person: the AI prompts ban the usual "AI tells"
and inject the industry playbook, and the deterministic fallbacks (what the demo
shows with no API key) pull natural, industry-true phrasing and vary per deal.
`src/lib/copy.ts` holds the canonical `AI_TELLS` list, and the test suite asserts
no fallback, template, or sequence ever emits one — across every industry and
channel.

The voice layer goes well past "no clichés":

- **Selectable tones + auto-tone** (`src/lib/tones.ts`, `src/lib/voice/autotone.ts`)
  — warm / direct / consultative / friendly / reassuring / confident / upbeat,
  or "Auto" which picks one from each deal's signals (cold → reassuring,
  late-stage → confident, high-value → consultative …).
- **Self-revision loop** (`src/lib/ai/refine.ts`) — every live draft is scored
  locally and, if it trips any tell, the model rewrites it once; the
  human-ness detector (`src/lib/humanness.ts`) also catches rhythm/burstiness,
  uniform sentences, repetitive openers, and timid hedges.
- **"3 takes" variations** so a rep can pick the most natural draft.
- **Any objection or situation** (`src/lib/ai/intent.ts`) — 15 intents incl.
  price/timing/competitor/skeptic/"just send info", plus busy, authority,
  budget, confused, **gatekeeper**, and hard opt-out; each reframed in
  industry-true language. Unknown input still gets a sensible human reply.
- **Scenarios** — voicemail drops and gracious breakup / last-touch messages.
- **Multilingual** (`src/lib/languages.ts`) — pick the language the workspace
  sells in (13 supported) and every email, text, and call script is written
  idiomatically in it, not translated; the voice synth speaks with a matching
  locale. Inbound auto-replies mirror the language the prospect wrote in.
- **Spoken voice, in-house** (`src/lib/voice/*`) — browser-native TTS + speech
  recognition (no third-party provider, nothing leaves the device), with text
  normalization, prosody, and **emotional delivery** that shifts speed/pitch/
  pauses by mood. Live **role-play** in the dialer with **reactive tone**, real
  turn-taking, natural pauses, and **barge-in** (talk over it and it stops).
  A higher-fidelity neural voice drops in behind the same `setSynth()` seam
  (`docs/neural-voice.md`).
- **Post-call scorecard** (`src/lib/voice/scorecard.ts`) — grades talk ratio,
  questions, objection handling, sentiment arc, and whether a next step was
  booked, with coaching tips.
- **Per-user voice** — onboarding distills each rep's writing voice from samples;
  every message then sounds like that person.

### Autonomous outreach (no human in the loop)

**Autopilot** (`src/lib/agent/`) works deals end to end — drafts and **sends
email/SMS and places calls** in auto mode, logging every action to an immutable
run ledger. **Inbound** (`src/lib/inbound.ts`) replies to anything, **takes a
message** (creates a contact + follow-up task) when the sender is unknown or
unavailable, and never drops a lead.

Hands-off outreach is made safe by guardrails (`src/lib/agent/guardrails.ts`):

- **Opt-out suppression** — never contacts a hard opt-out (unsubscribe / "stop"
  / do-not-contact / hostility).
- **Re-engagement, not abandonment** — a soft "not interested / not now" is
  *paused* for `AGENT_DECLINE_COOLDOWN_DAYS` (default 30) then followed up again.
  A no today isn't a no forever; that's the whole point of Revenue Recall.
- **Cooldown / quiet hours / daily cap** so it can't re-spam, message at 3am, or
  blast volume. The Autopilot page shows the active guardrails.

### Cost & margins

Every live AI call is metered (`src/lib/ai/cost.ts`, `usage.ts`): tokens + USD
cost by model and **per feature**, shown in Settings → Billing. Set
`AI_MONTHLY_BUDGET_USD` to cap spend per org — when hit, drafting transparently
falls back to the free templates, so costs never run away.

## Going live with Supabase

Three secrets are needed (none are derivable for you): the **anon key** and
**service-role key** (Supabase dashboard → Settings → API) and your **database
password** (the one in the Postgres connection string). The project URL is
already derived from the ref.

```bash
# 1. Put the three secrets into .env.local (NEXT_PUBLIC_SUPABASE_ANON_KEY,
#    SUPABASE_SERVICE_ROLE_KEY, and the password inside SUPABASE_DB_URL).

# 2. Apply the schema (psql) — or paste supabase/schema.sql into the SQL editor:
npm run db:migrate

# 3. Run the app and seed one org with demo data:
npm run dev
npm run db:bootstrap          # POSTs /api/admin/bootstrap with ADMIN_TOKEN
```

> **Network can't reach Postgres (ports 5432/6543 firewalled)?** Apply the schema
> over HTTPS via the Management API with a personal access token (`sbp_…`):
> `curl -X POST https://api.supabase.com/v1/projects/<ref>/database/query -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" --data "{\"query\": $(jq -Rs . < supabase/schema.sql)}"`
> Then `db:bootstrap` (which uses the REST API over 443) seeds the org.

The registry auto-switches to the Supabase provider once the env vars are set —
no code changes. `db:bootstrap` is one-time per org.

## Authentication & multi-tenancy

Auth is **off by default** (public demo on a shared org). To enable real
multi-tenant mode, set `NEXT_PUBLIC_AUTH_REQUIRED=true`:

- Supabase Auth (email/password + Google OAuth) via `@supabase/ssr`; middleware
  refreshes sessions and gates app routes.
- On first sign-in, each user is auto-provisioned a clean org (pipeline +
  stages + owner member, linked via `members.auth_user_id`) — the provider
  resolves every request to the signed-in user's org.
- With auth off, the app uses the service-role key + `DEFAULT_ORG_ID` (or the
  first org) so the demo and single-tenant deploys work with zero login.

Server hardening: security headers, `/api/health` probe, error boundary, and
`robots`/`sitemap` for SEO.

## Deploy

Deployable to Vercel as a standard Next.js app. Set the env vars from
`.env.example` in your Vercel project. To back the CRM with a database, run the
migrations in `supabase/migrations/` (see *Going live with Supabase*) and set
the `SUPABASE_*` vars.

## Go-live checklist (selling to real customers)

1. **Database** — `SUPABASE_*` set, migrations applied, an org bootstrapped;
   `NEXT_PUBLIC_AUTH_REQUIRED=true` for real multi-tenant accounts.
2. **AI** — `ANTHROPIC_API_KEY` set; set `AI_MONTHLY_BUDGET_USD` (margin cap) and
   leave `AI_RATE_LIMIT_PER_MIN` at a sane default.
3. **Sending** — connect email/SMS/voice (webhook or built-in adapter) and a
   from number (`OUTBOUND_FROM_NUMBER` or a connected number provider).
4. **Compliance (required before any real send)** — `OUTBOUND_COMPLIANCE=true`
   (default), `OUTBOUND_ORG_NAME`, and `COMPLIANCE_ADDRESS` (a real postal
   address — CAN-SPAM). Outbound email then carries an unsubscribe + address
   footer, SMS carries "Reply STOP", and inbound STOP/UNSUBSCRIBE permanently
   suppresses the contact. Autonomy guardrails (opt-out, re-engagement cooldown,
   quiet hours, daily cap) are on in auto mode.
5. **Billing** — `STRIPE_*` set if you're charging via self-serve checkout.
6. **Security** — HTTPS (HSTS + CSP ship by default), `CRON_SECRET` for the
   scheduler, secrets only in env (never in the repo — `npm run scan:secrets`).
7. **Verify** — `npm run build && npm run smoke` (every route renders) and
   `npm test` green.

