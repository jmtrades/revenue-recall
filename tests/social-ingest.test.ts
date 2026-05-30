import { describe, it, expect } from "vitest";
import { ingestSocialMessages, socialAttrKey, socialAddress } from "@/lib/social/ingest";
import { getProvider } from "@/lib/crm/registry";
import type { InboundSocialMessage } from "@/lib/social/types";

// Uses the built-in (auto-seeded, in-memory) provider — same pattern as
// inbound.test.ts: no reset hook exists, so each test uses unique identities and
// asserts relative behavior rather than absolute counts.
let n = 0;
const uid = () => `tg-${Date.now()}-${n++}`;

function msg(over: Partial<InboundSocialMessage> = {}): InboundSocialMessage {
  return {
    platform: "telegram",
    externalMessageId: `m-${n++}`,
    from: { externalId: uid(), name: `Sender ${Date.now()}-${n}`, handle: "@sam" },
    text: "Hi, are you still taking new clients?",
    at: new Date().toISOString(),
    ...over,
  };
}

describe("ingestSocialMessages", () => {
  it("creates a contact for a new sender and logs the message + follow-up task", async () => {
    const [res] = await ingestSocialMessages([msg()]);
    expect(res.created).toBe(true);
    expect(res.logged).toBe(true);
    expect(res.contactId).toBeTruthy();

    const acts = await getProvider().listActivitiesByContact!(res.contactId!);
    expect(acts.some((a) => a.kind === "note" && a.summary.includes("[Telegram]") && a.direction === "inbound")).toBe(true);
    expect(acts.some((a) => a.kind === "task" && /follow up/i.test(a.summary))).toBe(true);
  });

  it("stores the platform identity so the same sender resolves to one contact", async () => {
    const ext = uid();
    const name = `Repeat ${Date.now()}`;
    const [first] = await ingestSocialMessages([msg({ from: { externalId: ext, name } })]);
    const [second] = await ingestSocialMessages([msg({ text: "following up", from: { externalId: ext, name } })]);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false); // matched the existing contact
    expect(second.contactId).toBe(first.contactId);

    const c = (await getProvider().listContacts()).find((x) => x.id === first.contactId)!;
    expect(c.attributes?.[socialAttrKey("telegram")]).toBe(ext);
    expect(socialAddress(c, "telegram")).toBe(ext);
  });

  it("keeps the same external id on different platforms as distinct identities", async () => {
    const ext = uid();
    const [tg] = await ingestSocialMessages([msg({ platform: "telegram", from: { externalId: ext, name: `Zella ${Date.now()}` } })]);
    const [wa] = await ingestSocialMessages([msg({ platform: "whatsapp", from: { externalId: ext, name: `Yuri ${Date.now()}` } })]);
    expect(tg.created).toBe(true);
    expect(wa.created).toBe(true);
    expect(tg.contactId).not.toBe(wa.contactId);
  });
});
