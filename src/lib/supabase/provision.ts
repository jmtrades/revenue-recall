import { cache } from "@/lib/cache";
import { getSupabase } from "@/lib/supabase/client";
import { bootstrapOrg } from "@/lib/supabase/bootstrap";
import { acceptPendingInvite } from "@/lib/invites-server";
import type { SessionUser } from "@/lib/auth";

function workspaceName(email: string): string {
  const domain = email.split("@")[1]?.split(".")[0] ?? "";
  if (!domain) return "My Workspace";
  return domain.charAt(0).toUpperCase() + domain.slice(1);
}

/**
 * Ensure the signed-in user belongs to an org, creating one (clean, no demo
 * data) on first sign-in. Wrapped in React cache() so the many provider calls
 * in a single request dedupe to one promise — preventing duplicate-org races.
 */
export const ensureOrgForUser = cache(async (user: SessionUser): Promise<string | null> => {
  const client = getSupabase();
  if (!client) return null;

  const { data } = await client
    .from("members")
    .select("org_id")
    .eq("auth_user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (data?.org_id) return data.org_id as string;

  // Invited? Join the inviting org as a member instead of getting a fresh one.
  const invitedOrgId = await acceptPendingInvite(user);
  if (invitedOrgId) return invitedOrgId;

  try {
    const res = await bootstrapOrg({
      demo: false,
      orgName: workspaceName(user.email),
      member: { authUserId: user.id, name: user.name, email: user.email, role: "owner" },
    });
    return res.orgId;
  } catch {
    // Bootstrap can fail on a race: a concurrent first request already created
    // this user's membership, and the unique index on members.auth_user_id
    // rejects the duplicate. Recover by reading the membership that won the
    // race rather than forking the account into a second org.
    const { data: existing } = await client
      .from("members")
      .select("org_id")
      .eq("auth_user_id", user.id)
      .limit(1)
      .maybeSingle();
    return (existing?.org_id as string) ?? null;
  }
});
