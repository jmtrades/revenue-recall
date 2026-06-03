import { NextResponse } from "next/server";
import { cache } from "@/lib/cache";
import { getSupabase } from "@/lib/supabase/client";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { getSessionUser } from "@/lib/auth";
import { isAuthRequired } from "@/lib/config";

/**
 * Role-based access control. The org creator is `owner`; teammates join as
 * `admin`/`manager`/`rep`. Sensitive actions (inviting teammates, managing
 * billing, changing org-wide settings) must be limited to owner/admin — without
 * this any signed-in member could burn seats or open the billing portal.
 */
export type MemberRole = "owner" | "admin" | "manager" | "rep";

/** Pure membership test (extracted for testing). */
export function roleAllowed(role: MemberRole | null, allowed: MemberRole[]): boolean {
  return role != null && allowed.includes(role);
}

/** The signed-in user's role in their ACTIVE org, or null. Request-cached. */
export const getSessionRole = cache(async (): Promise<MemberRole | null> => {
  const client = getSupabase();
  if (!client) return null;
  const [user, orgId] = await Promise.all([getSessionUser(), resolveActiveOrgId()]);
  if (!user || !orgId) return null;
  const { data } = await client.from("members").select("role").eq("auth_user_id", user.id).eq("org_id", orgId).maybeSingle();
  return ((data?.role as MemberRole | undefined) ?? null);
});

export async function hasRole(...roles: MemberRole[]): Promise<boolean> {
  return roleAllowed(await getSessionRole(), roles);
}

/**
 * Returns a 403 response when the current user lacks one of `roles`, else null
 * (the caller proceeds). No-ops when auth isn't enforced (demo / no database) so
 * the open demo keeps working; the moment a DB is connected, roles are enforced.
 */
export async function requireRole(...roles: MemberRole[]): Promise<NextResponse | null> {
  if (!isAuthRequired()) return null;
  if (await hasRole(...roles)) return null;
  return NextResponse.json({ error: "You don't have permission to do that — ask an owner or admin." }, { status: 403 });
}
