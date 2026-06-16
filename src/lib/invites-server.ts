import { getSupabase } from "@/lib/supabase/client";
import { publicSiteUrl } from "@/lib/site";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { getSessionUser, type SessionUser } from "@/lib/auth";
import { sendEmail } from "@/lib/comms";
import { getConfig } from "@/lib/config";
import { parseInviteEmails, normalizeRole, inviteToken, seatBudget, type Invitation, type InviteRole } from "@/lib/invites";
import { enforcementOn, orgEntitlements } from "@/lib/billing/enforce";

/**
 * Team invitations — server side. An owner/admin invites teammates by email;
 * the pending invite is matched on first sign-in (by email) and joins the
 * person to the inviting org as a member, instead of provisioning a new org.
 */

function signupUrl(token: string): string {
  const base = (publicSiteUrl() ?? "").replace(/\/$/, "");
  return base ? `${base}/signup?invite=${token}` : `/signup?invite=${token}`;
}

interface InviteRow {
  id: string;
  email: string;
  role: string;
  status: string;
  created_at: string;
  token?: string;
}
function rowToInvite(r: InviteRow): Invitation {
  return {
    id: r.id,
    email: r.email,
    role: normalizeRole(r.role),
    status: r.status as Invitation["status"],
    createdAt: r.created_at,
    link: r.token ? signupUrl(r.token) : undefined,
  };
}

/** Pending invites for the current org (newest first). Empty without a DB. */
export async function listInvites(): Promise<Invitation[]> {
  const client = getSupabase();
  if (!client) return [];
  const orgId = await resolveActiveOrgId();
  if (!orgId) return [];
  const { data } = await client
    .from("invitations")
    .select("id,email,role,status,created_at,token")
    .eq("org_id", orgId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  return ((data as InviteRow[] | null) ?? []).map(rowToInvite);
}

/**
 * Invite teammates to the current org. Skips anyone already a member, upserts
 * the pending invite (re-inviting refreshes it), and best-effort emails each a
 * sign-up link. Returns the created/refreshed invites.
 */
export async function createInvites(emails: string[], role: InviteRole = "rep"): Promise<Invitation[]> {
  const client = getSupabase();
  if (!client) throw new Error("Team invites require a database.");
  const orgId = await resolveActiveOrgId();
  if (!orgId) throw new Error("No active org.");

  const wanted = parseInviteEmails(emails.join("\n"));
  if (wanted.length === 0) return [];

  // Don't invite people who are already members or already pending (those
  // already hold a seat).
  const [{ data: existingMembers }, { data: pendingInv }] = await Promise.all([
    client.from("members").select("email").eq("org_id", orgId),
    client.from("invitations").select("email").eq("org_id", orgId).eq("status", "pending"),
  ]);
  const memberEmails = new Set(((existingMembers as { email: string | null }[] | null) ?? []).map((m) => (m.email ?? "").toLowerCase()).filter(Boolean));
  const pendingEmails = new Set(((pendingInv as { email: string | null }[] | null) ?? []).map((i) => (i.email ?? "").toLowerCase()).filter(Boolean));
  const fresh = wanted.filter((e) => !memberEmails.has(e));
  if (fresh.length === 0) return [];

  // Enforce the plan's seat cap (members + pending invites) once billing is on,
  // so a 1-seat/5-seat plan can't be filled with unlimited users (revenue leak).
  if (enforcementOn()) {
    const { seats } = await orgEntitlements();
    const occupied = memberEmails.size + pendingEmails.size;
    const newSeats = fresh.filter((e) => !pendingEmails.has(e)).length; // re-inviting a pending email is free
    const { remaining, exceeded } = seatBudget(occupied, newSeats, seats);
    if (exceeded) {
      const plural = seats === 1 ? "seat" : "seats";
      throw new Error(`Your plan includes ${seats} ${plural} and ${occupied} are in use. You can invite ${remaining} more — remove some or upgrade your plan.`);
    }
  }

  const inviter = await getSessionUser().catch(() => null);
  const rows = fresh.map((email) => ({ org_id: orgId, email, role: normalizeRole(role), token: inviteToken(), status: "pending", invited_by: inviter?.id ?? null }));

  const { data, error } = await client
    .from("invitations")
    .upsert(rows, { onConflict: "org_id,email", ignoreDuplicates: false })
    .select("id,email,role,status,created_at,token");
  if (error) throw new Error(error.message);

  const created = (data as (InviteRow & { token: string })[] | null) ?? [];
  // Best-effort invite emails — never block the invite on delivery.
  const orgName = getConfig().orgName;
  await Promise.all(
    created.map((inv) =>
      sendEmail(
        inv.email,
        `You're invited to ${orgName} on Revenue Recall`,
        `${inviter?.name ?? "A teammate"} invited you to join ${orgName} on Revenue Recall.\n\nAccept your invite and get set up here:\n${signupUrl(inv.token)}\n\nIf you weren't expecting this, you can ignore it.`,
      ).catch(() => undefined),
    ),
  );
  return created.map(rowToInvite);
}

/** Revoke a pending invite by id (within the current org). */
export async function revokeInvite(id: string): Promise<void> {
  const client = getSupabase();
  if (!client) throw new Error("Team invites require a database.");
  const orgId = await resolveActiveOrgId();
  if (!orgId) throw new Error("No active org.");
  const { error } = await client.from("invitations").update({ status: "revoked" }).eq("id", id).eq("org_id", orgId);
  if (error) throw new Error(error.message);
}

/**
 * Whether a pending invite exists for this email — used by invite-only mode to
 * decide, before creating any auth account, if a self-signup should be allowed.
 * Matches the same lowercased-email + status="pending" criteria as acceptance.
 */
export async function hasPendingInvite(email: string): Promise<boolean> {
  const client = getSupabase();
  if (!client || !email) return false;
  const { data } = await client
    .from("invitations")
    .select("id")
    .eq("email", email.toLowerCase())
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

/**
 * If a pending invite matches this user's email, join them to the inviting org
 * as a member and mark the invite accepted — returning that org id. Otherwise
 * null (the caller then provisions a fresh org). Uses the service-role client,
 * since the invitee is not yet a member of the target org (pre-RLS).
 */
export async function acceptPendingInvite(user: SessionUser): Promise<string | null> {
  const client = getSupabase();
  if (!client || !user.email) return null;
  const email = user.email.toLowerCase();
  const { data: inv } = await client
    .from("invitations")
    .select("id,org_id,role")
    .eq("email", email)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!inv) return null;
  const orgId = (inv as { org_id: string }).org_id;
  const role = normalizeRole((inv as { role: string }).role);

  // Create the membership FIRST and only mark the invite accepted if it landed.
  // Marking accepted on a failed insert would strand the invitee: no membership,
  // and the invite is no longer "pending" to retry, so their next sign-in falls
  // through to provisioning a brand-new private org — silently defeating the
  // invite. On a duplicate (they're already a member) treat it as success.
  const { error: memberErr } = await client
    .from("members")
    .insert({ org_id: orgId, name: user.name, email: user.email, role, auth_user_id: user.id });
  if (memberErr && !/duplicate|unique/i.test(memberErr.message)) {
    // Leave the invite pending so it can be retried on the next sign-in.
    return null;
  }
  await client.from("invitations").update({ status: "accepted", accepted_at: new Date().toISOString() }).eq("id", (inv as { id: string }).id);
  return orgId;
}
