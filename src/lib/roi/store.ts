import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import type { NewRoiEvent, RoiActor, RoiChannel, RoiEvent, RoiEventName } from "@/lib/roi/types";
import { isRoiEventName } from "@/lib/roi/types";

/**
 * Results ledger. In-memory for the demo and tests; `analytics_events` when
 * Supabase is configured. Writes are idempotent on (org, dedupe key) so a
 * retried webhook does not double-count.
 */

const LOCAL = "local";
const memory = new Map<string, RoiEvent[]>();

export function __resetRoiForTests(): void {
  memory.clear();
}

async function scope(explicit?: string): Promise<string> {
  if (explicit) return explicit;
  return (await resolveActiveOrgId().catch(() => null)) ?? LOCAL;
}

function rowToEvent(r: Record<string, unknown>): RoiEvent | null {
  const name = String(r.name ?? "");
  if (!isRoiEventName(name)) return null;
  return {
    id: String(r.id),
    dedupeKey: String(r.dedupe_key),
    name,
    occurredAt: String(r.occurred_at),
    channel: (r.channel as RoiChannel) || undefined,
    contactId: (r.contact_id as string) || undefined,
    dealId: (r.deal_id as string) || undefined,
    leadId: (r.lead_id as string) || undefined,
    campaignId: (r.campaign_id as string) || undefined,
    sequenceId: (r.sequence_id as string) || undefined,
    stepId: (r.step_id as string) || undefined,
    revenue: typeof r.revenue === "number" ? r.revenue : r.revenue != null ? Number(r.revenue) : undefined,
    cost: typeof r.cost === "number" ? r.cost : r.cost != null ? Number(r.cost) : undefined,
    actor: (r.actor as RoiActor) || undefined,
  };
}

export async function recordRoiEvent(input: NewRoiEvent): Promise<void> {
  const orgId = await scope(input.orgId);
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const event: RoiEvent = {
    id: input.dedupeKey,
    dedupeKey: input.dedupeKey,
    name: input.name,
    occurredAt,
    channel: input.channel,
    contactId: input.contactId,
    dealId: input.dealId,
    leadId: input.leadId,
    campaignId: input.campaignId,
    sequenceId: input.sequenceId,
    stepId: input.stepId,
    revenue: input.revenue,
    cost: input.cost,
    actor: input.actor,
  };
  if (!isSupabaseConfigured()) {
    const bag = memory.get(orgId) ?? [];
    if (bag.some((e) => e.dedupeKey === event.dedupeKey)) return;
    bag.push(event);
    memory.set(orgId, bag);
    return;
  }
  const { error } = await getSupabase()!.from("analytics_events").upsert(
    {
      org_id: orgId,
      dedupe_key: event.dedupeKey,
      name: event.name,
      occurred_at: event.occurredAt,
      channel: event.channel ?? null,
      contact_id: event.contactId ?? null,
      deal_id: event.dealId ?? null,
      lead_id: event.leadId ?? null,
      campaign_id: event.campaignId ?? null,
      sequence_id: event.sequenceId ?? null,
      step_id: event.stepId ?? null,
      revenue: event.revenue ?? null,
      cost: event.cost ?? null,
      actor: event.actor ?? null,
    },
    { onConflict: "org_id,dedupe_key", ignoreDuplicates: true },
  );
  if (error && error.code !== "23505") throw new Error(error.message);
}

export async function listRoiEvents(orgId?: string): Promise<RoiEvent[]> {
  const id = await scope(orgId);
  if (!isSupabaseConfigured()) return [...(memory.get(id) ?? [])];
  const { data, error } = await getSupabase()!
    .from("analytics_events")
    .select("id,dedupe_key,name,occurred_at,channel,contact_id,deal_id,lead_id,campaign_id,sequence_id,step_id,revenue,cost,actor")
    .eq("org_id", id)
    .order("occurred_at", { ascending: true })
    .limit(5000);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => rowToEvent(r as Record<string, unknown>)).filter((e): e is RoiEvent => Boolean(e));
}

export function __memorySizeForTests(): number {
  let n = 0;
  for (const bag of memory.values()) n += bag.length;
  return n;
}

export type { RoiEventName };
