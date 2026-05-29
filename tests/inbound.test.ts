import { describe, it, expect, beforeEach } from "vitest";
import { handleInbound } from "@/lib/inbound";
import { getProvider } from "@/lib/crm/registry";

// Uses the built-in (in-memory) provider. No AI key, so replies use the human
// template fallback and REPLY_AUTOPILOT stays off (queued to Approvals).
beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.REPLY_AUTOPILOT;
});

describe("inbound message handling", () => {
  it("takes a message from an unknown sender: creates a contact, logs it, raises a follow-up", async () => {
    const before = (await getProvider().listContacts()).length;
    const res = await handleInbound("sms", "+1 (555) 010-2929", "hey, saw your listing, call me back");
    expect(res.action).toBe("logged");
    expect(res.messageTaken).toBe(true);
    expect(res.contactId).toBeTruthy();

    const after = await getProvider().listContacts();
    expect(after.length).toBe(before + 1);
    const created = after.find((c) => c.id === res.contactId)!;
    expect(created.points.some((p) => p.value.includes("2929"))).toBe(true);

    // The follow-up task was raised on the org's recent activity feed.
    const recent = await getProvider().listRecentActivities(20);
    expect(recent.some((a) => a.kind === "task" && a.contactId === created.id)).toBe(true);
  });

  it("matches a known contact, logs the inbound, and queues a reply", async () => {
    const contacts = await getProvider().listContacts();
    const withEmail = contacts.find((c) => c.points.some((p) => p.channel === "email"));
    expect(withEmail).toBeTruthy();
    const email = withEmail!.points.find((p) => p.channel === "email")!.value;

    const res = await handleInbound("email", email, "How much does this cost?", "Re: your note");
    expect(res.matched).toBe(true);
    expect(res.contactId).toBe(withEmail!.id);
    expect(res.action).toBe("queued");
    expect(res.intent).toBe("price");
  });

  it("takes a message when the contact is unavailable (busy)", async () => {
    const contacts = await getProvider().listContacts();
    const withEmail = contacts.find((c) => c.points.some((p) => p.channel === "email"))!;
    const email = withEmail.points.find((p) => p.channel === "email")!.value;

    const res = await handleInbound("email", email, "can't talk right now, call me back later");
    expect(res.matched).toBe(true);
    expect(res.intent).toBe("busy");
    expect(res.messageTaken).toBe(true);
  });
});
