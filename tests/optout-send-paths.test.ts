import { describe, it, expect, beforeEach } from "vitest";
import { getProvider } from "@/lib/crm/registry";
import { ingestSocialMessages } from "@/lib/social/ingest";
import { enroll, runDueSteps, listEnrollments, __resetEnrollmentsForTests } from "@/lib/cadence";
import { POST as sendMessage } from "@/app/api/messages/send/route";
import type { InboundSocialMessage } from "@/lib/social/types";

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.REPLY_AUTOPILOT;
  delete process.env.SEQUENCE_AUTOPILOT;
  __resetEnrollmentsForTests();
});

const dm = (externalId: string, text: string): InboundSocialMessage => ({
  platform: "whatsapp",
  externalMessageId: `m_${externalId}_${Date.now()}`,
  from: { externalId, name: "Social Lead", handle: "lead" },
  text,
  at: new Date().toISOString(),
});

describe("social inbound honors opt-out", () => {
  it("never auto-replies to a 'STOP' DM, and records a durable opt-out", async () => {
    const [res] = await ingestSocialMessages([dm(`ext_${Date.now()}`, "STOP")]);
    expect(res.replied).toBe(false); // no reply sent OR queued
    const contact = await getProvider().getContact(res.contactId!);
    expect(contact?.attributes?.doNotContact).toBe(true); // persisted, honored forever
  });

  it("still queues a normal reply for a non-opt-out DM (control)", async () => {
    const [res] = await ingestSocialMessages([dm(`ext2_${Date.now()}`, "hey, is this still available?")]);
    expect(res.replied).toBe("queued");
  });
});

describe("manual send route honors opt-out", () => {
  const post = (body: unknown) =>
    sendMessage(new Request("http://localhost/api/messages/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

  it("refuses to send to a do-not-contact contact (403)", async () => {
    const c = await getProvider().createContact({ name: "Opted Out", points: [{ channel: "email", value: `oo${Date.now()}@x.com` }], attributes: { doNotContact: true } });
    const res = await post({ channel: "email", contactId: c.id, body: "hello" });
    expect(res.status).toBe(403);
  });

  it("allows a send to a normal contact (control)", async () => {
    const c = await getProvider().createContact({ name: "Fine", points: [{ channel: "email", value: `ok${Date.now()}@x.com` }] });
    const res = await post({ channel: "email", contactId: c.id, body: "hello" });
    expect(res.status).not.toBe(403);
  });
});

describe("contact-scoped cadence honors an activity-only opt-out", () => {
  it("stops a contact-scoped enrollment when the opt-out lives only in activity history", async () => {
    const provider = getProvider();
    const contact = await provider.createContact({ name: "Activity OptOut", points: [{ channel: "email", value: `ao${Date.now()}@x.com` }] });
    // Opt-out recorded ONLY as an inbound activity — no do-not-contact attribute set
    // (simulating a provider that can't persist the attribute).
    await provider.logActivity({ contactId: contact.id, kind: "email", direction: "inbound", summary: "please unsubscribe, do not contact me", occurredAt: new Date().toISOString() });

    const r = await enroll("new_lead", `contact:${contact.id}`);
    expect(r.enrolled).toBe(1);

    const tick = await runDueSteps();
    expect(tick.stopped).toBeGreaterThanOrEqual(1);
    expect((await listEnrollments("active")).some((e) => e.contactId === contact.id)).toBe(false);
  });
});
