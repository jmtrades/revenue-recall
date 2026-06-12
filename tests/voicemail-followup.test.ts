import { describe, it, expect, beforeEach } from "vitest";
import { voicemailFollowupText } from "@/lib/voice/voicemail";
import { scheduleVoicemailFollowup } from "@/lib/calls";
import { getProvider } from "@/lib/crm/registry";
import { createOutboxItem, listOutbox } from "@/lib/agent/store";

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe("voicemailFollowupText", () => {
  it("is a casual SMS that references the voicemail, by first name, no artifacts", () => {
    const t = voicemailFollowupText({ contactName: "Jordan Lee", dealTitle: "the rollout", seed: "s" });
    expect(t).toContain("Jordan");
    expect(t.toLowerCase()).toMatch(/voicemail|left.*message|missed you/);
    expect(t).not.toContain("undefined");
    expect(t).not.toMatch(/about\s*[.?]/); // no dangling "about" when a deal IS present it's fine
  });
  it("is deterministic per seed", () => {
    expect(voicemailFollowupText({ contactName: "Sam", seed: "x" })).toBe(voicemailFollowupText({ contactName: "Sam", seed: "x" }));
  });

  it("every variant invites naming a time — the reply that books the redial", () => {
    const variants = new Set(["a", "b", "c", "d", "e", "f", "g"].map((seed) => voicemailFollowupText({ contactName: "Sam", seed })));
    expect(variants.size).toBeGreaterThan(1); // the seeds actually cover the pool
    for (const v of variants) expect(v).toMatch(/\btime\b/);
  });
});

const mkPhoneContact = async (suffix: string, attributes?: Record<string, string | number | boolean | null>) => {
  const provider = getProvider();
  return provider.createContact({ name: `VM Followup ${suffix}`, points: [{ channel: "phone", value: `+1555${suffix}` }], attributes });
};

describe("scheduleVoicemailFollowup", () => {
  it("queues a follow-up SMS to Approvals on a voicemail outcome", async () => {
    const c = await mkPhoneContact("3000001");
    const res = await scheduleVoicemailFollowup({ contactId: c.id, outcome: "voicemail" });
    expect(res.queued).toBe(true);
    const queued = (await listOutbox("pending")).filter((o) => o.contactId === c.id && o.channel === "sms");
    expect(queued.length).toBe(1);
    expect(queued[0].body.toLowerCase()).toMatch(/voicemail|message|missed you/);
  });

  it("does nothing for a non-voicemail outcome", async () => {
    const c = await mkPhoneContact("3000002");
    const res = await scheduleVoicemailFollowup({ contactId: c.id, outcome: "connected" });
    expect(res).toEqual({ queued: false, reason: "not_voicemail" });
  });

  it("never texts a contact who opted out", async () => {
    const c = await mkPhoneContact("3000003", { doNotContact: true });
    const res = await scheduleVoicemailFollowup({ contactId: c.id, outcome: "voicemail" });
    expect(res).toEqual({ queued: false, reason: "opted_out" });
  });

  it("skips when there's no phone on file", async () => {
    const provider = getProvider();
    const c = await provider.createContact({ name: "No Phone", points: [{ channel: "email", value: "np@example.com" }] });
    const res = await scheduleVoicemailFollowup({ contactId: c.id, outcome: "voicemail" });
    expect(res).toEqual({ queued: false, reason: "no_phone" });
  });

  it("does not stack a second text when one is already queued", async () => {
    const c = await mkPhoneContact("3000004");
    await createOutboxItem({ contactId: c.id, channel: "sms", body: "already here", source: "template" });
    const res = await scheduleVoicemailFollowup({ contactId: c.id, outcome: "left a voicemail" });
    expect(res).toEqual({ queued: false, reason: "already_queued" });
  });

  it("does not text again if we texted them within 24h", async () => {
    const c = await mkPhoneContact("3000005");
    await getProvider().logActivity({ contactId: c.id, kind: "sms", direction: "outbound", summary: "earlier text", occurredAt: new Date().toISOString() });
    const res = await scheduleVoicemailFollowup({ contactId: c.id, outcome: "voicemail" });
    expect(res).toEqual({ queued: false, reason: "recently_texted" });
  });
});
