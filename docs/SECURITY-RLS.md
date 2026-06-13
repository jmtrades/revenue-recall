# Tenant isolation & Row-Level Security

This app is multi-tenant: every row of customer data belongs to an `org_id`, and
one org must never see another's data. This doc is the source of truth for how
that isolation is enforced and how to extend it safely.

## The two clients

| Client | Key | Role | RLS | Use for |
|---|---|---|---|---|
| `getSupabase()` (`lib/supabase/client.ts`) | service-role | `service_role` | **bypassed** | Background/system work with no user session: cron, webhooks, inbound handlers, provisioning, and trusted writes. Caller MUST pass an already-verified `org_id`. |
| `getOrgScopedSupabase()` (`lib/supabase/server.ts`) | anon | `authenticated` | **enforced** | User-facing reads in an authenticated request. Postgres scopes rows to the caller's org; a forgotten `.eq("org_id")` degrades to an empty result, not a leak. |

`getOrgScopedSupabase()` is the same session client as `getServerSupabase()`
(the auth client), exposed under an intent-revealing name for data reads.

## What the database enforces

- **RLS is enabled on every org-scoped table** (see the list in
  `tests/org-isolation-tripwire.test.ts`).
- Policies are **membership-based** via the `current_org_id()` SECURITY DEFINER
  function (migration `0003`): `org_id = current_org_id()`, where
  `current_org_id()` reads the caller's org from `members` keyed on
  `auth.uid()`. **No custom JWT/access-token hook is required** — a plain
  signed-in session is enough.
- Every write-capable (INSERT/UPDATE/ALL) policy has a **`WITH CHECK`** clause,
  so the session client can't write a row into another org.
- `tests/rls-policy-coverage.test.ts` fails CI if any org-scoped table ships
  without RLS + a live policy, or a write policy lacks `WITH CHECK`.

Because the app has historically used the service-role key for everything, RLS
has been a *dormant backstop*. We are migrating user-facing reads onto the
session client so it actively enforces. Until that migration is complete, the
service-role paths are guarded by `tests/org-isolation-tripwire.test.ts`, which
fails CI when a new file queries an org-scoped table without being audited for
explicit `org_id` scoping.

## The `RLS_ENFORCE_READS` flag

User-facing reads route through a single context-aware selector,
`getOrgReadClient()` (`lib/supabase/read-client.ts`):

| Context | Client | Why |
|---|---|---|
| Flag off (default) | service-role | byte-identical to legacy behavior |
| `runWithOrg` active (cron/webhook) | service-role | no session; already org-authorized |
| Authenticated request | **session (RLS)** | Postgres scopes rows to the caller's org |
| Public/unauth request (`/book/[org]`, forms) | service-role | scoped by explicit org id; RLS would empty it |
| Not configured / any error | service-role / null | fail-safe — a read never breaks |

Writes never use the selector; they stay on the service-role client.

**Rollout:** the flag defaults **off** because there's no way to test against a
real Postgres from CI and the blast radius is every dashboard read. To turn RLS
enforcement on:

1. On **staging** (separate Supabase project), set `RLS_ENFORCE_READS=true`.
2. Run `supabase/rls-verify.sql` (impersonates a signed-in user, proves reads
   are org-scoped and cross-tenant reads/writes are denied).
3. Smoke the app as a real user: dashboard, pipeline, leads, recall, reports all
   show the right data.
4. Flip it in production. Reversible instantly by unsetting the env var.

## Surfaces under active RLS

| Surface | Status | Notes |
|---|---|---|
| Audit log read (`listAudit`, `/api/audit`) | ✅ RLS-enforced (unconditional) | Read via session client; SELECT policy in `0052`. Writes (`recordAudit`) stay service-role → append-only. |
| CRM provider reads (`SupabaseProvider`) — powers dashboard, pipeline, leads, recall, reports, contacts/activities | ✅ RLS-enforced when `RLS_ENFORCE_READS=true` | All entity reads flow through `queries.ts` → `resolveProvider()` → this provider, so one chokepoint covers them. Writes stay service-role. |
| `org.ts` (`getOrgSettings`), and the smaller `*-store` modules | service-role + manual `org_id` + tripwire | Hot, dual-use (called from cron too) or low-sensitivity. Next phase — migrate read paths via the recipe below. |
| Public surfaces (booking, hosted forms, inbound) | service-role (by design) | No session; scoped by explicit org id from the URL/token. Must NOT move to the session client. |

## How to put a new read surface under RLS

1. **Confirm the path is always authenticated** — a Server Component or Route
   Handler behind auth, never reachable from cron/webhook/provisioning.
2. **Ensure the table has a SELECT policy** (`org_id = current_org_id()`) and
   `grant select … to authenticated`. Add a migration if missing; verify with
   `tests/rls-policy-coverage.test.ts`.
3. **Switch the read** from `getSupabase()` to `getOrgScopedSupabase()`. Keep
   the explicit `.eq("org_id", …)` as defense-in-depth.
4. **Keep writes on the appropriate client.** System-of-record/append-only
   writes (audit, billing, usage) belong on service-role. Only move a write to
   the session client once the table has a `WITH CHECK` write policy and the
   path is always authenticated.
5. **Add a test** pinning which client the read uses (see `tests/audit-rls.test.ts`).

## Known limitation

`current_org_id()` returns a single org (`limit 1`). If one user ever belongs to
multiple orgs, RLS pins them to an arbitrary one. The app's model is one active
org per session, so this is currently correct; supporting multi-org membership
would require broadening the helper to a set-returning `current_org_ids()` and
updating policies to `org_id in (select …)`. Tracked, not yet needed.
