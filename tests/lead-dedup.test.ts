import { describe, it, expect } from "vitest";
import { captureLead } from "@/lib/leads-capture";

// captureLead runs against the in-memory CRM here (no DB/AI needed).
describe("lead capture de-duplication", () => {
  it("reuses the same contact + open deal on a repeat email submission", async () => {
    const email = `dup-${Date.now()}@acme.com`;
    const a = await captureLead({ name: "Dup Lead", email });
    const b = await captureLead({ name: "Dup Lead (again)", email });
    expect(a.deduped).toBe(false);
    expect(b.deduped).toBe(true);
    expect(b.contactId).toBe(a.contactId); // no duplicate contact
    expect(b.dealId).toBe(a.dealId); // no duplicate deal / double outreach
  });

  it("matches on phone too (format-insensitive)", async () => {
    const phone = `+1 (555) ${(Date.now() % 1_000_000).toString().padStart(7, "0").slice(0, 3)}-${(Date.now() % 10000).toString().padStart(4, "0")}`;
    const a = await captureLead({ name: "Phone Lead", phone });
    const b = await captureLead({ name: "Phone Lead 2", phone: phone.replace(/\D/g, "") }); // same number, no formatting
    expect(b.contactId).toBe(a.contactId);
    expect(b.deduped).toBe(true);
  });

  it("treats a genuinely different lead as new", async () => {
    const a = await captureLead({ name: "One", email: `one-${Date.now()}@acme.com` });
    const b = await captureLead({ name: "Two", email: `two-${Date.now()}@acme.com` });
    expect(b.contactId).not.toBe(a.contactId);
    expect(b.deduped).toBe(false);
  });
});
