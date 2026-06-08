import { getSupabase } from "@/lib/supabase/client";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { getSessionUser } from "@/lib/auth";
import { getSessionRole, type MemberRole } from "@/lib/authz";
import { memberActionError, type Member } from "@/lib/members";

/**
 * Team members — server side. Lists the org's members and lets an owner/admin
 * change a teammate's role or remove them, enforcing the rules in
 * `memberActionError` (last-owner protection, no self-management, owners-only
 * owner management). Service-role client → every query is scoped by org_id.
 */

function normRole(r: unknown): MemberRole {
  return (["owner", "admin", "manager", "rep"] as const).includes(r as MemberRole) ? (r as MemberRole) : "rep";
}

interface MemberRow {
  id: string;
  name: string;
  email: string | null;
  role: string;
  auth_user_id: string | null;
}

/** Members of the current org (oldest first). Empty without a DB. */
export async function listMembers(): Promise<Member[]> {
  const client = getSupabase();
  if (!client) return [];
  const orgId = await resolveActiveOrgId();
  if (!orgId) return [];
  const [user, { data }] = await Promise.all([
    getSessionUser().catch(() => null),
    client.from("members").select("id,name,email,role,auth_user_id").eq("org_id", orgId).order("created_at"),
  ]);
  return ((data as MemberRow[] | null) ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    email: m.email,
    role: normRole(m.role),
    isSelf: !!user && !!m.auth_user_id && m.auth_user_id === user.id,
  }));
}

interface Ctx {
  client: NonNullable<ReturnType<typeof getSupabase>>;
  orgId: string;
  authUserId: string;
  actorRole: MemberRole;
}

async function ctx(): Promise<Ctx> {
  const client = getSupabase();
  if (!client) throw new Error("Member management requires a database.");
  const orgId = await resolveActiveOrgId();
  if (!orgId) throw new Error("No active org.");
  const [user, role] = await Promise.all([getSessionUser().catch(() => null), getSessionRole()]);
  if (!user || !role) throw new Error("You're not signed in.");
  return { client, orgId, authUserId: user.id, actorRole: role };
}

async function loadTarget(c: Ctx, id: string): Promise<{ role: MemberRole; authUserId: string | null }> {
  const { data } = await c.client.from("members").select("role,auth_user_id").eq("id", id).eq("org_id", c.orgId).maybeSingle();
  if (!data) throw new Error("That teammate isn't part of this workspace.");
  const row = data as { role: string; auth_user_id: string | null };
  return { role: normRole(row.role), authUserId: row.auth_user_id };
}

async function countOwners(c: Ctx): Promise<number> {
  const { count } = await c.client
    .from("members")
    .select("id", { count: "exact", head: true })
    .eq("org_id", c.orgId)
    .eq("role", "owner");
  return count ?? 0;
}

/** Change a member's role (guarded). Returns the updated member. */
export async function updateMemberRole(id: string, role: MemberRole): Promise<Member> {
  const c = await ctx();
  const target = await loadTarget(c, id);
  const ownerCount = await countOwners(c);
  const err = memberActionError({
    actorRole: c.actorRole,
    actorIsSelf: !!target.authUserId && target.authUserId === c.authUserId,
    targetRole: target.role,
    ownerCount,
    action: "role",
    newRole: role,
  });
  if (err) throw new Error(err);

  const { data, error } = await c.client
    .from("members")
    .update({ role })
    .eq("id", id)
    .eq("org_id", c.orgId)
    .select("id,name,email,role,auth_user_id")
    .single();
  if (error) throw new Error(error.message);
  const m = data as MemberRow;
  return { id: m.id, name: m.name, email: m.email, role: normRole(m.role), isSelf: !!m.auth_user_id && m.auth_user_id === c.authUserId };
}

/** Remove a member from the org (guarded). */
export async function removeMember(id: string): Promise<void> {
  const c = await ctx();
  const target = await loadTarget(c, id);
  const ownerCount = await countOwners(c);
  const err = memberActionError({
    actorRole: c.actorRole,
    actorIsSelf: !!target.authUserId && target.authUserId === c.authUserId,
    targetRole: target.role,
    ownerCount,
    action: "remove",
  });
  if (err) throw new Error(err);

  const { error } = await c.client.from("members").delete().eq("id", id).eq("org_id", c.orgId);
  if (error) throw new Error(error.message);
}
