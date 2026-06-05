import { describe, it, expect, beforeEach } from "vitest";
import { handleInbound } from "@/lib/inbound";
import { getProvider } from "@/lib/crm/registry";

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.REPLY_AUTOPILOT;
});

describe("inbound never replies to an empty message", () => {
  it("logs but does not draft/queue a reply to a whitespace-only inbound", async () => {
    const phone = `+1555${(Date.now() % 1_000_000).toString().padStart(7, "0")}`;
    await getProvider().createContact({ name: "Empty Sender", points: [{ channel: "phone", value: phone }] });
    const res = await handleInbound("sms", phone, "   ");
    expect(res.action).toBe("logged");
    expect(res.intent).toBe("empty");
  });

  it("still queues a reply for a real message (control)", async () => {
    const phone = `+1556${(Date.now() % 1_000_000).toString().padStart(7, "0")}`;
    await getProvider().createContact({ name: "Real Sender", points: [{ channel: "phone", value: phone }] });
    const res = await handleInbound("sms", phone, "yes, I'm interested — how much?");
    expect(res.action).toBe("queued");
  });
});
