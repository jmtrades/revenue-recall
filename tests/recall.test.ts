import { describe, it, expect } from "vitest";
import { buildRecallQueue, scoreOpportunity, summarizeRecall } from "@/lib/recall/engine";
import type { Opportunity, Pipeline, Stage } from "@/lib/crm/types";

const stages: Stage[] = [
  { id: "open_hi", label: "Negotiation", probability: 0.6, type: "open" },
  { id: "open_lo", label: "New", probability: 0.15, type: "open" },
  { id: "open_mid", label: "Proposal", probability: 0.35, type: "open" },
  { id: "won", label: "Won", probability: 1, type: "won" },
  { id: "lost", label: "Lost", probability: 0, type: "lost" },
];
const pipeline: Pipeline = { id: "p", label: "P", stages };
const stageMap = new Map(stages.map((s) => [s.id, s]));

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString();
}

function opp(p: Partial<Opportunity>): Opportunity {
  return {
    id: "o", title: "Deal", pipelineId: "p", stageId: "open_hi", value: 10000, currency: "USD",
    contactId: "c", createdAt: daysAgo(90), updatedAt: daysAgo(1), lastActivityAt: daysAgo(1), ...p,
  };
}

describe("scoreOpportunity", () => {
  it("flags a live high-probability deal with no recent touch as going_cold", () => {
    const r = scoreOpportunity(opp({ stageId: "open_hi", lastActivityAt: daysAgo(20) }), stageMap);
    expect(r?.reason).toBe("going_cold");
    expect(r?.channel).toBe("email");
  });

  it("flags a long-stalled mid-pipeline deal as stalled", () => {
    const r = scoreOpportunity(opp({ stageId: "open_mid", lastActivityAt: daysAgo(40) }), stageMap);
    expect(r?.reason).toBe("stalled");
  });

  it("flags a low-probability untouched deal as no_activity", () => {
    const r = scoreOpportunity(opp({ stageId: "open_lo", lastActivityAt: daysAgo(10) }), stageMap);
    expect(r?.reason).toBe("no_activity");
  });

  it("ignores freshly-touched healthy deals", () => {
    expect(scoreOpportunity(opp({ stageId: "open_hi", lastActivityAt: daysAgo(2) }), stageMap)).toBeNull();
  });

  it("never recalls won deals", () => {
    expect(scoreOpportunity(opp({ stageId: "won", lastActivityAt: daysAgo(60) }), stageMap)).toBeNull();
  });

  it("treats a recent, sizeable lost deal as a winnable loss", () => {
    const r = scoreOpportunity(opp({ stageId: "lost", value: 8000, lastActivityAt: daysAgo(30) }), stageMap);
    expect(r?.reason).toBe("lost_winnable");
    expect(r?.weightedValue).toBeLessThan(8000); // probability-weighted
  });

  it("drops lost deals that are too old or too small", () => {
    expect(scoreOpportunity(opp({ stageId: "lost", value: 8000, lastActivityAt: daysAgo(200) }), stageMap)).toBeNull();
    expect(scoreOpportunity(opp({ stageId: "lost", value: 500, lastActivityAt: daysAgo(30) }), stageMap)).toBeNull();
  });
});

describe("buildRecallQueue", () => {
  const opps: Opportunity[] = [
    opp({ id: "a", stageId: "open_hi", value: 50000, lastActivityAt: daysAgo(30) }),
    opp({ id: "b", stageId: "open_lo", value: 2000, lastActivityAt: daysAgo(10) }),
    opp({ id: "c", stageId: "won", lastActivityAt: daysAgo(2) }),
    opp({ id: "d", stageId: "open_hi", lastActivityAt: daysAgo(1) }),
  ];

  it("excludes healthy and won deals, sorts by score desc", () => {
    const q = buildRecallQueue(opps, [pipeline]);
    expect(q.map((i) => i.opportunityId).sort()).toEqual(["a", "b"]);
    expect(q[0].score).toBeGreaterThanOrEqual(q[1].score);
  });

  it("summarizes recoverable totals by reason", () => {
    const q = buildRecallQueue(opps, [pipeline]);
    const s = summarizeRecall(q, "USD");
    expect(s.itemCount).toBe(2);
    expect(s.totalRecoverable).toBe(q.reduce((t, i) => t + i.weightedValue, 0));
  });
});
