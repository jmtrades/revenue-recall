import { describe, it, expect, afterEach } from "vitest";
import { placeCall, setVoiceTransport, type VoiceCall } from "@/lib/comms";

afterEach(() => setVoiceTransport(null));

describe("per-org caller ID", () => {
  it("forwards the org's own 'from' number through placeCall to the voice transport", async () => {
    let captured: VoiceCall | null = null;
    setVoiceTransport({
      id: "test",
      available: () => true,
      place: async (c) => {
        captured = c;
        return { id: "ok", status: "queued", provider: "test" };
      },
    });
    const r = await placeCall("+15551234567", { from: "+14155550000", context: "hi" });
    expect(r.status).toBe("queued");
    const got = captured as VoiceCall | null;
    expect(got?.from).toBe("+14155550000");
    expect(got?.to).toBe("+15551234567");
  });
});
