import { describe, it, expect, afterEach } from "vitest";
import { sendSms, setSmsTransport, type SmsMessage } from "@/lib/comms";

afterEach(() => setSmsTransport(null));

describe("per-org SMS caller ID", () => {
  it("forwards the org's own 'from' number through sendSms to the transport", async () => {
    let captured: SmsMessage | null = null;
    setSmsTransport({
      id: "test",
      available: () => true,
      send: async (m) => {
        captured = m;
        return { id: "ok", status: "queued", provider: "test" };
      },
    });
    const r = await sendSms("+15551234567", "hello", { from: "+14155550000" });
    expect(r.status).toBe("queued");
    expect(captured?.from).toBe("+14155550000");
    expect(captured?.to).toBe("+15551234567");
  });

  it("omits 'from' when the org has no caller ID (transport falls back)", async () => {
    let captured: SmsMessage | null = null;
    setSmsTransport({
      id: "test",
      available: () => true,
      send: async (m) => {
        captured = m;
        return { id: "ok", status: "queued", provider: "test" };
      },
    });
    await sendSms("+15551234567", "hello");
    expect(captured?.from).toBeUndefined();
  });
});
