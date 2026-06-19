import { describe, it, expect } from "vitest";
import { recallWinByVertical, recallWinByCadenceStep } from "@/lib/recall/insights";
import type { RecallTouch } from "@/lib/recall/events";

function touch(p: Partial<RecallTouch> & { dealId: string; occurredAt: string }): RecallTouch {
  return { id: Math.random().toString(36).slice(2), channel: "email", source: "cadence", ...p };
}

describe("recallWinByVertical", () => {
  it("attributes recovered value to the last touch's vertical", () => {
    const touches = [
      touch({ dealId: "d1", occurredAt: "2026-01-01", industry: "real_estate" }),
      touch({ dealId: "d2", occurredAt: "2026-01-02", industry: "hvac" }),
    ];
    const wins = [
      { dealId: "d1", value: 1000, wonAt: "2026-02-01" },
      { dealId: "d2", value: 500, wonAt: "2026-02-01" },
    ];
    const r = recallWinByVertical(touches, wins);
    expect(r.attributedValue).toBe(1500);
    expect(r.groups.find((g) => g.key === "real_estate")?.recoveredValue).toBe(1000);
    expect(r.groups.find((g) => g.key === "hvac")?.recoveredValue).toBe(500);
  });

  it("treats a win whose touch carries no vertical as unattributed (pre-flywheel rows don't crash)", () => {
    const r = recallWinByVertical([touch({ dealId: "d1", occurredAt: "2026-01-01" })], [{ dealId: "d1", value: 1000, wonAt: "2026-02-01" }]);
    expect(r.attributedValue).toBe(0);
    expect(r.unattributedDeals).toBe(1);
  });
});

describe("recallWinByCadenceStep", () => {
  it("buckets recovery by the step that LAST re-engaged the deal", () => {
    const touches = [
      touch({ dealId: "d1", occurredAt: "2026-01-01", stepIndex: 0 }),
      touch({ dealId: "d1", occurredAt: "2026-01-05", stepIndex: 2 }), // most recent on/before the win
    ];
    const r = recallWinByCadenceStep(touches, [{ dealId: "d1", value: 800, wonAt: "2026-02-01" }]);
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0].key).toBe("Step 3"); // stepIndex 2 → human "Step 3"
    expect(r.groups[0].recoveredValue).toBe(800);
  });

  it("ignores touches after the win (only on/before counts)", () => {
    const touches = [
      touch({ dealId: "d1", occurredAt: "2026-01-05", stepIndex: 1 }),
      touch({ dealId: "d1", occurredAt: "2026-03-01", stepIndex: 4 }), // after the win — must not count
    ];
    const r = recallWinByCadenceStep(touches, [{ dealId: "d1", value: 300, wonAt: "2026-02-01" }]);
    expect(r.groups[0].key).toBe("Step 2");
  });
});
