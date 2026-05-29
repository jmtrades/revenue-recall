import { describe, it, expect, beforeEach } from "vitest";
import { batchActivities } from "@/lib/crm/activities";
import { getProvider } from "@/lib/crm/registry";
import type { Activity, CrmProvider, Id } from "@/lib/crm/types";

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe("batchActivities", () => {
  it("groups activities by opportunity via the built-in provider's batch method", async () => {
    const provider = getProvider();
    const opps = await provider.listOpportunities();
    const ids = opps.slice(0, 3).map((o) => o.id);

    const map = await batchActivities(provider, ids);
    // Every requested id is present (even if empty), and matches per-id fetch.
    for (const id of ids) {
      const direct = await provider.listActivities(id);
      expect(map.get(id)!.map((a) => a.id).sort()).toEqual(direct.map((a) => a.id).sort());
    }
  });

  it("returns an empty map for no ids and de-dupes input", async () => {
    const provider = getProvider();
    expect((await batchActivities(provider, [])).size).toBe(0);
    const opps = await provider.listOpportunities();
    const id = opps[0].id;
    const map = await batchActivities(provider, [id, id, id]);
    expect(map.size).toBe(1);
  });

  it("falls back to per-id fetches when the provider lacks the batch method", async () => {
    const calls: Id[] = [];
    const acts: Record<string, Activity[]> = { o1: [{ id: "a1", kind: "note", summary: "hi", occurredAt: new Date().toISOString() }], o2: [] };
    const fake = {
      listActivities: async (id: Id) => {
        calls.push(id);
        return acts[id] ?? [];
      },
      // intentionally no listActivitiesByOpps
    } as unknown as CrmProvider;

    const map = await batchActivities(fake, ["o1", "o2"]);
    expect(calls.sort()).toEqual(["o1", "o2"]);
    expect(map.get("o1")!).toHaveLength(1);
    expect(map.get("o2")!).toHaveLength(0);
  });
});
