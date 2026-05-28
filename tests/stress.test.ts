import { describe, it, expect } from "vitest";
import { buildRecallQueue, summarizeRecall } from "@/lib/recall/engine";
import { computeMetrics } from "@/lib/analytics";
import type { Opportunity, Pipeline } from "@/lib/crm/types";

// A realistic enterprise-scale pipeline: one org, tens of thousands of deals.
// These hot-path functions run on every dashboard/recall/forecast render, so
// they must stay correct and fast at scale.
const PIPELINE: Pipeline = {
  id: "p1",
  label: "Sales",
  stages: [
    { id: "s_new", label: "New", probability: 0.1, type: "open" },
    { id: "s_qual", label: "Qualified", probability: 0.3, type: "open" },
    { id: "s_prop", label: "Proposal", probability: 0.6, type: "open" },
    { id: "s_won", label: "Won", probability: 1, type: "won" },
    { id: "s_lost", label: "Lost", probability: 0, type: "lost" },
  ],
};
const STAGE_IDS = PIPELINE.stages.map((s) => s.id);
const DAY = 86_400_000;

function makeOpps(n: number): Opportunity[] {
  const now = Date.now();
  const opps: Opportunity[] = [];
  for (let i = 0; i < n; i++) {
    const stageId = STAGE_IDS[i % STAGE_IDS.length];
    // Spread last activity from fresh to 120 days stale to exercise every reason.
    const staleDays = (i * 7) % 120;
    opps.push({
      id: `o_${i}`,
      title: `Deal ${i}`,
      pipelineId: "p1",
      stageId,
      value: 1000 + (i % 50) * 250,
      currency: "USD",
      contactId: `c_${i}`,
      createdAt: new Date(now - (staleDays + 30) * DAY).toISOString(),
      updatedAt: new Date(now - staleDays * DAY).toISOString(),
      lastActivityAt: i % 13 === 0 ? undefined : new Date(now - staleDays * DAY).toISOString(),
      closedAt: stageId === "s_won" || stageId === "s_lost" ? new Date(now - staleDays * DAY).toISOString() : undefined,
    });
  }
  return opps;
}

describe("recall engine + analytics at scale", () => {
  const N = 25_000;
  const opps = makeOpps(N);

  it("scores 25k deals fast, sorted by descending priority", () => {
    const t0 = performance.now();
    const queue = buildRecallQueue(opps, [PIPELINE]);
    const ms = performance.now() - t0;

    expect(queue.length).toBeGreaterThan(0);
    expect(queue.length).toBeLessThanOrEqual(N);
    // Sorted: every score >= the next.
    for (let i = 1; i < queue.length; i++) {
      expect(queue[i - 1].score).toBeGreaterThanOrEqual(queue[i].score);
    }
    // Scores are well-formed.
    for (const it of queue) {
      expect(it.score).toBeGreaterThanOrEqual(0);
      expect(it.score).toBeLessThanOrEqual(100);
      expect(Number.isFinite(it.weightedValue)).toBe(true);
    }
    // Generous budget — this is a synchronous render-path call.
    expect(ms).toBeLessThan(1500);
  });

  it("summary totals reconcile with the queue", () => {
    const queue = buildRecallQueue(opps, [PIPELINE]);
    const summary = summarizeRecall(queue, "USD");
    expect(summary.itemCount).toBe(queue.length);
    const reasonCount = Object.values(summary.byReason).reduce((s, r) => s + r.count, 0);
    expect(reasonCount).toBe(queue.length);
    const reasonValue = Object.values(summary.byReason).reduce((s, r) => s + r.value, 0);
    expect(Math.abs(reasonValue - summary.totalRecoverable)).toBeLessThan(1);
  });

  it("computeMetrics stays finite and non-negative at scale", () => {
    const m = computeMetrics(opps, PIPELINE);
    expect(Number.isFinite(m.openValue)).toBe(true);
    expect(m.openValue).toBeGreaterThanOrEqual(0);
    expect(m.weightedForecast).toBeGreaterThanOrEqual(0);
    expect(m.winRate).toBeGreaterThanOrEqual(0);
    expect(m.winRate).toBeLessThanOrEqual(1);
    expect(m.openCount + m.wonCount + m.lostCount).toBeLessThanOrEqual(N);
  });

  it("handles empty and single-deal inputs without throwing", () => {
    expect(buildRecallQueue([], [PIPELINE])).toEqual([]);
    expect(summarizeRecall([], "USD").totalRecoverable).toBe(0);
    const m = computeMetrics([], PIPELINE);
    expect(m.openValue).toBe(0);
    expect(m.winRate).toBe(0);
    expect(buildRecallQueue(makeOpps(1), [PIPELINE]).length).toBeLessThanOrEqual(1);
  });
});
