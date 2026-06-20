# Revenue Recall — project guide

Autonomous AI sales OS: revives cold/dead leads and runs outbound across email, SMS,
and voice (calls in a natural, cloned human voice). Autopilot sequences, power dialer,
a live conversational phone agent, multi-tenant Supabase, Stripe billing. Live at
**recall-touch.com**.

## ⚠️ Branch & deploy topology (read first)

Three branches matter:

- **`main`** — canonical. All PRs target it.
- **`claude/build-universal-sales-system-RY33X`** — **this is the branch recall-touch.com
  actually deploys** (the repo default). It must be kept **IN SYNC with `main`** after every
  merge, or your change won't go live.
- **`claude/elevenlsbs-connection-vhvfra`** — the feature branch to develop on.

### Workflow for every change
1. `git checkout -B claude/elevenlsbs-connection-vhvfra origin/main` (start from canonical).
2. Make the change; run the **full gate** (below).
3. Commit, push, open a PR into `main`, squash-merge it.
4. **Sync production:** check out RY33X from its remote, copy the merged files from
   `origin/main` onto it, commit, push:
   ```
   git checkout -B claude/build-universal-sales-system-RY33X origin/claude/build-universal-sales-system-RY33X
   git checkout origin/main -- <changed files>
   git commit -m "... (sync from main #PR)" && git push -u origin claude/build-universal-sales-system-RY33X
   ```
5. **Verify IN SYNC:** `git diff --stat origin/main origin/claude/build-universal-sales-system-RY33X`
   must be **empty**.
6. Return to the feature branch reset to `origin/main` for the next task.

Git identity for commits: `Claude <noreply@anthropic.com>` (set via `git config`). The
"Unverified" stop-hook warnings on squash-merge commits are GitHub's own merge commits —
not actionable from here.

## The gate (run before every PR; all must pass)

```
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
npm run test        # vitest (≈1,457 tests)
npm run build       # next build
npm run smoke       # node scripts/smoke.mjs — every route renders
npm run scan:secrets
```
For the Python services: `python3 -m py_compile services/call-gateway/*.py`
and `cd services/call-gateway && python3 -m unittest discover -s tests` (stdlib-only tests).

## Architecture

- **App:** Next.js 14 (App Router) + TypeScript. Routes in `src/app`; `(app)` = the
  signed-in product, `(auth)` = login/signup, `marketing` + `/pricing` = public.
- **Data:** Supabase (Postgres). **Every tenant table has RLS scoped by `current_org_id()`** —
  never weaken this. Server reads use the request-scoped client (`src/lib/supabase/server.ts`).
- **CRM is provider-abstracted** (`src/lib/crm/*`): built-in (in-memory / no-Supabase) +
  Supabase provider. Most logic degrades gracefully with no DB.
- **Billing:** Stripe. Plans/prices in `src/lib/billing/catalog.ts` + `plans.ts`;
  entitlements/allowances in `entitlements.ts`; usage top-ups in `topups.ts`.
- **Voice:** `src/lib/voice/*`. ElevenLabs via the official `@elevenlabs/elevenlabs-js`
  SDK (`eleven-client.ts`); house voices map 1:1 to distinct ElevenLabs voices in
  `tts.ts` (`ELEVEN_VOICES`); read-aloud auto-prefers `eleven_v3` with a self-healing
  fallback; live calls use Turbo v2.5.
- **Python service** (self-hosted, optional): `services/call-gateway` (live phone agent:
  local Whisper STT → Opus brain → **ElevenLabs** TTS, with barge-in and streamed replies).
  Heavy deps imported lazily so the orchestration layer/tests load clean. (Voice is
  ElevenLabs-only — there is no in-house/on-device TTS service.)
- **LLM:** Anthropic. Opus 4.8 for replies/warm drafts/the call brain; Sonnet 4.6 for
  high-volume cold outreach (`src/lib/ai/client.ts`). Cost model in `src/lib/ai/cost.ts`.

## Conventions & guardrails (don't regress these)

- **Provider-agnostic + inert-without-config:** features light up when a key/URL is set
  and degrade cleanly (templates / written voice / "logged") when not. Never hard-require config.
- **Compliance is load-bearing:** autonomous calls are **consent-gated** (`hasCallConsent`)
  and quiet-hours/opt-out gated. Don't bypass these.
- **No unverified claims:** the product blocks unverified claims in outreach
  (`containsUnverifiedClaim`); marketing copy holds the same bar — no fabricated stats or guarantees.
- **Pricing copy = value, not arithmetic:** never expose divisible unit counts ("1,500
  minutes", "X messages") in buyer-facing copy — frame as abundance ("works your whole
  list", "add capacity anytime"). Reprices **grandfather** existing subscribers.
- **Margins:** plans are designed for ≥70% gross margin even at full consumption — see
  `voice-minutes.ts`. Don't widen included allowances without re-checking the math.
- **Security:** never commit secrets (CI scans). Keep RLS on every tenant table.
