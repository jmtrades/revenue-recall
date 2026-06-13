import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Request-scoped Supabase client bound to the user's session cookies (anon key).
 * Use this for auth and any RLS-enforced, user-scoped reads. Returns null when
 * Supabase isn't configured. Cookie writes are no-ops in Server Components
 * (only Server Actions / Route Handlers / middleware may set them) — hence the
 * try/catch, per Supabase's SSR guidance.
 */
export function getServerSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const store = cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* called from a Server Component — safe to ignore */
        }
      },
    },
  });
}

/**
 * RLS-ENFORCED, request-scoped client for reading the current user's org data.
 *
 * This is the same session/anon-key client as getServerSupabase(), exposed
 * under an intent-revealing name. Use it (NOT the service-role getSupabase())
 * for user-facing reads: queries run as the `authenticated` role, so Postgres
 * RLS — the membership-scoped policies, not a hand-written .eq("org_id", …) —
 * is what enforces tenant isolation. A missed filter degrades to an empty
 * result instead of a cross-tenant leak.
 *
 * Only valid in an authenticated request context (Server Component / Route
 * Handler behind auth). Background paths with no session (cron, webhooks,
 * provisioning) must keep using the service-role getSupabase() and pass an
 * explicit, already-verified org id. Returns null when Supabase isn't
 * configured; with no session it returns a client that RLS will simply scope
 * to zero rows (fail-safe for reads).
 */
export function getOrgScopedSupabase(): SupabaseClient | null {
  return getServerSupabase();
}
