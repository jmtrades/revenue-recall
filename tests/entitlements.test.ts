import { describe, it, expect } from "vitest";
import { entitlements, subscriptionStanding, PLAN_LIMITS } from "@/lib/billing/entitlements";

describe("plan entitlements", () => {
  it("free is the most limited; paid plans unlock the value features", () => {
    expect(entitlements("free").aiLive).toBe(false);
    expect(entitlements("free").autopilot).toBe(false);
    expect(entitlements("free").pipelines).toBe(1);
    expect(entitlements("growth").aiLive).toBe(true);
    expect(entitlements("growth").autopilot).toBe(true);
    expect(entitlements("growth").integrations).toBe(true);
    expect(entitlements("scale").seats).toBe(Infinity);
  });

  it("falls back to free for an unknown plan", () => {
    // @ts-expect-error invalid plan id
    expect(entitlements("enterprise")).toEqual(PLAN_LIMITS.free);
  });
});

describe("subscription standing", () => {
  it("active paid org needs no prompt", () => {
    const s = subscriptionStanding("growth", "active");
    expect(s.standing).toBe("active");
    expect(s.prompt).toBe(false);
  });

  it("trial prompts softly, not urgently", () => {
    const s = subscriptionStanding("growth", "trialing");
    expect(s.standing).toBe("trial");
    expect(s.prompt).toBe(true);
    expect(s.urgent).toBe(false);
  });

  it("past_due and canceled are urgent prompts", () => {
    expect(subscriptionStanding("growth", "past_due").urgent).toBe(true);
    expect(subscriptionStanding("growth", "canceled").urgent).toBe(true);
  });

  it("free plan gets a soft upgrade nudge", () => {
    const s = subscriptionStanding("free", "none");
    expect(s.standing).toBe("free");
    expect(s.prompt).toBe(true);
    expect(s.urgent).toBe(false);
    expect(s.cta).toBeTruthy();
  });

  it("active on the free plan still nudges (no paid plan yet)", () => {
    expect(subscriptionStanding("free", "active").standing).toBe("free");
  });
});
