import { describe, it, expect } from "vitest";
import { autoTone } from "@/lib/voice/autotone";
import { isToneId } from "@/lib/tones";

describe("auto-tone", () => {
  it("always resolves to a real tone preset, with a reason", () => {
    const r = autoTone({});
    expect(isToneId(r.tone)).toBe(true);
    expect(r.reason.length).toBeGreaterThan(0);
  });

  it("last reaction wins: cooled → reassuring, keen → enthusiastic", () => {
    expect(autoTone({ lastReplySentiment: "frustrated", value: 999999 }).tone).toBe("reassuring");
    expect(autoTone({ lastReplySentiment: "negative" }).tone).toBe("reassuring");
    expect(autoTone({ lastReplySentiment: "excited", daysSinceContact: 90 }).tone).toBe("enthusiastic");
  });

  it("cold / lost deals re-open gently", () => {
    expect(autoTone({ recallReason: "lost_winnable" }).tone).toBe("reassuring");
    expect(autoTone({ daysSinceContact: 30 }).tone).toBe("reassuring");
  });

  it("late-stage deals get quiet confidence", () => {
    expect(autoTone({ stageLabel: "Proposal Sent" }).tone).toBe("confident");
    expect(autoTone({ stageLabel: "Negotiation" }).tone).toBe("confident");
  });

  it("high-value deals lead consultative", () => {
    expect(autoTone({ value: 80000 }).tone).toBe("consultative");
  });

  it("healthy active deals stay warm", () => {
    expect(autoTone({ daysSinceContact: 2, value: 1000, stageLabel: "New Lead" }).tone).toBe("warm");
  });
});
