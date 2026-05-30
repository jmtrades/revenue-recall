import { describe, it, expect, beforeEach } from "vitest";
import { ingestSocialMessages, socialAttrKey, socialAddress } from "@/lib/social/ingest";
import { getProvider } from "@/lib/crm/registry";
import { __resetBuiltin } from "@/lib/crm/providers/builtin";
import type { InboundSocialMessage } from "@/lib/social/types";

function msg(over: Partial<InboundSocialMessage> = {}): InboundSocialMessage {
  return {
    platform: "telegram",
    externalMessageId: "m1",
    from: { externalId: "tg-999", name: "Sam Rivers", handle: "@sam" },
    text: "Hi, are you still taking new clients?",
    at: new Date().toISOString(),
    ...over,
  };
}

describe("ingestSocialMessages", () => {
  beforeEach(() => __resetBuiltin());

  it("creates a contact for a new sender and logs the message to the timeline", async () => {
    const [res] = await ingestSocialMessages([msg()]);
    expect(res.created).toBe(true);
    expect(res.logged).toBe(true);
    expect(res.contactId).toBeTruthy();

    const provider = getProvider();
    const acts = await provider.listActivitiesByContact!(res.contactId!);
    // inbound message + a follow-up task for the new sender
    expect(acts.some((a) => a.kind === "note" && a.summary.includes("[Telegram]") && a.direction === "inbound")).toBe(true);
    expect(acts.some((a) => a.kind === "task" && /follow up/i.test(a.summary))).toBe(true);
  });

  it("stores the platform identity so the same sender resolves to one contact", async () => {
    const [first] = await ingestSocialMessages([msg({ externalMessageId: "a" })]);
    const [second] = await ingestSocialMessages([msg({ externalMessageId: "b", text: "following up" })]);
    expect(second.created).toBe(false); // matched the existing contact
    expect(second.contactId).toBe(first.contactId);

    const provider = getProvider();
    const contacts = await provider.listContacts();
    const c = contacts.find((x) => x.id === first.contactId)!;
    expect(c.attributes?.[socialAttrKey("telegram")]).toBe("tg-999");
    expect(socialAddress(c, "telegram")).toBe("tg-999");
  });

  it("keeps different platforms with the same external id as distinct identities", async () => {
    // Distinct, clearly-unique names (the builtin store rejects duplicate names).
    const [tg] = await ingestSocialMessages([msg({ platform: "telegram", from: { externalId: "X1", name: "Zella Quintano" } })]);
    const [wa] = await ingestSocialMessages([msg({ platform: "whatsapp", from: { externalId: "X1", name: "Yuri Petrovich" } })]);
    expect(tg.created).toBe(true);
    expect(wa.created).toBe(true);
    expect(tg.contactId).not.toBe(wa.contactId);
  });
});
