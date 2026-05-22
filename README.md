# Revenue Recall

A **universal sales OS**: run your entire sales process — pipeline, leads, cadences,
and forecasting — for *any* industry, backed by *any* CRM or none at all. Its
flagship feature, the **Revenue Recall engine**, finds revenue that's slipping
away (deals going cold, stalled mid-pipeline, or marked lost but winnable) and
tells a rep the single best next action.

## Why it's universal

- **Any CRM, or none.** Every backend implements one small `CrmProvider`
  interface. Ships with a fully-working built-in CRM (seeded demo data, zero
  setup), a Close CRM adapter, and stubs for HubSpot / Salesforce / Pipedrive
  that document exactly how to add the next one.
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
src/lib/industries/         Industry templates (pipelines, terms, fields)
src/lib/recall/engine.ts    Revenue Recall scoring + recommendations
src/lib/analytics.ts        Pipeline metrics & weighted forecast
src/lib/queries.ts          Server-side data facade for the UI
src/lib/sequences.ts        Multi-channel outreach cadences
src/lib/ai/                 AI execution layer (Claude): draft + deal brief, template fallback
src/lib/automations.ts      Trigger → action automation rules
src/lib/templates.ts        Email & SMS template library (merge tokens)
src/components/charts.tsx   Dependency-free SVG charts
src/app/(app)/              Authenticated shell + product pages
src/app/(auth)/             Login / signup (chrome-free layout)
src/app/onboarding/         First-run setup wizard
src/app/api/                Route handlers (create, move, log, search, meta, notifications)
supabase/migrations/        Org-scoped Postgres schema (RLS) for the built-in CRM
```

## Surfaces

- **Dashboard** — KPIs, revenue trend, goal ring, funnel, recall highlights, activity feed, leaderboard.
- **Autopilot** — users describe a task in plain English ("re-engage cold deals and offer a call"); an AI agent works each matching deal (drafts in review mode, or sends + logs in autonomous mode) and records every action to an immutable run/outcome ledger. Custom scope (recall queue / all open / a stage), channel, autonomy, and **trigger** (manual / daily / on-idle / on-new-lead) per task. Scheduled tasks run via `/api/agent/cron` (Vercel Cron in `vercel.json`, protected by `CRON_SECRET`).
- **Approvals inbox** — review-mode AI drafts queue here; approve to send (+ auto-log) or dismiss, one click each.
- **AI execution layer** — Claude drafts personalized email/SMS/call outreach per deal and generates strategic deal briefs (situation, next step, talking points, risk). On the deal page and inline in the recall queue. Falls back to high-quality templates with no API key; set `ANTHROPIC_API_KEY` to go live.
- **Revenue Recall** — ranked at-risk queue with reason filters, next-best-action, and one-click AI draft.
- **Pipeline** — drag-and-drop kanban; **Deal** & **Contact** detail with timelines and inline logging.
- **Leads** — searchable directory. **Tasks** — prioritized next actions.
- **Power Dialer** — work the highest-value calls back-to-back: AI call prep (talk track), click-to-call, and AI post-call summary that sets the outcome/sentiment and auto-logs to the timeline.
- **Inbox** — unified email/SMS/call threads with real send (logs to timeline until a provider is configured). **Calendar** — month grid + agenda.
- **Sequences**, **Templates**, **Automations** — engagement tooling per industry.
- **Reports** & **Forecast** — funnel, sources, leaderboard, commit/best-case/weighted.
- **Settings** — general, industry, pipeline, integrations, team, fields, notifications, import, billing.
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
>   summaries; otherwise high-quality templates.

### Adding a CRM

Implement `CrmProvider` (see `src/lib/crm/types.ts`), then register it in
`src/lib/crm/registry.ts`. The rest of the app — dashboard, recall engine,
board, analytics — works unchanged because it only ever talks to the interface.

### Adding an industry

Append an `IndustryTemplate` to `INDUSTRIES` in `src/lib/industries/index.ts`.
You get terminology, a default pipeline, and custom fields with no other changes.

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

