import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { callConsentRequired } from "@/lib/agent/guardrails";
import { getProvider } from "@/lib/crm/registry";
import { POST as placeCall } from "@/app/api/calls/place/route";
import { _resetRateLimit } from "@/lib/ratelimit";

beforeEach(() => {
  delete process.env.CALL_REQUIRE_CONSENT;
  delete process.env.VOICE_WEBHOOK_URL; // log mode — never place a real call in tests
  _resetRateLimit();
});
afterEach(() => {
  delete process.env.CALL_REQUIRE_CONSENT;
});

describe("callConsentRequired", () => {
  it("is off by default (manual dialer relies on rep judgment)", () => {
    expect(callConsentRequired()).toBe(false);
  });
  it("turns on for truthy values", () => {
    for (const v of ["true", "1", "yes", "TRUE"]) {
      process.env.CALL_REQUIRE_CONSENT = v;
      expect(callConsentRequired()).toBe(true);
    }
  });
});

const post = (body: unknown) =>
  placeCall(new Request("http://localhost/api/calls/place", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

describe("manual call route — strict consent mode", () => {
  it("blocks a manual AI call to a no-consent contact when strict mode is on", async () => {
    process.env.CALL_REQUIRE_CONSENT = "true";
    const c = await getProvider().createContact({ name: "No Consent", points: [{ channel: "phone", value: "+15557770000" }] });
    const res = await post({ contactId: c.id });
    expect(res.status).toBe(403);
  });

  it("allows the call once consent is recorded on the contact", async () => {
    process.env.CALL_REQUIRE_CONSENT = "true";
    const c = await getProvider().createContact({ name: "Consented", points: [{ channel: "phone", value: "+15557770001" }], attributes: { callConsent: true } });
    const res = await post({ contactId: c.id });
    expect(res.status).not.toBe(403); // log-mode call proceeds (no real dial)
  });

  it("does not block when strict mode is off (default dialer behavior)", async () => {
    const c = await getProvider().createContact({ name: "Default", points: [{ channel: "phone", value: "+15557770002" }] });
    const res = await post({ contactId: c.id });
    expect(res.status).not.toBe(403);
  });
});
