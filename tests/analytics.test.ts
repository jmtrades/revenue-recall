import { describe, it, expect } from "vitest";
import { computeMetrics } from "@/lib/analytics";
import type { Opportunity, Pipeline } from "@/lib/crm/types";

const pipeline: Pipeline = {
  id: "p",
  label: "P",
  stages: [
    { id: "open1", label: "New", probability: 0.5, type: "open" },
    { id: "won", label: "Won", probability: 1, type: "won" },
    { id: "lost", label: "Lost", probability: 0, type: "lost" },
  ],
};

function o(id: string, stageId: string, value: number): Opportunity {
  const now = new Date().toISOString();
  return { id, title: id, pipelineId: "p", stageId, value, currency: "USD", contactId: "c", createdAt: now, updatedAt: now };
}

describe("computeMetrics", () => {
  const opps = [o("a", "open1", 1000), o("b", "open1", 3000), o("c", "won", 5000), o("d", "lost", 2000)];
  const m = computeMetrics(opps, pipeline);

  it("sums open value and weighted forecast", () => {
    expect(m.openValue).toBe(4000);
    expect(m.weightedForecast).toBe(2000); // (1000+3000)*0.5
    expect(m.openCount).toBe(2);
  });

  it("computes won totals and win rate", () => {
    expect(m.wonValue).toBe(5000);
    expect(m.wonCount).toBe(1);
    expect(m.lostCount).toBe(1);
    expect(m.winRate).toBe(0.5); // 1 won / (1 won + 1 lost)
    expect(m.avgDealSize).toBe(5000);
  });

  it("handles an empty pipeline without dividing by zero", () => {
    const empty = computeMetrics([], pipeline);
    expect(empty.winRate).toBe(0);
    expect(empty.avgDealSize).toBe(0);
    expect(empty.openValue).toBe(0);
  });
});
