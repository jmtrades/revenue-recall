import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import crypto from "node:crypto";

const SECRET = "whsec_test_abc";

function signed(body: string, t = Math.floor(Date.now() / 1000)): Request {
  const v1 = crypto.createHmac("sha256", SECRET).update(`${t}.${body}`, "utf8").digest("hex");
  return new Request("http://localhost/api/billing/webhook", {
    method: "POST",
    headers: { "stripe-signature": `t=${t},v1=${v1}`, "content-type": "application/json" },
    body,
  });
}

describe("stripe webhook route", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  });
  afterAll(() => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  it("rejects a forged signature with 400", async () => {
    const { POST } = await import("@/app/api/billing/webhook/route");
    const body = JSON.stringify({ type: "checkout.session.completed", data: { object: {} } });
    const req = new Request("http://localhost/api/billing/webhook", {
      method: "POST",
      headers: { "stripe-signature": "t=123,v1=deadbeef" },
      body,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("activates immediately on a signed checkout.session.completed (no trials)", async () => {
    const { POST } = await import("@/app/api/billing/webhook/route");
    const { getSubscription } = await import("@/lib/billing/store");
    const body = JSON.stringify({
      type: "checkout.session.completed",
      data: { object: { client_reference_id: "org_1", metadata: { plan: "growth" }, customer: "cus_1", subscription: "sub_1" } },
    });
    const res = await POST(signed(body));
    expect(res.status).toBe(200);
    const sub = await getSubscription();
    expect(sub.plan).toBe("growth");
    // No trials: the completed checkout charged immediately.
    expect(sub.status).toBe("active");
    expect(sub.stripeCustomerId).toBe("cus_1");
  });

  it("marks past_due on invoice.payment_failed", async () => {
    const { POST } = await import("@/app/api/billing/webhook/route");
    const { getSubscription } = await import("@/lib/billing/store");
    // seed an active sub first
    await POST(signed(JSON.stringify({
      type: "checkout.session.completed",
      data: { object: { client_reference_id: "org_1", metadata: { plan: "growth" }, customer: "cus_1" } },
    })));
    const res = await POST(signed(JSON.stringify({ type: "invoice.payment_failed", data: { object: { customer: "cus_1" } } })));
    expect(res.status).toBe(200);
    expect((await getSubscription()).status).toBe("past_due");
  });

  it("recovers a past_due subscription to active on invoice.payment_succeeded", async () => {
    const { POST } = await import("@/app/api/billing/webhook/route");
    const { getSubscription } = await import("@/lib/billing/store");
    await POST(signed(JSON.stringify({
      type: "checkout.session.completed",
      data: { object: { client_reference_id: "org_1", metadata: { plan: "growth" }, customer: "cus_1" } },
    })));
    await POST(signed(JSON.stringify({ type: "invoice.payment_failed", data: { object: { customer: "cus_1" } } })));
    expect((await getSubscription()).status).toBe("past_due");
    // Retry succeeds → back to active (must reference a subscription invoice).
    const res = await POST(signed(JSON.stringify({ type: "invoice.payment_succeeded", data: { object: { customer: "cus_1", subscription: "sub_1" } } })));
    expect(res.status).toBe(200);
    expect((await getSubscription()).status).toBe("active");
  });

  it("does NOT resurrect a canceled subscription on a stale/out-of-order payment_succeeded", async () => {
    // Stripe can deliver the final invoice of a canceled cycle (or retry an old
    // payment_succeeded) AFTER subscription.deleted. Flipping it back to active
    // would re-grant paid access to a churned customer.
    const saveSpy = vi.fn(async () => {});
    vi.doMock("@/lib/billing/store", async () => {
      const actual = await vi.importActual<typeof import("@/lib/billing/store")>("@/lib/billing/store");
      return { ...actual, orgIdForCustomer: async () => "org_x", statusForOrg: async () => "canceled", saveSubscriptionForCustomer: saveSpy };
    });
    const { POST } = await import("@/app/api/billing/webhook/route");
    const res = await POST(signed(JSON.stringify({ type: "invoice.payment_succeeded", data: { object: { customer: "cus_x", subscription: "sub_x" } } })));
    expect(res.status).toBe(200);
    expect(saveSpy).not.toHaveBeenCalled(); // canceled stays canceled
    vi.doUnmock("@/lib/billing/store");
  });

  it("DOES recover a non-canceled (past_due) subscription on payment_succeeded", async () => {
    const saveSpy = vi.fn(async () => {});
    vi.doMock("@/lib/billing/store", async () => {
      const actual = await vi.importActual<typeof import("@/lib/billing/store")>("@/lib/billing/store");
      return { ...actual, orgIdForCustomer: async () => "org_y", statusForOrg: async () => "past_due", saveSubscriptionForCustomer: saveSpy };
    });
    const { POST } = await import("@/app/api/billing/webhook/route");
    const res = await POST(signed(JSON.stringify({ type: "invoice.payment_succeeded", data: { object: { customer: "cus_y", subscription: "sub_y" } } })));
    expect(res.status).toBe(200);
    expect(saveSpy).toHaveBeenCalledWith("cus_y", expect.objectContaining({ status: "active" }));
    vi.doUnmock("@/lib/billing/store");
  });

  it("ignores a one-off (non-subscription) paid invoice", async () => {
    const { POST } = await import("@/app/api/billing/webhook/route");
    const res = await POST(signed(JSON.stringify({ type: "invoice.payment_succeeded", data: { object: { customer: "cus_1" } } })));
    expect(res.status).toBe(200); // acknowledged, no status flip without a subscription
  });

  it("acknowledges unknown event types without error", async () => {
    const { POST } = await import("@/app/api/billing/webhook/route");
    const res = await POST(signed(JSON.stringify({ type: "charge.refunded", data: { object: {} } })));
    expect(res.status).toBe(200);
  });

  it("returns 500 (so Stripe retries) when a subscription write fails", async () => {
    // A failed DB write must NOT be swallowed with a 200 — that would strand a
    // paying customer on `free`. Simulate the write throwing and assert 5xx.
    vi.doMock("@/lib/billing/store", async () => {
      const actual = await vi.importActual<typeof import("@/lib/billing/store")>("@/lib/billing/store");
      return { ...actual, saveSubscriptionForOrg: async () => { throw new Error("db write failed"); } };
    });
    const { POST } = await import("@/app/api/billing/webhook/route");
    const res = await POST(signed(JSON.stringify({
      type: "checkout.session.completed",
      data: { object: { client_reference_id: "org_1", metadata: { plan: "growth" }, customer: "cus_1", subscription: "sub_1" } },
    })));
    expect(res.status).toBe(500);
    vi.doUnmock("@/lib/billing/store");
  });

  it("syncs seats + item-level current_period_end on subscription.updated", async () => {
    const { POST } = await import("@/app/api/billing/webhook/route");
    const { getSubscription } = await import("@/lib/billing/store");
    await POST(signed(JSON.stringify({ type: "checkout.session.completed", data: { object: { client_reference_id: "org_1", metadata: { plan: "team" }, customer: "cus_1" } } })));
    const periodEnd = 1893456000; // 2030-01-01
    const res = await POST(signed(JSON.stringify({
      type: "customer.subscription.updated",
      data: { object: { customer: "cus_1", status: "active", items: { data: [{ price: { id: "price_x" }, quantity: 4, current_period_end: periodEnd }] } } },
    })));
    expect(res.status).toBe(200);
    const sub = await getSubscription();
    expect(sub.seats).toBe(4);
    expect(sub.status).toBe("active");
    expect(sub.currentPeriodEnd).toBe(new Date(periodEnd * 1000).toISOString());
  });
});
