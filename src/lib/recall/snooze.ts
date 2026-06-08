import { getSupabase } from "@/lib/supabase/client";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";

/**
 * Recall snoozes — let a rep mute a deal in the recall queue for a while so it
 * stops nagging, without losing it. Backed by the org-scoped `recall_snoozes`
 * table. Everything degrades gracefully: with no database, or before the
 * migration is applied, reads return empty and the queue behaves exactly as it
 * did before — so this is safe to ship ahead of the migration.
 */

/** Clamp a requested snooze length to a sane window (1..90 days; default 7). Pure. */
export function clampSnoozeDays(days: number): number {
  if (!Number.isFinite(days)) return 7;
  return Math.min(90, Math.max(1, Math.floor(days)));
}

/** When a snooze of `days` (from `nowMs`) should lapse, as an ISO string. Pure. */
export function snoozeUntilIso(days: number, nowMs: number = Date.now()): string {
  return new Date(nowMs + clampSnoozeDays(days) * 86400000).toISOString();
}

/** Opportunity ids currently snoozed (until > now) for the active org. Empty
 *  without a DB or before the table exists — never throws, so the recall queue
 *  always renders. */
export async function listSnoozedOppIds(): Promise<Set<string>> {
  const client = getSupabase();
  if (!client) return new Set();
  const orgId = await resolveActiveOrgId();
  if (!orgId) return new Set();
  const { data, error } = await client
    .from("recall_snoozes")
    .select("opportunity_id")
    .eq("org_id", orgId)
    .gt("until", new Date().toISOString());
  if (error) return new Set(); // table missing / transient → treat as none snoozed
  return new Set((data ?? []).map((r) => (r as { opportunity_id: string }).opportunity_id));
}

/** Snooze a deal for `days` (clamped). Upsert so re-snoozing extends/replaces it. */
export async function snoozeDeal(opportunityId: string, days: number): Promise<void> {
  const client = getSupabase();
  if (!client) throw new Error("Snoozing requires a database.");
  const orgId = await resolveActiveOrgId();
  if (!orgId) throw new Error("No active org.");
  const { error } = await client
    .from("recall_snoozes")
    .upsert(
      { org_id: orgId, opportunity_id: opportunityId, until: snoozeUntilIso(days) },
      { onConflict: "org_id,opportunity_id" },
    );
  if (error) throw new Error(error.message);
}

/** Un-snooze a deal — bring it back to the queue now. */
export async function unsnoozeDeal(opportunityId: string): Promise<void> {
  const client = getSupabase();
  if (!client) throw new Error("Snoozing requires a database.");
  const orgId = await resolveActiveOrgId();
  if (!orgId) throw new Error("No active org.");
  const { error } = await client.from("recall_snoozes").delete().eq("org_id", orgId).eq("opportunity_id", opportunityId);
  if (error) throw new Error(error.message);
}
