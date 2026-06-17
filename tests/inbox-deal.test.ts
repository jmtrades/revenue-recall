import { describe, it, expect } from "vitest";
import { pickInboxDeal } from "@/lib/queries";
import type { Opportunity, Stage } from "@/lib/crm/types";

const stages = new Map<string, Stage>([
  ["open", { id: "open", label: "In play", probability: 0.4, type: "open" }],
  ["won", { id: "won", label: "Won", probability: 1, type: "won" }],
]);

const opp = (p: Partial<Opportunity>): Opportunity => ({
  id: "o", title: "Deal", pipelineId: "p", stageId: "open", value: 1000, currency: "USD",
  contactId: "c", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", ...p,
});

describe("pickInboxDeal", () => {
  it("returns undefined when the contact has no deals", () => {
    expect(pickInboxDeal([], stages)).toBeUndefined();
  });

  it("prefers an open deal over a higher-value closed one", () => {
    const d = pickInboxDeal([
      opp({ id: "won-big", stageId: "won", value: 50000 }),
      opp({ id: "open-small", stageId: "open", value: 2000 }),
    ], stages);
    expect(d?.dealId).toBe("open-small");
    expect(d).toMatchObject({ stage: "In play", stageType: "open", value: 2000, currency: "USD" });
  });

  it("breaks ties on value within the same openness", () => {
    const d = pickInboxDeal([opp({ id: "a", value: 3000 }), opp({ id: "b", value: 9000 })], stages);
    expect(d?.dealId).toBe("b");
  });
});
