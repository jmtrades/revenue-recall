import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { verifyHmacSignature } from "@/lib/webhook";

const secret = "inbound-signing-secret";
const body = JSON.stringify({ from: "prospect@acme.com", text: "sounds good" });
const sig = crypto.createHmac("sha256", secret).update(body).digest("hex");

describe("verifyHmacSignature (inbound email)", () => {
  it("accepts a correct signature, raw or sha256=-prefixed", () => {
    expect(verifyHmacSignature(secret, body, sig)).toBe(true);
    expect(verifyHmacSignature(secret, body, `sha256=${sig}`)).toBe(true);
  });

  it("rejects wrong signature, wrong secret, tampered body, or null", () => {
    expect(verifyHmacSignature(secret, body, "deadbeef")).toBe(false);
    expect(verifyHmacSignature("other-secret", body, sig)).toBe(false);
    expect(verifyHmacSignature(secret, body + "x", sig)).toBe(false);
    expect(verifyHmacSignature(secret, body, null)).toBe(false);
  });
});
