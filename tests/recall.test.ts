import { describe, it, expect } from "vitest";
import { buildRecallQueue, scoreOpportunity, summarizeRecall, preferredChannel, hasEngaged, DEFAULT_RECALL_THRESHOLDS } from "@/lib/recall/engine";
import type { Activity, Opportunity, Pipeline, Stage } from "@/lib/crm/types";

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

  it("scales the 'too small' lost-deal floor by currency, not a flat 1000", () => {
    // 0-decimal currency (JPY): floor ≈ 100,000, so 50,000 is too small but
    // 200,000 is worth chasing — a flat 1000 floor would have kept both.
    expect(scoreOpportunity(opp({ stageId: "lost", value: 50000, currency: "JPY", lastActivityAt: daysAgo(30) }), stageMap)).toBeNull();
    expect(scoreOpportunity(opp({ stageId: "lost", value: 200000, currency: "JPY", lastActivityAt: daysAgo(30) }), stageMap)?.reason).toBe("lost_winnable");
    // Same 50,000 figure in USD is well above the 1000 floor — kept.
    expect(scoreOpportunity(opp({ stageId: "lost", value: 50000, currency: "USD", lastActivityAt: daysAgo(30) }), stageMap)?.reason).toBe("lost_winnable");
  });
});

function act(p: Partial<Activity>): Activity {
  return { id: "a", kind: "email", summary: "", occurredAt: daysAgo(5), ...p };
}

describe("engagement signals", () => {
  it("preferredChannel returns the most recent inbound messaging channel", () => {
    const acts = [
      act({ kind: "email", direction: "inbound", occurredAt: daysAgo(20) }),
      act({ kind: "sms", direction: "inbound", occurredAt: daysAgo(3) }),
      act({ kind: "call", direction: "outbound", occurredAt: daysAgo(1) }),
    ];
    expect(preferredChannel(acts)).toBe("sms"); // newest inbound
  });

  it("preferredChannel ignores outbound-only and non-messaging activity", () => {
    expect(preferredChannel([act({ kind: "email", direction: "outbound" })])).toBeNull();
    expect(preferredChannel([act({ kind: "note", direction: "inbound" })])).toBeNull();
    expect(preferredChannel(undefined)).toBeNull();
  });

  it("hasEngaged is true only with an inbound activity", () => {
    expect(hasEngaged([act({ direction: "outbound" })])).toBe(false);
    expect(hasEngaged([act({ kind: "meeting", direction: "inbound" })])).toBe(true);
  });

  it("routes a recall to the channel the buyer last replied on, overriding the reason default", () => {
    // stalled defaults to "call"; here the buyer last replied by SMS.
    const signals = { activities: [act({ kind: "sms", direction: "inbound", occurredAt: daysAgo(35) })] };
    const r = scoreOpportunity(opp({ stageId: "open_mid", lastActivityAt: daysAgo(40) }), stageMap, signals);
    expect(r?.reason).toBe("stalled");
    expect(r?.channel).toBe("sms");
    expect(r?.engaged).toBe(true);
    expect(r?.recommendation).toContain("sms");
  });

  it("boosts the priority of an engaged deal over an identical un-engaged one", () => {
    const base = opp({ stageId: "open_hi", lastActivityAt: daysAgo(20) });
    const cold = scoreOpportunity(base, stageMap);
    const warm = scoreOpportunity(base, stageMap, { activities: [act({ kind: "email", direction: "inbound", occurredAt: daysAgo(22) })] });
    expect(warm!.score).toBeGreaterThan(cold!.score);
    expect(cold!.engaged).toBe(false);
  });

  it("keeps the reason default channel when there is no inbound reply", () => {
    const r = scoreOpportunity(opp({ stageId: "open_mid", lastActivityAt: daysAgo(40) }), stageMap, { activities: [act({ direction: "outbound" })] });
    expect(r?.channel).toBe("call"); // stalled default
    expect(r?.engaged).toBe(false);
  });
});

describe("industry-tuned thresholds", () => {
  // 10 days, high prob: healthy under the default 14-day going-cold cutoff…
  it("respects custom day thresholds", () => {
    const o = opp({ stageId: "open_hi", lastActivityAt: daysAgo(10) });
    expect(scoreOpportunity(o, stageMap)).toBeNull(); // default: still healthy
    // …but a fast-cycle vertical (going cold at 5 days) flags it.
    const fast = scoreOpportunity(o, stageMap, undefined, { ...DEFAULT_RECALL_THRESHOLDS, goingColdDays: 5, stalledDays: 10, noActivityDays: 3, lostWindowDays: 60 });
    expect(fast?.reason).toBe("going_cold");
  });

  it("widens the lost-recovery window for long-cycle verticals", () => {
    const o = opp({ stageId: "lost", value: 8000, lastActivityAt: daysAgo(200) });
    expect(scoreOpportunity(o, stageMap)).toBeNull(); // default 180-day window: too cold
    const slow = scoreOpportunity(o, stageMap, undefined, { ...DEFAULT_RECALL_THRESHOLDS, goingColdDays: 21, stalledDays: 45, noActivityDays: 7, lostWindowDays: 240 });
    expect(slow?.reason).toBe("lost_winnable");
  });
});

describe("overdue close date", () => {
  it("flags an open deal past its expected close date and boosts its score", () => {
    const onTime = scoreOpportunity(opp({ stageId: "open_hi", lastActivityAt: daysAgo(20), expectedCloseAt: daysAgo(-10) }), stageMap);
    const overdue = scoreOpportunity(opp({ stageId: "open_hi", lastActivityAt: daysAgo(20), expectedCloseAt: daysAgo(20) }), stageMap);
    expect(onTime?.overdue).toBe(false);
    expect(overdue?.overdue).toBe(true);
    expect(overdue!.score).toBeGreaterThan(onTime!.score);
    expect(overdue?.recommendation).toContain("Close date slipped");
  });

  it("does not mark a deal with no close date as overdue", () => {
    const r = scoreOpportunity(opp({ stageId: "open_hi", lastActivityAt: daysAgo(20), expectedCloseAt: undefined }), stageMap);
    expect(r?.overdue).toBe(false);
  });

  it("ignores close dates on lost deals (they have their own path)", () => {
    const r = scoreOpportunity(opp({ stageId: "lost", value: 8000, lastActivityAt: daysAgo(20), expectedCloseAt: daysAgo(40) }), stageMap);
    expect(r?.reason).toBe("lost_winnable");
    expect(r?.overdue).toBe(false);
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
