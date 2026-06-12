import { describe, it, expect } from "vitest";
import { requiresSameOrigin, isSameOriginRequest } from "@/lib/route-access";

describe("CSRF guard — which requests must prove same-origin", () => {
  it("guards cookie-authed /api mutations", () => {
    for (const m of ["POST", "PUT", "PATCH", "DELETE", "post"]) {
      expect(requiresSameOrigin(m, "/api/contacts")).toBe(true);
      expect(requiresSameOrigin(m, "/api/messages/send")).toBe(true);
      expect(requiresSameOrigin(m, "/api/opportunities/o_1/activity")).toBe(true);
    }
  });

  it("never guards safe methods or non-API paths", () => {
    expect(requiresSameOrigin("GET", "/api/contacts")).toBe(false);
    expect(requiresSameOrigin("HEAD", "/api/contacts")).toBe(false);
    expect(requiresSameOrigin("POST", "/dashboard")).toBe(false); // Server Actions: Next guards these
    expect(requiresSameOrigin("POST", "/login")).toBe(false);
  });

  it("EXEMPTS the signature/secret-authed machine endpoints (they're cross-origin by design)", () => {
    // A regression here would break Stripe billing, Twilio inbound, or the cron.
    for (const p of [
      "/api/billing/webhook", // Stripe signature
      "/api/agent/cron", // CRON_SECRET bearer + server-side fan-out (no Origin)
      "/api/inbound/sms", // Twilio signature
      "/api/inbound/email",
      "/api/calls/log", // gateway COMMS_WEBHOOK_TOKEN
      "/api/v1/leads", // public API key
      "/api/forms/submit", // HMAC form token
      "/api/bookings/create", // HMAC booking token
      "/api/billing/setup", // operator ADMIN_TOKEN (curled cross-origin)
      "/api/client-error", // public intake, rate-limited
    ]) {
      expect(requiresSameOrigin("POST", p), `${p} must stay exempt`).toBe(false);
    }
  });
});

describe("same-origin comparison", () => {
  const host = "www.recall-touch.com";

  it("passes when Origin host matches the serving host (default :443 normalizes away)", () => {
    expect(isSameOriginRequest("https://www.recall-touch.com", null, host)).toBe(true);
    expect(isSameOriginRequest("https://www.recall-touch.com:443", null, host)).toBe(true);
    // A genuinely different port is a different origin and is blocked.
    expect(isSameOriginRequest("https://www.recall-touch.com:8443", null, host)).toBe(false);
    // A look-alike host (subdomain takeover / typosquat) is blocked.
    expect(isSameOriginRequest("https://recall-touch.com.evil.com", null, host)).toBe(false);
  });

  it("falls back to Referer when Origin is absent", () => {
    expect(isSameOriginRequest(null, "https://www.recall-touch.com/settings", host)).toBe(true);
  });

  it("blocks a cross-site forge and fails closed with no headers", () => {
    expect(isSameOriginRequest("https://evil.example.com", null, host)).toBe(false);
    expect(isSameOriginRequest(null, "https://evil.example.com/x", host)).toBe(false);
    expect(isSameOriginRequest(null, null, host)).toBe(false); // a real browser always sends Origin on POST
    expect(isSameOriginRequest("https://www.recall-touch.com", null, null)).toBe(false); // unknown host
  });

  it("ignores a malformed Origin value", () => {
    expect(isSameOriginRequest("not-a-url", null, host)).toBe(false);
  });
});
