import { describe, it, expect, beforeEach } from "vitest";
import { unsubToken, verifyUnsubToken, unsubscribeUrl } from "@/lib/unsubscribe";
import { GET as unsubscribe } from "@/app/api/unsubscribe/route";
import { getProvider } from "@/lib/crm/registry";
import { hasOptedOut } from "@/lib/agent/guardrails";

beforeEach(() => {
  process.env.UNSUBSCRIBE_SECRET = "test-secret";
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

describe("unsubscribe token", () => {
  it("verifies its own token and rejects tampering / cross-contact reuse", () => {
    const t = unsubToken("c_1");
    expect(verifyUnsubToken("c_1", t)).toBe(true);
    expect(verifyUnsubToken("c_1", t + "x")).toBe(false);
    expect(verifyUnsubToken("c_2", t)).toBe(false); // token is per-contact
    expect(verifyUnsubToken("c_1", null)).toBe(false);
  });

  it("builds an absolute URL only when a public base is set", () => {
    expect(unsubscribeUrl("c_1")).toBeNull();
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com/";
    const url = unsubscribeUrl("c_1");
    expect(url).toContain("https://app.example.com/api/unsubscribe?c=c_1&t=");
  });
});

describe("unsubscribe endpoint", () => {
  it("rejects an invalid token with 400", async () => {
    const res = await unsubscribe(new Request("http://x/api/unsubscribe?c=c_1&t=bad"));
    expect(res.status).toBe(400);
  });

  it("records an opt-out the guardrails honor for a valid token", async () => {
    const provider = getProvider();
    const contact = await provider.createContact({ name: "Unsub Tester", points: [{ channel: "email", value: "unsub@example.com" }] });
    const token = unsubToken(contact.id);

    const res = await unsubscribe(new Request(`http://x/api/unsubscribe?c=${contact.id}&t=${token}`));
    expect(res.status).toBe(200);
    expect((await res.text()).toLowerCase()).toContain("unsubscribed");

    // From now on the contact is suppressed (guardrails scan the logged activity).
    const recent = await provider.listRecentActivities(50);
    const mine = recent.filter((a) => a.contactId === contact.id);
    expect(hasOptedOut(contact, undefined, mine)).toBe(true);
  });

  it("returns 404 for an unknown but correctly-signed contact", async () => {
    const token = unsubToken("ghost");
    const res = await unsubscribe(new Request(`http://x/api/unsubscribe?c=ghost&t=${token}`));
    expect(res.status).toBe(404);
  });
});
