import { cache } from "@/lib/cache";
import { getServerSupabase } from "@/lib/supabase/server";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

/** The signed-in user for this request, or null. Validated against Supabase.
 *  Cached per-request so repeated provider calls don't re-hit the auth server. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const sb = getServerSupabase();
  if (!sb) return null;
  try {
    const { data } = await sb.auth.getUser();
    const u = data.user;
    if (!u) return null;
    const name =
      (u.user_metadata?.name as string | undefined) ??
      (u.email ? u.email.split("@")[0] : "Member");
    return { id: u.id, email: u.email ?? "", name };
  } catch {
    return null;
  }
});
