import { describe, it, expect, beforeEach } from "vitest";
import { inboundOrgToken, verifyInboundOrgToken, inboundWebhookUrl } from "@/lib/inbound-routing";

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SITE_URL;
  process.env.INBOUND_SIGNING_SECRET = "test-inbound-secret";
});

describe("inbound org-routing token", () => {
  it("round-trips and rejects tampering / cross-org / missing pieces", () => {
    const t = inboundOrgToken("org_1")!;
    expect(verifyInboundOrgToken("org_1", t)).toBe(true);
    expect(verifyInboundOrgToken("org_1", t + "x")).toBe(false);
    expect(verifyInboundOrgToken("org_2", t)).toBe(false); // token is per-org
    expect(verifyInboundOrgToken("org_1", null)).toBe(false);
    expect(verifyInboundOrgToken(null, t)).toBe(false);
  });

  it("builds a per-org inbound URL only when a public base is set", () => {
    expect(inboundWebhookUrl("email", "org_1")).toBeNull(); // no NEXT_PUBLIC_SITE_URL
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com/";
    const u = inboundWebhookUrl("email", "org_1");
    expect(u).toContain("https://app.example.com/api/inbound/email?org=org_1&t=");
    expect(inboundWebhookUrl("sms", "org_1")).toContain("/api/inbound/sms?org=org_1&t=");
    expect(inboundWebhookUrl("bounce", "org_1")).toContain("/api/inbound/bounce?org=org_1&t=");
  });
});
