import { cache } from "@/lib/cache";
import { getSupabase } from "@/lib/supabase/client";
import { getSessionUser } from "@/lib/auth";
import { ensureOrgForUser } from "@/lib/supabase/provision";
import { getActiveOrgId } from "@/lib/supabase/tenant";
import { getOrgOverride } from "@/lib/supabase/org-context";

/**
 * The org id for the current request. An explicit override (set by a webhook
 * that already identified the owning org via runWithOrg) wins; then a signed-in
 * user resolves to (and is provisioned) their own org; otherwise we fall back to
 * DEFAULT_ORG_ID / the first org (demo / single-tenant).
 */
export async function resolveActiveOrgId(): Promise<string | null> {
  const override = getOrgOverride();
  if (override) return override;
  return resolveFromSession();
}

// Session-derived resolution is request-cached; the override branch above is
// scoped by AsyncLocalStorage (per webhook event) so it's read fresh.
const resolveFromSession = cache(async (): Promise<string | null> => {
  const client = getSupabase();
  if (!client) return null;
  const user = await getSessionUser();
  if (user) return ensureOrgForUser(user);
  return getActiveOrgId(client);
});
