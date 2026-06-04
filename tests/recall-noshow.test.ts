import { describe, it, expect } from "vitest";
import { scoreOpportunity, DEFAULT_RECALL_THRESHOLDS } from "@/lib/recall/engine";
import type { Activity, Opportunity, Stage } from "@/lib/crm/types";

const DAY = 86_400_000;
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString();
const stages = new Map<string, Stage>([["s1", { id: "s1", label: "Demo", probability: 0.5, type: "open" }]]);

function opp(over: Partial<Opportunity> = {}): Opportunity {
  return {
    id: "o1", title: "Acme", value: 5000, currency: "USD", contactId: "c1", pipelineId: "p1", stageId: "s1",
    createdAt: iso(40), updatedAt: iso(3), lastActivityAt: iso(3), ...over,
  } as Opportunity;
}
const meeting = (daysAgo: number): Activity => ({ id: "m1", kind: "meeting", summary: "Demo call", occurredAt: iso(daysAgo) } as Activity);
const email = (daysAgo: number): Activity => ({ id: "e1", kind: "email", summary: "note", direction: "outbound", occurredAt: iso(daysAgo) } as Activity);

describe("recall: no-show detection", () => {
  it("flags an open deal whose last touch was a meeting that's since gone quiet", () => {
    const item = scoreOpportunity(opp(), stages, { activities: [meeting(3)] });
    expect(item?.reason).toBe("no_show");
    expect(item?.recommendation.toLowerCase()).toContain("reschedule");
    expect(item?.score ?? 0).toBeGreaterThan(40); // ranks high — fresh intent
  });

  it("does NOT flag a meeting that just happened (inside the grace window)", () => {
    // 1 day < grace (2) and the deal is otherwise healthy → not a recall item.
    const item = scoreOpportunity(opp({ updatedAt: iso(1), lastActivityAt: iso(1) }), stages, { activities: [meeting(1)] });
    expect(item?.reason).not.toBe("no_show");
  });

  it("does NOT treat a non-meeting last touch as a no-show", () => {
    // Last touch is an email 20 days ago → going_cold, not no_show.
    const item = scoreOpportunity(opp({ updatedAt: iso(20), lastActivityAt: iso(20) }), stages, { activities: [email(20)] });
    expect(item?.reason).toBe("going_cold");
  });

  it("ranks a no-show above an equivalent going-cold deal", () => {
    const noShow = scoreOpportunity(opp(), stages, { activities: [meeting(3)] });
    const goingCold = scoreOpportunity(opp({ updatedAt: iso(20), lastActivityAt: iso(20) }), stages, { activities: [email(20)] });
    expect((noShow?.score ?? 0)).toBeGreaterThan(goingCold?.score ?? 0);
  });
});
