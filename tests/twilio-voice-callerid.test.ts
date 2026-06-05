import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { placeCall, setVoiceTransport } from "@/lib/comms";

const realFetch = global.fetch;
const TWILIO = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_NUMBER", "VOICE_WEBHOOK_URL", "OUTBOUND_FROM_NUMBER"];

beforeEach(() => {
  for (const k of TWILIO) delete process.env[k];
  setVoiceTransport(null);
  process.env.TWILIO_ACCOUNT_SID = "AC";
  process.env.TWILIO_AUTH_TOKEN = "tok";
  process.env.TWILIO_FROM_NUMBER = "+15550000000"; // platform fallback
});
afterEach(() => {
  global.fetch = realFetch;
  setVoiceTransport(null);
  for (const k of TWILIO) delete process.env[k];
});

function captureFetch(): { body: () => URLSearchParams } {
  let captured = "";
  global.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    captured = String(init?.body ?? "");
    return { ok: true, json: async () => ({ sid: "CA1", status: "queued" }) } as Response;
  }) as unknown as typeof fetch;
  return { body: () => new URLSearchParams(captured) };
}

describe("built-in Twilio voice honors per-org caller ID", () => {
  it("dials from the org's own number, not the platform fallback", async () => {
    const cap = captureFetch();
    const r = await placeCall("+15551112222", { from: "+14155559999" });
    expect(r.provider).toBe("twilio");
    expect(cap.body().get("From")).toBe("+14155559999"); // org caller ID wins
    expect(cap.body().get("To")).toBe("+15551112222");
  });

  it("falls back to TWILIO_FROM_NUMBER when no org caller ID is given", async () => {
    const cap = captureFetch();
    await placeCall("+15551112222");
    expect(cap.body().get("From")).toBe("+15550000000");
  });
});
