import { cache } from "@/lib/cache";
import { getSupabase } from "@/lib/supabase/client";
import { getSessionUser } from "@/lib/auth";
import { ensureOrgForUser } from "@/lib/supabase/provision";
import { getActiveOrgId } from "@/lib/supabase/tenant";

/**
 * The org id for the current request. A signed-in user resolves to (and is
 * provisioned) their own org; otherwise we fall back to DEFAULT_ORG_ID / the
 * first org (demo / single-tenant). Request-cached.
 */
export const resolveActiveOrgId = cache(async (): Promise<string | null> => {
  const client = getSupabase();
  if (!client) return null;
  const user = await getSessionUser();
  if (user) return ensureOrgForUser(user);
  return getActiveOrgId(client);
});
