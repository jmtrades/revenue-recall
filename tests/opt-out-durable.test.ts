import { describe, it, expect, beforeEach } from "vitest";
import { handleInbound } from "@/lib/inbound";
import { GET as unsubscribe } from "@/app/api/unsubscribe/route";
import { unsubToken } from "@/lib/unsubscribe";
import { getProvider } from "@/lib/crm/registry";
import { markDoNotContact } from "@/lib/opt-out";
import { hasOptedOut } from "@/lib/agent/guardrails";

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.REPLY_AUTOPILOT;
  process.env.UNSUBSCRIBE_SECRET = "test-secret";
});

describe("durable opt-out persists on the contact (survives activity-window aging)", () => {
  it("flags a known contact who texts STOP, and the flag alone opts them out", async () => {
    const phone = `+1558${(Date.now() % 1_000_000).toString().padStart(7, "0")}`;
    const created = await getProvider().createContact({ name: "Durable Tester", points: [{ channel: "phone", value: phone }] });

    const res = await handleInbound("sms", phone, "STOP");
    expect(res.intent).toBe("optout");

    const after = await getProvider().getContact(created.id);
    expect(after?.attributes?.doNotContact).toBe(true);
    // Even with ZERO recent activities (the opt-out message aged out of the
    // read window), the attribute alone suppresses the contact.
    expect(hasOptedOut(after ?? undefined, undefined, [])).toBe(true);
  });

  it("flags a brand-new sender whose first message is an opt-out", async () => {
    const phone = `+1559${(Date.now() % 1_000_000).toString().padStart(7, "0")}`;
    const res = await handleInbound("sms", phone, "unsubscribe");
    expect(res.contactId).toBeTruthy();

    const after = await getProvider().getContact(res.contactId!);
    expect(after?.attributes?.doNotContact).toBe(true);
    expect(hasOptedOut(after ?? undefined, undefined, [])).toBe(true);
  });

  it("flags the contact via the unsubscribe link", async () => {
    const provider = getProvider();
    const contact = await provider.createContact({ name: "Link Unsub", points: [{ channel: "email", value: "durable-unsub@example.com" }] });
    const token = unsubToken(contact.id);

    const res = await unsubscribe(new Request(`http://x/api/unsubscribe?c=${contact.id}&t=${token}`));
    expect(res.status).toBe(200);

    const after = await provider.getContact(contact.id);
    expect(after?.attributes?.doNotContact).toBe(true);
    expect(hasOptedOut(after ?? undefined, undefined, [])).toBe(true);
  });

  it("preserves existing attributes and is idempotent", async () => {
    const provider = getProvider();
    const contact = await provider.createContact({
      name: "Keep Attrs",
      points: [{ channel: "email", value: "keep-attrs@example.com" }],
      attributes: { budget: 5000, emailBounced: true },
    });

    expect(await markDoNotContact(provider, contact)).toBe(true);
    const after = await provider.getContact(contact.id);
    expect(after?.attributes?.doNotContact).toBe(true);
    expect(after?.attributes?.budget).toBe(5000); // unrelated attribute kept
    expect(after?.attributes?.emailBounced).toBe(true); // bounce suppression kept

    // Second call is a no-op success (already flagged), doesn't throw.
    expect(await markDoNotContact(provider, after!)).toBe(true);
  });
});
