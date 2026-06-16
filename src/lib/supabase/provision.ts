import { cache } from "@/lib/cache";
import { getSupabase } from "@/lib/supabase/client";
import { bootstrapOrg } from "@/lib/supabase/bootstrap";
import { sendWelcomeEmail } from "@/lib/billing/lifecycle";
import { acceptPendingInvite } from "@/lib/invites-server";
import { REFERRAL_COOKIE, isAttributableReferral, parseReferralCode } from "@/lib/referrals";
import { logError, errMessage } from "@/lib/log";
import type { SessionUser } from "@/lib/auth";

/** Best-effort: stamp the referrer (from the signup-link cookie) onto a brand-new
 *  org so the billing webhook can reward the referral once they upgrade. Wrapped
 *  so it can NEVER affect provisioning — a referral is nice-to-have, signup is not. */
async function attributeReferral(orgId: string): Promise<void> {
  try {
    const { cookies } = await import("next/headers");
    const ref = parseReferralCode(cookies().get(REFERRAL_COOKIE)?.value);
    if (!ref || !isAttributableReferral(ref, orgId)) return;
    const client = getSupabase();
    if (!client) return;
    await client.from("orgs").update({ referred_by: ref }).eq("id", orgId).is("referred_by", null);
  } catch {
    /* attribution is optional — never block or fail provisioning on it */
  }
}

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
    // First provision = the one true "welcome" moment (runs once per new user;
    // the race-recovery path below is an EXISTING member, so no email there).
    // Best-effort: provisioning must never fail on a mail hiccup.
    sendWelcomeEmail(user.email, user.name).catch(() => {});
    await attributeReferral(res.orgId);
    return res.orgId;
  } catch (e) {
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
    if (existing?.org_id) return existing.org_id as string;
    // Not a race — a real provisioning failure (most often: the database is
    // missing the app's tables, or no service-role key is set so the insert is
    // blocked by RLS). Log the actual cause so "couldn't save your workspace"
    // is diagnosable from the server logs instead of being a silent dead-end.
    logError("provision.bootstrap_failed", { userId: user.id, error: errMessage(e) });
    return null;
  }
});
