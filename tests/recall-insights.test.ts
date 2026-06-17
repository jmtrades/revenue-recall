import { describe, it, expect } from "vitest";
import { recallInsights } from "@/lib/recall/insights";
import type { RecallTouch } from "@/lib/recall/events";

const t = (over: Partial<RecallTouch>): RecallTouch => ({
  id: Math.random().toString(36).slice(2),
  channel: "email",
  source: "autopilot",
  occurredAt: "2026-06-01T12:00:00Z",
  ...over,
});

describe("recallInsights", () => {
  it("is all-zero and stable on no touches", () => {
    expect(recallInsights([])).toEqual({ totalTouches: 0, dealsTouched: 0, byChannel: [], bySource: [] });
  });

  it("aggregates touches and distinct deals per channel, sorted by volume", () => {
    const r = recallInsights([
      t({ channel: "email", dealId: "d1" }),
      t({ channel: "email", dealId: "d1" }), // same deal, 2 touches
      t({ channel: "email", dealId: "d2" }),
      t({ channel: "call", dealId: "d3" }),
    ]);
    expect(r.totalTouches).toBe(4);
    expect(r.dealsTouched).toBe(3); // d1, d2, d3
    expect(r.byChannel[0]).toMatchObject({ channel: "email", touches: 3, deals: 2 });
    expect(r.byChannel[1]).toMatchObject({ channel: "call", touches: 1, deals: 1 });
    expect(r.byChannel[0].share).toBeCloseTo(0.75, 5);
  });

  it("breaks down by source and omits channels/sources with no touches", () => {
    const r = recallInsights([
      t({ source: "autopilot" }),
      t({ source: "autopilot" }),
      t({ source: "manual" }),
    ]);
    expect(r.bySource.map((s) => s.source)).toEqual(["autopilot", "manual"]); // no "cadence"
    expect(r.bySource[0]).toMatchObject({ source: "autopilot", touches: 2 });
    expect(r.byChannel.every((c) => c.touches > 0)).toBe(true);
  });
});
