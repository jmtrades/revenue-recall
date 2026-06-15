import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { getSupabase } from "@/lib/supabase/client";
import { getServerSupabase } from "@/lib/supabase/server";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import { planAccountDeletion } from "@/lib/account-deletion";
import { recordAudit } from "@/lib/audit";
import { purgeOrgRecordings } from "@/lib/calls/recordings";
import { logInfo, logError, errMessage } from "@/lib/log";

export const dynamic = "force-dynamic";

const Body = z.object({ confirm: z.string() });

/**
 * GDPR/CCPA erasure: delete the signed-in user's account. An owner deletes the
 * whole workspace (orgs ON DELETE CASCADE removes its contacts, deals,
 * activities, members, …); a non-owner just leaves the org. Then the auth
 * identity is removed. Requires a typed "DELETE" confirmation and is
 * irreversible — guarded accordingly.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!rateLimit(clientKey(req, "data-delete"), 5, 60_000).ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || parsed.data.confirm !== "DELETE") {
    return NextResponse.json({ error: 'Type DELETE to confirm — this permanently erases your account.' }, { status: 400 });
  }

  const admin = getSupabase(); // service-role: needed to delete across RLS + remove the auth user
  if (!admin) return NextResponse.json({ error: "Account deletion isn't available on this deployment." }, { status: 503 });

  try {
    const { data: members } = await admin.from("members").select("org_id, role").eq("auth_user_id", user.id).limit(1);
    const member = members?.[0] as { org_id?: string; role?: string } | undefined;
    if (member?.org_id) {
      // Never cascade-delete a shared workspace out from under its other members.
      const { data: orgMembers } = await admin.from("members").select("auth_user_id, role").eq("org_id", member.org_id);
      const others = ((orgMembers ?? []) as { auth_user_id: string; role: string }[]).filter((m) => m.auth_user_id !== user.id);
      const plan = planAccountDeletion(member.role, others);
      if (plan.action === "block") return NextResponse.json({ error: plan.reason }, { status: 409 });
      if (plan.action === "delete_org") {
        // GDPR Art.17 / CCPA: erase the call recordings (audio of an identifiable
        // person, hosted outside the DB) BEFORE the cascade wipes the only index
        // of their URLs. Best-effort; an incomplete purge is audited, not silent.
        const purged = await purgeOrgRecordings(member.org_id).catch(() => null);
        if (purged && purged.failed.length > 0) {
          await recordAudit("account.recordings_purge_incomplete", `${purged.failed.length} recordings — see server logs`).catch(() => {});
        }
        await admin.from("orgs").delete().eq("id", member.org_id); // sole member → cascades their data only
      } else {
        await admin.from("members").delete().eq("auth_user_id", user.id).eq("org_id", member.org_id);
      }
    }
    // Remove the login/identity.
    try {
      await admin.auth.admin.deleteUser(user.id);
    } catch (e) {
      logError("user.delete.auth_failed", { error: errMessage(e) });
    }
    // Best-effort clear this session (the user no longer exists anyway).
    try {
      const sb = getServerSupabase();
      if (sb) await sb.auth.signOut();
    } catch {
      /* session already invalid */
    }
    await recordAudit("account.deleted").catch(() => {});
    logInfo("user.deleted", { ownerDeletedOrg: member?.role === "owner" });
    return NextResponse.json({ ok: true });
  } catch (e) {
    logError("user.delete.failed", { error: errMessage(e) });
    return NextResponse.json({ error: "Couldn't delete the account. Please contact support." }, { status: 500 });
  }
}
