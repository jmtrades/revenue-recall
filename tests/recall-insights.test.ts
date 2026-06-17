import { describe, it, expect } from "vitest";
import { recallInsights, recallWinAttribution, recoveredByOwner, type AttributableWin } from "@/lib/recall/insights";
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

describe("recallWinAttribution", () => {
  const win = (over: Partial<AttributableWin>): AttributableWin => ({ dealId: "d", value: 1000, wonAt: "2026-06-10T00:00:00Z", ...over });

  it("is all-zero on no wins", () => {
    expect(recallWinAttribution([], [])).toEqual({ byChannel: [], attributedValue: 0, attributedDeals: 0, unattributedDeals: 0 });
  });

  it("credits the win to the LAST channel touched on/before the win", () => {
    const touches = [
      t({ dealId: "d1", channel: "email", occurredAt: "2026-06-01T00:00:00Z" }),
      t({ dealId: "d1", channel: "call", occurredAt: "2026-06-05T00:00:00Z" }), // last before win
      t({ dealId: "d1", channel: "sms", occurredAt: "2026-06-20T00:00:00Z" }), // AFTER win — ignored
    ];
    const r = recallWinAttribution(touches, [win({ dealId: "d1", value: 5000, wonAt: "2026-06-10T00:00:00Z" })]);
    expect(r.attributedDeals).toBe(1);
    expect(r.attributedValue).toBe(5000);
    expect(r.byChannel).toHaveLength(1);
    expect(r.byChannel[0]).toMatchObject({ channel: "call", deals: 1, recoveredValue: 5000, share: 1 });
  });

  it("sums value per channel across deals and sorts by recovered value", () => {
    const touches = [
      t({ dealId: "a", channel: "email", occurredAt: "2026-06-01T00:00:00Z" }),
      t({ dealId: "b", channel: "email", occurredAt: "2026-06-01T00:00:00Z" }),
      t({ dealId: "c", channel: "call", occurredAt: "2026-06-01T00:00:00Z" }),
    ];
    const r = recallWinAttribution(touches, [
      win({ dealId: "a", value: 2000 }),
      win({ dealId: "b", value: 3000 }),
      win({ dealId: "c", value: 9000 }),
    ]);
    expect(r.byChannel.map((c) => c.channel)).toEqual(["call", "email"]); // value desc
    expect(r.byChannel[0]).toMatchObject({ channel: "call", deals: 1, recoveredValue: 9000 });
    expect(r.byChannel[1]).toMatchObject({ channel: "email", deals: 2, recoveredValue: 5000 });
    expect(r.attributedValue).toBe(14000);
  });

  it("counts a win with no qualifying touch as unattributed", () => {
    const r = recallWinAttribution([t({ dealId: "x", channel: "email", occurredAt: "2026-07-01T00:00:00Z" })], [win({ dealId: "x", value: 1000, wonAt: "2026-06-01T00:00:00Z" })]);
    expect(r.attributedDeals).toBe(0);
    expect(r.unattributedDeals).toBe(1);
    expect(r.byChannel).toEqual([]);
  });
});

describe("recoveredByOwner", () => {
  it("groups won-back deals by owner and sorts by recovered value", () => {
    const rows = recoveredByOwner([
      { ownerName: "Ada", value: 2000 },
      { ownerName: "Grace", value: 9000 },
      { ownerName: "Ada", value: 3000 },
    ]);
    expect(rows).toEqual([
      { name: "Grace", deals: 1, recoveredValue: 9000 },
      { name: "Ada", deals: 2, recoveredValue: 5000 },
    ]);
  });

  it("is empty on no deals", () => {
    expect(recoveredByOwner([])).toEqual([]);
  });
});
