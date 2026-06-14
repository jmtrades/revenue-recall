import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/client";
import { getOrgScopedSupabase } from "@/lib/supabase/server";
import { getOrgOverride } from "@/lib/supabase/org-context";
import { getSessionUser } from "@/lib/auth";

/**
 * Feature flag for RLS-enforced reads. When ON, user-facing org reads run
 * through the session (anon-key) client so Postgres Row-Level Security — not a
 * hand-written .eq("org_id") — is what isolates tenants. Default OFF, so the
 * behavior is byte-identical to before until an operator flips
 * RLS_ENFORCE_READS=true AFTER verifying isolation on staging (the procedure is
 * in docs/SECURITY-RLS.md). The flag exists because there is no way to test
 * against a real Postgres from CI, and the blast radius (every dashboard read)
 * is the whole app — so enforcement is opt-in and reversible by one env var.
 */
export function rlsReadsEnabled(): boolean {
  return process.env.RLS_ENFORCE_READS === "true";
}

/**
 * The Supabase client to use for an org-scoped READ in the current context.
 *
 *   flag off                       → service-role  (legacy; isolation via .eq("org_id"))
 *   background (runWithOrg active)  → service-role  (cron/webhook: no session, already authorized)
 *   authenticated user request      → session client (RLS enforces the caller's org)
 *   public / unauthenticated request → service-role  (scoped by an explicit org id, e.g. /book/[org])
 *   not configured / any error       → service-role / null (FAIL-SAFE: a read never breaks)
 *
 * Writes never call this — they stay on the service-role getSupabase(), which
 * keeps background jobs and append-only/system-of-record writes working and
 * avoids depending on every WITH CHECK policy being perfect before we can ship.
 */
export async function getOrgReadClient(): Promise<SupabaseClient | null> {
  const service = getSupabase();
  // Flag off, or Supabase not configured → exactly the prior behavior.
  if (!service || !rlsReadsEnabled()) return service;
  // Background work authorized by runWithOrg has no user session; RLS would
  // scope it to zero rows. It's already org-scoped by the override, so it must
  // use the service-role client.
  if (getOrgOverride()) return service;
  try {
    const user = await getSessionUser();
    // No session = a public page (booking widget, hosted form) reading a
    // specific org by id, or demo/no-auth. RLS would empty it → use service-role
    // (the read is constrained by an explicit org id the caller already holds).
    if (!user) return service;
    // Authenticated request: the session client runs as `authenticated`, so
    // current_org_id() pins rows to this user's org. This is where RLS earns
    // its keep — a forgotten filter becomes empty, not a leak.
    return getOrgScopedSupabase() ?? service;
  } catch {
    // cookies() called outside a request scope, an auth hiccup, etc. — never let
    // client selection break a read.
    return service;
  }
}
