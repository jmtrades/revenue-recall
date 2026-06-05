import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sendEmail, setEmailTransport } from "@/lib/comms";

const realFetch = global.fetch;
const CLEAR = ["RESEND_API_KEY", "SENDGRID_API_KEY", "EMAIL_WEBHOOK_URL", "COMMS_WEBHOOK_TOKEN", "EMAIL_FROM"];

beforeEach(() => {
  for (const k of CLEAR) delete process.env[k];
  setEmailTransport(null);
  process.env.EMAIL_WEBHOOK_URL = "https://hooks.example.com/email";
});
afterEach(() => {
  global.fetch = realFetch;
  setEmailTransport(null);
  for (const k of CLEAR) delete process.env[k];
});

/** Stub fetch and capture each POST body the webhook transport sends. */
function captureFetch(): Record<string, unknown>[] {
  const bodies: Record<string, unknown>[] = [];
  global.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    return { ok: true, json: async () => ({ id: "wh_1", status: "sent" }) } as Response;
  }) as unknown as typeof fetch;
  return bodies;
}

describe("webhookEmail forwards only a real from-address", () => {
  it("omits the placeholder EMAIL_FROM rather than forwarding a fake sender", async () => {
    process.env.EMAIL_FROM = "sales@example.com"; // the placeholder default
    const bodies = captureFetch();
    const r = await sendEmail("x@y.com", "Subj", "Body");
    expect(r.provider).toBe("webhook");
    // The placeholder must NOT be forwarded — the receiving integration applies
    // its own verified sender instead of a guaranteed-to-bounce fake address.
    expect(bodies[0].from).toBeUndefined();
  });

  it("forwards a real configured from-address verbatim", async () => {
    process.env.EMAIL_FROM = "hello@acme.com";
    const bodies = captureFetch();
    await sendEmail("x@y.com", "Subj", "Body");
    expect(bodies[0].from).toBe("hello@acme.com");
  });
});
