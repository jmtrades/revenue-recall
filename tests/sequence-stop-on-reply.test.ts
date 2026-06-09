import { describe, it, expect, beforeEach } from "vitest";
import { enroll, listEnrollments, stopEnrollmentsForContact, __resetEnrollmentsForTests } from "@/lib/cadence";
import { getProvider } from "@/lib/crm/registry";
import { handleInbound } from "@/lib/inbound";

// No AI key + no Supabase → template drafting + in-memory enrollments (built-in CRM).
beforeEach(() => {
  __resetEnrollmentsForTests();
  delete process.env.ANTHROPIC_API_KEY;
});

describe("a reply stops the cadence", () => {
  it("stops only the replying contact's active enrollments", async () => {
    const p = getProvider();
    const a = await p.createContact({ name: "Replier", points: [{ channel: "email", value: `rep-${Date.now()}@x.com` }] });
    const b = await p.createContact({ name: "Quiet", points: [{ channel: "email", value: `quiet-${Date.now()}@x.com` }] });
    await enroll("new_lead", `contact:${a.id}`);
    await enroll("new_lead", `contact:${b.id}`);

    const stopped = await stopEnrollmentsForContact(a.id);
    expect(stopped).toBe(1);

    const active = await listEnrollments("active");
    expect(active.some((e) => e.contactId === a.id)).toBe(false);
    expect(active.some((e) => e.contactId === b.id)).toBe(true); // untouched
  });

  it("an inbound email from an enrolled contact ends their sequence", async () => {
    const p = getProvider();
    const email = `stopme-${Date.now()}@x.com`;
    const c = await p.createContact({ name: "Inbound Replier", points: [{ channel: "email", value: email }] });
    await enroll("new_lead", `contact:${c.id}`);
    expect((await listEnrollments("active")).some((e) => e.contactId === c.id)).toBe(true);

    const res = await handleInbound("email", email, "Yes — let's talk tomorrow");
    expect(res.matched).toBe(true);

    expect((await listEnrollments("active")).some((e) => e.contactId === c.id)).toBe(false);
  });

  it("never throws for an unknown contact (best-effort contract)", async () => {
    await expect(stopEnrollmentsForContact("nope_missing")).resolves.toBe(0);
    await expect(stopEnrollmentsForContact("")).resolves.toBe(0);
  });
});
