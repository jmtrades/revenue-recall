import { describe, it, expect } from "vitest";
import crypto from "crypto";
import { verifyWebhook } from "@/lib/billing/stripe";

function sign(payload: string, secret: string, t = Math.floor(Date.now() / 1000)): string {
  const sig = crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return `t=${t},v1=${sig}`;
}

describe("verifyWebhook", () => {
  const secret = "whsec_test";
  const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });

  it("accepts a valid signature", () => {
    expect(verifyWebhook(payload, sign(payload, secret), secret)).toBe(true);
  });

  it("rejects a tampered payload", () => {
    expect(verifyWebhook(payload + " ", sign(payload, secret), secret)).toBe(false);
  });

  it("rejects the wrong signing secret", () => {
    expect(verifyWebhook(payload, sign(payload, secret), "whsec_other")).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(verifyWebhook(payload, null, secret)).toBe(false);
  });
});
