import { describe, it, expect } from "vitest";
import { dedupeRows, normEmail, normPhone } from "@/lib/import/dedupe";
import type { ImportRow } from "@/lib/import/csv";
import type { Contact } from "@/lib/crm/types";

function row(r: Partial<ImportRow> & { name: string }): ImportRow {
  return { ...r };
}

describe("import dedupe — load a full lead list without creating duplicates", () => {
  it("normalizes emails and phones for matching", () => {
    expect(normEmail("  Jane@Example.COM ")).toBe("jane@example.com");
    expect(normPhone("+1 (555) 123-4567")).toBe("5551234567");
    expect(normPhone("555-123-4567")).toBe("5551234567"); // same number, no country code
    expect(normPhone("12345")).toBe(""); // too short to be real
  });

  it("drops rows that duplicate an earlier row in the same batch (by email)", () => {
    const rows = [
      row({ name: "Jane", email: "jane@example.com" }),
      row({ name: "Jane Again", email: "JANE@EXAMPLE.COM" }),
      row({ name: "Bob", email: "bob@example.com" }),
    ];
    const res = dedupeRows(rows, []);
    expect(res.toCreate.map((r) => r.name)).toEqual(["Jane", "Bob"]);
    expect(res.batchDuplicates).toBe(1);
    expect(res.existingDuplicates).toBe(0);
  });

  it("drops rows that duplicate by phone regardless of formatting/country code", () => {
    const rows = [
      row({ name: "A", phone: "+1 555 123 4567" }),
      row({ name: "B", phone: "(555) 123-4567" }),
    ];
    const res = dedupeRows(rows, []);
    expect(res.toCreate.map((r) => r.name)).toEqual(["A"]);
    expect(res.batchDuplicates).toBe(1);
  });

  it("drops rows that match an existing contact (re-import is safe)", () => {
    const existing: Contact[] = [
      { id: "c1", name: "Existing", points: [{ channel: "email", value: "dup@x.io" }] },
      { id: "c2", name: "Phoney", points: [{ channel: "phone", value: "+1 555 999 0000" }] },
    ];
    const rows = [
      row({ name: "Dup Email", email: "DUP@x.io" }),
      row({ name: "Dup Phone", phone: "5559990000" }),
      row({ name: "Fresh", email: "fresh@x.io" }),
    ];
    const res = dedupeRows(rows, existing);
    expect(res.toCreate.map((r) => r.name)).toEqual(["Fresh"]);
    expect(res.existingDuplicates).toBe(2);
    expect(res.batchDuplicates).toBe(0);
  });

  it("keeps rows that have neither email nor phone (can't tell them apart)", () => {
    const rows = [row({ name: "Anon 1" }), row({ name: "Anon 2" })];
    const res = dedupeRows(rows, []);
    expect(res.toCreate).toHaveLength(2);
    expect(res.batchDuplicates).toBe(0);
  });

  it("preserves order; first occurrence wins", () => {
    const rows = [
      row({ name: "First", email: "same@x.io", company: "Keep" }),
      row({ name: "Second", email: "same@x.io", company: "Drop" }),
      row({ name: "Third", phone: "5551112222" }),
    ];
    const res = dedupeRows(rows, []);
    expect(res.toCreate.map((r) => r.name)).toEqual(["First", "Third"]);
    expect(res.toCreate[0].company).toBe("Keep");
  });
});
