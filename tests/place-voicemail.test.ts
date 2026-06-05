import { describe, it, expect, afterEach } from "vitest";
import { placeCall, setVoiceTransport, type VoiceCall } from "@/lib/comms";

afterEach(() => setVoiceTransport(null));

describe("placeCall threads the voicemail script to the voice transport", () => {
  it("forwards `voicemail` (and opener) so the gateway can leave it on a machine", async () => {
    let captured: VoiceCall | null = null;
    setVoiceTransport({
      id: "test",
      available: () => true,
      place: async (c) => {
        captured = c;
        return { id: "ok", status: "queued", provider: "test" };
      },
    });
    const r = await placeCall("+15551234567", { opener: "Hey Sam — got a sec?", voicemail: "Hey Sam, it's Alex — quick one, ring me back." });
    expect(r.status).toBe("queued");
    expect(captured?.voicemail).toBe("Hey Sam, it's Alex — quick one, ring me back.");
    expect(captured?.opener).toBe("Hey Sam — got a sec?");
  });
});
