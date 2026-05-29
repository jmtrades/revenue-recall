import { describe, it, expect } from "vitest";
import { computeRecallOutcomes, recallByOwner, type RecallEnrollmentRef, type RecallItem } from "@/lib/recall/engine";
import type { Opportunity, Stage } from "@/lib/crm/types";

const stages: Stage[] = [
  { id: "open", label: "Open", probability: 0.4, type: "open" },
  { id: "won", label: "Won", probability: 1, type: "won" },
  { id: "lost", label: "Lost", probability: 0, type: "lost" },
];
const stageMap = new Map(stages.map((s) => [s.id, s]));

function deal(p: Partial<Opportunity>): Opportunity {
  return {
    id: "d", title: "Deal", pipelineId: "p", stageId: "open", value: 10000, currency: "USD",
    contactId: "c", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-03-01T00:00:00Z", ...p,
  };
}

function enr(p: Partial<RecallEnrollmentRef>): RecallEnrollmentRef {
  return { sequenceId: "recall", dealId: "d", stepIndex: 0, status: "active", enrolledAt: "2026-02-01T00:00:00Z", ...p };
}

describe("computeRecallOutcomes", () => {
  it("counts recalled, re-engaged, won-back (with recovered value), and in-progress", () => {
    const opps = new Map<string, Opportunity>([
      ["won1", deal({ id: "won1", stageId: "won", value: 5000, closedAt: "2026-02-15T00:00:00Z" })],
      ["open1", deal({ id: "open1", stageId: "open" })],
      ["lost1", deal({ id: "lost1", stageId: "lost" })],
    ]);
    const enrollments = [
      enr({ dealId: "won1", stepIndex: 2 }),          // re-engaged + won back
      enr({ dealId: "open1", lastStepAt: "2026-02-03T00:00:00Z" }), // re-engaged, still open
      enr({ dealId: "lost1", stepIndex: 0 }),         // recalled, no touch yet, lost
    ];
    const o = computeRecallOutcomes(enrollments, opps, stageMap, "USD");
    expect(o.recalled).toBe(3);
    expect(o.reEngaged).toBe(2);
    expect(o.wonBack).toBe(1);
    expect(o.recoveredValue).toBe(5000);
    expect(o.inProgress).toBe(1);
  });

  it("ignores non-recall sequences", () => {
    const opps = new Map<string, Opportunity>([["d", deal({ stageId: "won" })]]);
    const o = computeRecallOutcomes([enr({ sequenceId: "new_lead", dealId: "d" })], opps, stageMap, "USD");
    expect(o.recalled).toBe(0);
    expect(o.wonBack).toBe(0);
  });

  it("does not credit a win that closed before the recall enrollment", () => {
    const opps = new Map<string, Opportunity>([["d", deal({ stageId: "won", closedAt: "2026-01-10T00:00:00Z" })]]);
    const o = computeRecallOutcomes([enr({ dealId: "d", enrolledAt: "2026-02-01T00:00:00Z" })], opps, stageMap, "USD");
    expect(o.recalled).toBe(1);
    expect(o.wonBack).toBe(0); // won before it was ever recalled
  });

  it("handles contact-only enrollments with no deal gracefully", () => {
    const o = computeRecallOutcomes([enr({ dealId: undefined, stepIndex: 1 })], new Map(), stageMap, "USD");
    expect(o.recalled).toBe(1);
    expect(o.reEngaged).toBe(1);
    expect(o.wonBack).toBe(0);
    expect(o.inProgress).toBe(0);
  });
});

describe("recallByOwner", () => {
  const item = (opportunityId: string, weightedValue: number): RecallItem => ({
    opportunityId, title: "t", value: weightedValue * 2, currency: "USD", weightedValue,
    daysSinceActivity: 20, reason: "going_cold", score: 50, recommendation: "", channel: "email", engaged: false, overdue: false,
  });
  const owners: Record<string, string | undefined> = { d1: "u1", d2: "u1", d3: "u2", d4: undefined };

  it("sums recoverable value and at-risk count per owner, sorted desc", () => {
    const rows = recallByOwner([item("d1", 3000), item("d2", 1000), item("d3", 5000), item("d4", 200)], (id) => owners[id]);
    expect(rows[0]).toEqual({ ownerId: "u2", atRisk: 1, recoverableValue: 5000 });
    expect(rows[1]).toEqual({ ownerId: "u1", atRisk: 2, recoverableValue: 4000 });
    expect(rows[2]).toEqual({ ownerId: "unassigned", atRisk: 1, recoverableValue: 200 });
  });

  it("returns an empty list when nothing is at risk", () => {
    expect(recallByOwner([], () => undefined)).toEqual([]);
  });
});
