import { describe, it, expect } from "vitest";
import { inboundAutoSendAllowed } from "@/lib/inbound-gate";

const base = { emailReady: true, smsPlatformReady: true, smsCourtesyBlocked: false };

describe("inboundAutoSendAllowed", () => {
  it("auto-sends email only when the sending domain is ready", () => {
    expect(inboundAutoSendAllowed({ ...base, channel: "email" })).toBe(true);
    expect(inboundAutoSendAllowed({ ...base, channel: "email", emailReady: false })).toBe(false);
  });

  it("auto-sends SMS only when A2P-ready AND inside the courtesy window", () => {
    expect(inboundAutoSendAllowed({ ...base, channel: "sms" })).toBe(true);
    expect(inboundAutoSendAllowed({ ...base, channel: "sms", smsPlatformReady: false })).toBe(false);
    expect(inboundAutoSendAllowed({ ...base, channel: "sms", smsCourtesyBlocked: true })).toBe(false);
  });

  it("treats non-email channels (social/whatsapp) like SMS for gating", () => {
    expect(inboundAutoSendAllowed({ ...base, channel: "whatsapp", smsCourtesyBlocked: true })).toBe(false);
    expect(inboundAutoSendAllowed({ ...base, channel: "whatsapp" })).toBe(true);
  });

  it("email readiness doesn't depend on the SMS courtesy window", () => {
    expect(inboundAutoSendAllowed({ ...base, channel: "email", smsCourtesyBlocked: true })).toBe(true);
  });
});
