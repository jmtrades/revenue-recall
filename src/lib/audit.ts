import { getSupabase } from "@/lib/supabase/client";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { getSessionUser } from "@/lib/auth";

/**
 * Append-only audit trail — who did what. Records are org-scoped and best-effort:
 * `recordAudit` NEVER throws into its caller, because writing an audit entry must
 * not break the action it's recording.
 */
export interface AuditEntry {
  id: string;
  action: string;
  target?: string;
  actorEmail?: string;
  createdAt: string;
}

interface AuditRow {
  id: string;
  action: string;
  target: string | null;
  actor_email: string | null;
  created_at: string;
}

/** Record an audit event for the current org + signed-in actor. Best-effort. */
export async function recordAudit(action: string, target?: string): Promise<void> {
  try {
    const client = getSupabase();
    if (!client) return;
    const [orgId, user] = await Promise.all([resolveActiveOrgId(), getSessionUser().catch(() => null)]);
    if (!orgId) return;
    await client.from("audit_log").insert({
      org_id: orgId,
      actor_id: user?.id ?? null,
      actor_email: user?.email ?? null,
      action,
      target: target ?? null,
    });
  } catch {
    /* audit is best-effort — never let it break the action it records */
  }
}

/** Recent audit events for the current org, newest first. */
export async function listAudit(limit = 100): Promise<AuditEntry[]> {
  const client = getSupabase();
  if (!client) return [];
  const orgId = await resolveActiveOrgId();
  if (!orgId) return [];
  const { data } = await client
    .from("audit_log")
    .select("id,action,target,actor_email,created_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 500));
  return ((data as AuditRow[] | null) ?? []).map((r) => ({
    id: r.id,
    action: r.action,
    target: r.target ?? undefined,
    actorEmail: r.actor_email ?? undefined,
    createdAt: r.created_at,
  }));
}
