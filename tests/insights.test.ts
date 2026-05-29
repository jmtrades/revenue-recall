import { describe, it, expect } from "vitest";
import { contactInsights, reachHint } from "@/lib/insights";
import type { Activity } from "@/lib/crm/types";

const act = (over: Partial<Activity>): Activity => ({ id: Math.random().toString(36), kind: "email", summary: "", occurredAt: new Date().toISOString(), ...over });
const at = (hour: number) => new Date(2026, 0, 5, hour, 0, 0).toISOString();

describe("contactInsights", () => {
  it("is unknown with no history and suggests a first touch", () => {
    const r = contactInsights([]);
    expect(r.responsiveness).toBe("unknown");
    expect(r.bestChannel).toBeNull();
    expect(r.note.length).toBeGreaterThan(0);
  });

  it("flags low responsiveness when we've reached out but never heard back", () => {
    const r = contactInsights([act({ direction: "outbound", kind: "email" }), act({ direction: "outbound", kind: "call" })]);
    expect(r.responsiveness).toBe("low");
    expect(r.bestChannel).toBeNull();
    expect(r.note.toLowerCase()).toContain("different channel");
  });

  it("picks the channel they reply on most", () => {
    const r = contactInsights([
      act({ direction: "inbound", kind: "sms", occurredAt: at(9) }),
      act({ direction: "inbound", kind: "sms", occurredAt: at(10) }),
      act({ direction: "inbound", kind: "email", occurredAt: at(15) }),
    ]);
    expect(r.bestChannel).toBe("sms");
    expect(r.responsiveness).toBe("high"); // 3 inbound
  });

  it("identifies the time-of-day window they engage in", () => {
    const r = contactInsights([
      act({ direction: "inbound", kind: "email", occurredAt: at(9) }),
      act({ direction: "inbound", kind: "email", occurredAt: at(10) }),
      act({ direction: "inbound", kind: "email", occurredAt: at(19) }),
    ]);
    expect(r.bestTime).toBe("mornings");
    expect(r.note).toContain("mornings");
  });

  it("rates 1–2 inbound replies as medium responsiveness", () => {
    const r = contactInsights([act({ direction: "inbound", kind: "call", occurredAt: at(14) })]);
    expect(r.responsiveness).toBe("medium");
    expect(r.bestChannel).toBe("call");
    expect(r.bestTime).toBe("afternoons");
  });

  it("ignores non-channel activity (notes, stage changes)", () => {
    const r = contactInsights([
      act({ direction: "inbound", kind: "note", occurredAt: at(9) }),
      act({ direction: "inbound", kind: "stage_change", occurredAt: at(9) }),
    ]);
    expect(r.bestChannel).toBeNull();
  });
});

describe("reachHint", () => {
  it("has no hint when we know nothing", () => {
    expect(reachHint(contactInsights([]))).toBeNull();
  });

  it("nudges toward a light touch when they never reply", () => {
    const hint = reachHint(contactInsights([act({ direction: "outbound", kind: "email" })]));
    expect(hint).toMatch(/light|low-pressure/i);
  });

  it("names the channel and time they engage on", () => {
    const hint = reachHint(
      contactInsights([
        act({ direction: "inbound", kind: "sms", occurredAt: at(9) }),
        act({ direction: "inbound", kind: "sms", occurredAt: at(10) }),
      ]),
    );
    expect(hint).toContain("a text");
    expect(hint).toContain("mornings");
  });
});
