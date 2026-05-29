---
name: revenue-recall-dev
description: "Use when working in the revenue-recall codebase: implementing or reviewing features, adding a CRM provider, touching the recall engine / cadence / AI drafting, adding a Supabase migration, or before committing. Encodes this repo's verification gate, conventions, and core patterns so changes land consistent and green."
metadata:
  author: revenue-recall
  version: "1.0.0"
---

# Revenue Recall — working in this codebase

Next.js (App Router) + TypeScript CRM that surfaces slipping revenue and drafts the outreach to win it back. Runs **zero-setup** (in-memory demo, template drafting) and lights up as Supabase, an AI key, comms providers, and a CRM are configured.

## The gate — run before every commit

All five must be clean. This is non-negotiable for a green branch:

```bash
npx tsc --noEmit          # types
npx next lint             # lint
npx vitest run            # unit/integration tests
npm run build             # production build
npm run scan:secrets      # no committed secrets
```

Tests use Vitest with the `@/` → `src/` alias. `tests/**/*.test.ts` is the glob. Live CRM tests (`tests/live/`) skip unless `CRM_LIVE_SMOKE=1` + real creds, so the normal suite stays offline. Run one file with `npx vitest run tests/<file>.test.ts`.

## Core architecture

- **Universal CRM model** (`src/lib/crm/types.ts`): every backend normalizes to `Opportunity`, `Contact`, `Stage`, `Activity`, `User`. The rest of the app never knows which CRM is behind it.
- **Providers** (`src/lib/crm/providers/`): `builtin`, `supabase`, `close`, `hubspot`, `pipedrive`, `salesforce`, `http`. Selected by `registry.ts` (`getProvider`), which auto-selects a credentialed provider and always falls back to `BuiltinProvider` so the app never hard-fails.
- **Recall engine** (`src/lib/recall/engine.ts`): pure scoring. `scoreOpportunity`/`buildRecallQueue` take optional signals + industry `RecallThresholds`. `computeRecallOutcomes`/`recallByOwner` power ROI analytics.
- **Cadence runtime** (`src/lib/cadence.ts`): enroll → schedule → advance; honors opt-outs, quiet hours, channel reachability.
- **AI drafting** (`src/lib/ai/draft.ts`): live-AI path + deterministic human-sounding fallback; humanness refinement; multilingual.

## Conventions that keep changes safe

- **Backward-compatible signatures.** New behavior goes behind an *optional* parameter with a sensible default (see how `signals`/`thresholds`/`touchedAt` were threaded into the engine), so existing callers and tests are untouched.
- **Extract the tricky logic as a pure, exported function and unit-test it** (e.g. `salesforceStageType`, `soqlEscape`, `pipedriveStages`, `retryAfterMs`, `recallByOwner`, `touchesByWeek`). Adapters then call it.
- **Net resilience:** all CRM HTTP goes through `fetchWithRetry` (`src/lib/crm/net.ts`) — retries 429/5xx with jittered backoff honoring `Retry-After`. Use it for any new outbound call.
- **Dual-mode stores:** in-memory for the demo, Supabase when configured (see `cadence.ts` enrollments and `recall/events.ts`). Mirror that pattern for new persistence; add a `__resetForTests()` so suites isolate.
- **Secrets:** never commit credentials. The scanner gates this. Pass DB URLs/keys as env vars only.

## Adding a CRM provider

1. Implement `CrmProvider` in `src/lib/crm/providers/<name>.ts`; map the vendor API onto the universal model; use `fetchWithRetry`.
2. Register it in `registry.ts` (`build`, auto-select precedence, `listIntegrations`).
3. Document its env var in `.env.example`.
4. Add an integration test (mocked `fetch`) asserting requests AND mapped output, plus a readiness test. Extend `tests/live/crm.live.test.ts`.

## Supabase migrations

Numbered SQL files in `supabase/migrations/` (e.g. `0017_recall_events.sql`), applied with `npm run db:migrate` (reads `SUPABASE_DB_URL`). Use `create table if not exists`, RLS enabled, `org_id` tenancy with `current_org_id()`. Provider-level ids are stored as `text` (no FK — the CRM may not be Supabase). `schema.sql` is a stale snapshot; `migrations/` is the source of truth.

## Git

Work on the designated feature branch; never push to the default branch without permission. Keep commits self-contained with a clear subject + why. Don't open a PR unless asked.
