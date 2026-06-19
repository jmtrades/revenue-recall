import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getProvider } from "@/lib/crm/registry";
import { setEmailTransport, setSmsTransport } from "@/lib/comms";
import { POST as sendMessage } from "@/app/api/messages/send/route";
import { _resetRateLimit } from "@/lib/ratelimit";

// A transport that always "sends" (so channelStatus reports the channel live).
const liveTransport = { id: "test", available: () => true, send: async () => ({ id: "x", status: "sent" as const, provider: "test" }) };

const COMPLIANCE_ENV = ["OUTBOUND_COMPLIANCE", "EMAIL_DOMAIN_VERIFIED", "SMS_A2P_REGISTERED", "COMPLIANCE_ADDRESS"];

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  for (const k of COMPLIANCE_ENV) delete process.env[k];
  setEmailTransport(null);
  setSmsTransport(null);
  _resetRateLimit();
});
afterEach(() => {
  for (const k of COMPLIANCE_ENV) delete process.env[k];
  setEmailTransport(null);
  setSmsTransport(null);
});

const post = (body: unknown) =>
  sendMessage(new Request("http://localhost/api/messages/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

const contact = (extra: Record<string, unknown> = {}) =>
  getProvider().createContact({ name: "Lead", points: [{ channel: "email", value: `c${Math.random().toString(36).slice(2)}@x.com` }, { channel: "phone", value: "+15551230000" }], ...extra });

describe("manual send is held until channel compliance prerequisites pass", () => {
  it("blocks real email (403) when a sender is connected but the domain/postal aren't verified", async () => {
    setEmailTransport(liveTransport); // a real sender is now connected
    const c = await contact();
    const res = await post({ channel: "email", contactId: c.id, body: "hello" });
    expect(res.status).toBe(403);
    expect((await res.json()).blockers?.length).toBeGreaterThan(0);
  });

  it("allows real email once a verified domain + postal address are in place", async () => {
    setEmailTransport(liveTransport);
    process.env.EMAIL_DOMAIN_VERIFIED = "true";
    process.env.COMPLIANCE_ADDRESS = "123 Main St, Springfield";
    const c = await contact();
    const res = await post({ channel: "email", contactId: c.id, body: "hello again" });
    expect(res.status).toBe(200);
  });

  it("blocks real SMS (403) until A2P 10DLC is registered", async () => {
    setSmsTransport(liveTransport);
    const c = await contact();
    const res = await post({ channel: "sms", contactId: c.id, body: "hi" });
    expect(res.status).toBe(403);
  });

  it("never blocks log-mode (no real transport) — flows keep working end-to-end", async () => {
    // No transport registered → log fallback → nothing real leaves, so allowed.
    const c = await contact();
    const res = await post({ channel: "email", contactId: c.id, body: "logged note" });
    expect(res.status).toBe(200);
  });

  it("does not block when the operator opts out of compliance gating", async () => {
    setEmailTransport(liveTransport);
    process.env.OUTBOUND_COMPLIANCE = "false";
    const c = await contact();
    const res = await post({ channel: "email", contactId: c.id, body: "no gate" });
    expect(res.status).toBe(200);
  });
});
