import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { signCallMeta, verifyCallMeta } from "@/lib/calls/meta-sig";

beforeEach(() => { process.env.ENCRYPTION_KEY = "test-key-at-least-16-chars-long"; });
afterEach(() => { delete process.env.ENCRYPTION_KEY; });

describe("call meta signing", () => {
  it("round-trips a signed meta", () => {
    const signed = signCallMeta({ orgId: "org_1", contactId: "c_1", dealId: "d_1" });
    expect(signed.sig).toBeTruthy();
    expect(verifyCallMeta(signed)).toBe(true);
  });

  it("binds webinar registrant ids into the signature", () => {
    const signed = signCallMeta({
      orgId: "org_1",
      contactId: "c_1",
      webinarSessionId: "sess",
      webinarRegistrantId: "reg",
      webinarStepId: "leave-call-1",
    });
    expect(verifyCallMeta(signed)).toBe(true);
    expect(verifyCallMeta({ ...signed, webinarRegistrantId: "someone-else" })).toBe(false);
  });

  it("rejects tampered identity fields", () => {
    const signed = signCallMeta({ orgId: "org_1", contactId: "c_1" });
    expect(verifyCallMeta({ ...signed, orgId: "org_2" })).toBe(false); // re-pointed at another tenant
    expect(verifyCallMeta({ ...signed, sig: "0".repeat(32) })).toBe(false);
    expect(verifyCallMeta({ orgId: "org_1", contactId: "c_1" })).toBe(false); // missing sig
  });
});
