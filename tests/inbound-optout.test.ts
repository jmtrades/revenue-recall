import { describe, it, expect, beforeEach } from "vitest";
import { handleInbound } from "@/lib/inbound";
import { getProvider } from "@/lib/crm/registry";

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.REPLY_AUTOPILOT;
});

describe("inbound auto-reply honors opt-out (compliance)", () => {
  it("suppresses any auto-reply/queue when a known contact says STOP", async () => {
    const phone = `+1555${(Date.now() % 1_000_000).toString().padStart(7, "0")}`;
    await getProvider().createContact({ name: "OptOut Tester", points: [{ channel: "phone", value: phone }] });

    const res = await handleInbound("sms", phone, "STOP");
    // Logged only — never auto-sent and never queued to Approvals.
    expect(res.action).toBe("logged");
    expect(res.intent).toBe("optout");
    expect(res.messageTaken).toBe(false);
  });

  it("still queues a normal reply for a non-opt-out message", async () => {
    const phone = `+1556${(Date.now() % 1_000_000).toString().padStart(7, "0")}`;
    await getProvider().createContact({ name: "Engaged Tester", points: [{ channel: "phone", value: phone }] });

    const res = await handleInbound("sms", phone, "Yes — I'm interested, send pricing");
    expect(res.action).toBe("queued");
  });

  it("does not start working a brand-new sender whose first message is an opt-out", async () => {
    const phone = `+1557${(Date.now() % 1_000_000).toString().padStart(7, "0")}`;
    const res = await handleInbound("sms", phone, "unsubscribe");
    expect(res.matched).toBe(false);
    expect(res.intent).toBe("optout");
    expect(res.messageTaken).toBe(false);
  });
});
