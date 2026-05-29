import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { getActiveOrgId } from "@/lib/supabase/tenant";

/**
 * Recall attribution store. Records every recall outreach *touch* — a send from
 * a recall sequence, or a manual send from the recall queue — so a later win can
 * be credited to the recall effort that preceded it (hard attribution rather
 * than inferring from enrollment timestamps).
 *
 * Dual-mode, mirroring the cadence enrollment store: a process-level array for
 * the zero-setup demo, and the `recall_events` table when Supabase is wired.
 */

export type RecallTouchChannel = "call" | "email" | "sms";
export type RecallTouchSource = "cadence" | "manual";

export interface RecallTouch {
  id: string;
  dealId?: string;
  contactId?: string;
  channel: RecallTouchChannel;
  source: RecallTouchSource;
  occurredAt: string;
}

export interface NewRecallTouch {
  dealId?: string;
  contactId?: string;
  channel: RecallTouchChannel;
  source?: RecallTouchSource;
  occurredAt?: string;
}

const mem: RecallTouch[] = [];

/** Test-only: clear in-memory touches so suites don't leak state. */
export function __resetRecallEventsForTests(): void {
  mem.length = 0;
}

async function orgId(): Promise<string> {
  const id = (await resolveActiveOrgId()) ?? (getSupabase() ? await getActiveOrgId(getSupabase()!) : null);
  if (!id) throw new Error("No active org");
  return id;
}

function mapRow(r: Record<string, unknown>): RecallTouch {
  return {
    id: r.id as string,
    dealId: (r.deal_id as string) ?? undefined,
    contactId: (r.contact_id as string) ?? undefined,
    channel: r.channel as RecallTouchChannel,
    source: (r.source as RecallTouchSource) ?? "cadence",
    occurredAt: r.occurred_at as string,
  };
}

/** Record a recall touch. Best-effort: never let attribution logging break a send. */
export async function recordRecallTouch(input: NewRecallTouch): Promise<void> {
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const source = input.source ?? "cadence";
  try {
    if (!isSupabaseConfigured()) {
      mem.unshift({ id: `rt_${Date.now()}_${mem.length}`, dealId: input.dealId, contactId: input.contactId, channel: input.channel, source, occurredAt });
      return;
    }
    await getSupabase()!
      .from("recall_events")
      .insert({ org_id: await orgId(), deal_id: input.dealId ?? null, contact_id: input.contactId ?? null, channel: input.channel, source, occurred_at: occurredAt });
  } catch {
    // Attribution is non-critical; swallow so a logging failure never blocks outreach.
  }
}

export async function listRecallTouches(limit = 2000): Promise<RecallTouch[]> {
  if (!isSupabaseConfigured()) return mem.slice(0, limit);
  const client = getSupabase()!;
  const { data, error } = await client
    .from("recall_events")
    .select("*")
    .eq("org_id", await orgId())
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRow);
}

/** Earliest recorded recall touch per deal — the point from which a win counts. */
export function earliestTouchByDeal(touches: RecallTouch[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const t of touches) {
    if (!t.dealId) continue;
    const cur = map.get(t.dealId);
    if (!cur || t.occurredAt < cur) map.set(t.dealId, t.occurredAt);
  }
  return map;
}
