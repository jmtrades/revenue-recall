import { describe, it, expect, vi, beforeEach } from "vitest";

// Control the subscription so we can assert the meter uses the EFFECTIVE plan.
const { getSubscription } = vi.hoisted(() => ({ getSubscription: vi.fn() }));
vi.mock("@/lib/billing/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/billing/store")>();
  return { ...actual, getSubscription };
});

import { usageMeter, _resetUsage } from "@/lib/ai/usage";
import { entitlements } from "@/lib/billing/entitlements";

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  _resetUsage();
  getSubscription.mockReset();
});

describe("usage meter reflects the effective plan", () => {
  it("a past_due team org drops to the free action pool (fails closed)", async () => {
    getSubscription.mockResolvedValue({ plan: "team", status: "past_due" });
    const m = await usageMeter();
    expect(m.included).toBe(entitlements("free").actionsPerMonth); // 50, not 10000
  });

  it("a canceled scale org loses its unlimited pool", async () => {
    getSubscription.mockResolvedValue({ plan: "scale", status: "canceled" });
    const m = await usageMeter();
    expect(m.unlimited).toBe(false);
    expect(m.included).toBe(entitlements("free").actionsPerMonth);
  });

  it("an active team org keeps its full pool", async () => {
    getSubscription.mockResolvedValue({ plan: "team", status: "active" });
    const m = await usageMeter();
    expect(m.included).toBe(entitlements("team").actionsPerMonth); // 10000
  });
});
