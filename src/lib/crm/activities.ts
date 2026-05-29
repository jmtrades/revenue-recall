import type { Activity, CrmProvider, Id } from "@/lib/crm/types";

/**
 * Fetch activities for many opportunities, keyed by opportunity id. Uses the
 * provider's batch method (one query) when available, else falls back to
 * per-id fetches in parallel — so the agent/cadence loops avoid N+1 on providers
 * that support batching, and still work on those that don't.
 */
export async function batchActivities(provider: CrmProvider, opportunityIds: Id[]): Promise<Map<Id, Activity[]>> {
  const ids = [...new Set(opportunityIds.filter(Boolean))];
  const out = new Map<Id, Activity[]>();
  if (ids.length === 0) return out;

  if (provider.listActivitiesByOpps) {
    const grouped = await provider.listActivitiesByOpps(ids);
    for (const id of ids) out.set(id, grouped[id] ?? []);
    return out;
  }

  const lists = await Promise.all(ids.map((id) => provider.listActivities(id)));
  ids.forEach((id, i) => out.set(id, lists[i]));
  return out;
}
