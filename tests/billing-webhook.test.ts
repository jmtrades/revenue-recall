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

  it("activates the plan on a signed checkout.session.completed", async () => {
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

  it("acknowledges unknown event types without error", async () => {
    const { POST } = await import("@/app/api/billing/webhook/route");
    const res = await POST(signed(JSON.stringify({ type: "charge.refunded", data: { object: {} } })));
    expect(res.status).toBe(200);
  });
});
