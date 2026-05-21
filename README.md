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
src/lib/crm/providers/      builtin · close · stub (hubspot/salesforce/pipedrive)
src/lib/crm/registry.ts     Resolves the active provider; safe fallback to builtin
src/lib/industries/         Industry templates (pipelines, terms, fields)
src/lib/recall/engine.ts    Revenue Recall scoring + recommendations
src/lib/analytics.ts        Pipeline metrics & weighted forecast
src/lib/queries.ts          Server-side data facade for the UI
src/lib/sequences.ts        Multi-channel outreach cadences
src/app/                    Dashboard · Recall · Pipeline · Leads · Sequences · Settings
supabase/migrations/        Org-scoped Postgres schema (RLS) for the built-in CRM
```

### Adding a CRM

Implement `CrmProvider` (see `src/lib/crm/types.ts`), then register it in
`src/lib/crm/registry.ts`. The rest of the app — dashboard, recall engine,
board, analytics — works unchanged because it only ever talks to the interface.

### Adding an industry

Append an `IndustryTemplate` to `INDUSTRIES` in `src/lib/industries/index.ts`.
You get terminology, a default pipeline, and custom fields with no other changes.

## Deploy

Deployable to Vercel as a standard Next.js app. Set the env vars from
`.env.example` in your Vercel project. To back the built-in CRM with a database,
run `supabase/migrations/0001_init.sql` against a Supabase project and set the
`SUPABASE_*` vars.
