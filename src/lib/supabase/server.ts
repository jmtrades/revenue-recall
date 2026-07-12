import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Request-scoped Supabase client bound to the user's session cookies (anon key).
 * Use this for auth and any RLS-enforced, user-scoped reads. Returns null when
 * Supabase isn't configured. Cookie writes are no-ops in Server Components
 * (only Server Actions / Route Handlers / middleware may set them) — hence the
 * try/catch, per Supabase's SSR guidance.
 *
 * cookies() is async in Next 16, so the adapter methods await it per call —
 * @supabase/ssr supports async getAll/setAll, which keeps this factory
 * synchronous for its many callers.
 */
export function getServerSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createServerClient(url, key, {
    cookies: {
      async getAll() {
        return (await cookies()).getAll();
      },
      async setAll(cookiesToSet) {
        try {
          const store = await cookies();
          cookiesToSet.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          /* called from a Server Component — safe to ignore */
        }
      },
    },
  });
}
