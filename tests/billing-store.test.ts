import { describe, it, expect, beforeEach, vi } from "vitest";

// The billing store keeps an in-memory subscription when Supabase isn't
// configured (the test environment). Reset modules per test so the module-level
// state doesn't leak between cases.
beforeEach(() => {
  vi.resetModules();
});

describe("billing store (in-memory fallback)", () => {
  it("defaults a fresh org to the free plan with no Stripe ids", async () => {
    const { getSubscription } = await import("@/lib/billing/store");
    const sub = await getSubscription();
    expect(sub.plan).toBe("free");
    expect(sub.status).toBe("none");
    expect(sub.seats).toBe(1);
    expect(sub.stripeCustomerId).toBeUndefined();
  });

  it("round-trips a saved subscription and preserves untouched fields", async () => {
    const { saveSubscription, getSubscription } = await import("@/lib/billing/store");
    await saveSubscription({ plan: "growth", status: "active", stripeCustomerId: "cus_1", seats: 5 });
    const a = await getSubscription();
    expect(a.plan).toBe("growth");
    expect(a.seats).toBe(5);

    // A partial update must not wipe the customer id or plan.
    await saveSubscription({ status: "past_due" });
    const b = await getSubscription();
    expect(b.status).toBe("past_due");
    expect(b.plan).toBe("growth");
    expect(b.stripeCustomerId).toBe("cus_1");
  });

  it("saveSubscriptionForOrg seeds state in the demo store", async () => {
    const { saveSubscriptionForOrg, getSubscription } = await import("@/lib/billing/store");
    await saveSubscriptionForOrg("org_demo", { plan: "scale", status: "active" });
    const sub = await getSubscription();
    expect(sub.plan).toBe("scale");
    expect(sub.status).toBe("active");
  });

  it("downgrades to free + canceled via saveSubscriptionForCustomer", async () => {
    const { saveSubscription, saveSubscriptionForCustomer, getSubscription } = await import("@/lib/billing/store");
    await saveSubscription({ plan: "growth", status: "active", stripeCustomerId: "cus_9" });
    await saveSubscriptionForCustomer("cus_9", { plan: "free", status: "canceled" });
    const sub = await getSubscription();
    expect(sub.plan).toBe("free");
    expect(sub.status).toBe("canceled");
  });
});
