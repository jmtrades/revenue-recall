import { describe, it, expect } from "vitest";
import { matchExistingContact } from "@/lib/leads-capture";
import { createContactRecord, serializeContact } from "@/lib/contacts";
import type { Contact } from "@/lib/crm/types";

const c = (id: string, points: Contact["points"]): Contact => ({ id, name: id, points } as Contact);

describe("contact matcher (anti-false-positive)", () => {
  it("matches an exact (normalized) email", () => {
    expect(matchExistingContact([c("c1", [{ channel: "email", value: "Jane@Acme.com" }])], "jane@acme.com")?.id).toBe("c1");
  });

  it("does NOT phone-match a short (<10 digit) number", () => {
    // 7-digit input must not match a stored longer number ending in those digits.
    expect(matchExistingContact([c("c1", [{ channel: "phone", value: "+44 20 7946 0000" }])], undefined, "7946000")).toBeUndefined();
  });

  it("does NOT merge two different long numbers that share a 7-digit tail", () => {
    const contacts = [c("c1", [{ channel: "phone", value: "+1 212 555 1234" }])];
    expect(matchExistingContact(contacts, undefined, "+1 415 555 1234")).toBeUndefined(); // different last-10
  });

  it("matches when the last-10 digits are equal (format-insensitive)", () => {
    const contacts = [c("c1", [{ channel: "phone", value: "+1 (555) 867-5309" }])];
    expect(matchExistingContact(contacts, undefined, "5558675309")?.id).toBe("c1");
  });
});

describe("contacts upsert backfills, never overwrites", () => {
  it("a repeat phone submission with a typo'd email does not clobber the stored email", async () => {
    const phone = `+1555${(Date.now() % 1e7).toString().padStart(7, "0")}`;
    const email = `keep-${Date.now()}@acme.com`;
    const a = await createContactRecord({ name: "A", email, phone });
    expect(a.deduped).toBe(false);

    const b = await createContactRecord({ name: "A", phone, email: `typo-${Date.now()}@acme.com`, company: "Acme" });
    expect(b.deduped).toBe(true);
    expect(b.contact.id).toBe(a.contact.id);
    const s = serializeContact(b.contact);
    expect(s.email).toBe(email); // original email preserved (not overwritten)
    expect(s.company).toBe("Acme"); // missing field backfilled
  });
});
