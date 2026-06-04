import { describe, it, expect } from "vitest";
import { csvField, toCsv } from "@/lib/csv";

describe("csv", () => {
  it("leaves plain fields unquoted", () => {
    expect(csvField("Dana Lee")).toBe("Dana Lee");
    expect(csvField(42)).toBe("42");
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
  });

  it("quotes and escapes fields with commas, quotes, or newlines", () => {
    expect(csvField("Acme, Inc.")).toBe('"Acme, Inc."');
    expect(csvField('She said "hi"')).toBe('"She said ""hi"""');
    expect(csvField("line1\nline2")).toBe('"line1\nline2"');
  });

  it("joins rows with CRLF and fields with commas", () => {
    const csv = toCsv([
      ["Name", "Company"],
      ["Dana", "Acme, Inc."],
    ]);
    expect(csv).toBe('Name,Company\r\nDana,"Acme, Inc."');
  });
});
