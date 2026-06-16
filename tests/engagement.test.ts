import { describe, it, expect } from "vitest";
import { computeEngagement, recordSent, recordReply, engagementStats } from "@/lib/tracking";

describe("computeEngagement", () => {
  it("counts sent / click / reply and derives rates over sent", () => {
    const e = computeEngagement(["sent", "sent", "sent", "sent", "click", "click", "reply"]);
    expect(e).toMatchObject({ sent: 4, clicked: 2, replied: 1 });
    expect(e.replyRate).toBeCloseTo(0.25, 5);
    expect(e.clickRate).toBeCloseTo(0.5, 5);
  });

  it("is all zeros (no divide-by-zero) with no events", () => {
    expect(computeEngagement([])).toEqual({ sent: 0, clicked: 0, replied: 0, replyRate: 0, clickRate: 0 });
  });

  it("ignores unknown kinds", () => {
    const e = computeEngagement(["sent", "open", "bogus", "reply"]);
    expect(e.sent).toBe(1);
    expect(e.replied).toBe(1);
    expect(e.clicked).toBe(0);
  });

  it("clamps rates at 100% — replies/clicks can outpace sends but a rate can't exceed 1", () => {
    // 1 send, 2 replies, 3 clicks → raw ratios would be 200% / 300% (nonsense).
    const e = computeEngagement(["sent", "reply", "reply", "click", "click", "click"]);
    expect(e.sent).toBe(1);
    expect(e.replied).toBe(2);
    expect(e.clicked).toBe(3);
    expect(e.replyRate).toBe(1);
    expect(e.clickRate).toBe(1);
  });
});

describe("recorders + stats degrade without a database", () => {
  it("never throw and engagementStats returns zeros", async () => {
    await expect(recordSent({ channel: "email", contactId: "c1" })).resolves.toBeUndefined();
    await expect(recordReply({ channel: "sms", contactId: "c1" })).resolves.toBeUndefined();
    expect(await engagementStats()).toEqual({ sent: 0, clicked: 0, replied: 0, replyRate: 0, clickRate: 0 });
  });
});
