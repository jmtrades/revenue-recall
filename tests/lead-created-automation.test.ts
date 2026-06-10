import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * captureLead fires the org's lead_created automation rules — but ONLY when
 * something NEW was created. A deduped repeat submission must not re-fire
 * (same gating as the lead.created webhook).
 */
const h = vi.hoisted(() => ({ fired: [] as string[] }));

vi.mock("@/lib/automations/run-custom", async (orig) => ({
  ...(await orig<typeof import("@/lib/automations/run-custom")>()),
  runCustomLeadAutomations: vi.fn(async (opp: { id: string }) => {
    h.fired.push(opp.id);
  }),
}));

import { captureLead } from "@/lib/leads-capture";

beforeEach(() => {
  h.fired = [];
});

describe("lead_created custom-automation firing", () => {
  it("fires once for a new lead and not again for a deduped repeat", async () => {
    const email = `lead-${Date.now()}@acme.com`;
    const first = await captureLead({ name: "Fresh Lead", email, source: "Web form" });
    expect(first.deduped).toBe(false);
    expect(h.fired).toEqual([first.dealId]);

    const second = await captureLead({ name: "Fresh Lead", email, source: "Web form" });
    expect(second.deduped).toBe(true);
    expect(second.dealId).toBe(first.dealId);
    expect(h.fired).toHaveLength(1); // no re-fire on the repeat
  });
});
