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

  it("neutralizes spreadsheet formula injection but keeps phones/numbers intact", () => {
    // Formula triggers get a leading single quote (treated as text by Excel/Sheets).
    expect(csvField("=HYPERLINK(\"http://evil\")")).toBe("\"'=HYPERLINK(\"\"http://evil\"\")\"");
    expect(csvField("=cmd|' /c calc'!A1")).toBe("'=cmd|' /c calc'!A1");
    expect(csvField("@SUM(A1:A9)")).toBe("'@SUM(A1:A9)");
    expect(csvField("+cmd")).toBe("'+cmd");
    expect(csvField("-cmd")).toBe("'-cmd");
    // ...but legitimate phone numbers and negatives are untouched.
    expect(csvField("+15551234567")).toBe("+15551234567");
    expect(csvField("-5")).toBe("-5");
    expect(csvField("Dana Lee")).toBe("Dana Lee");
  });

  it("joins rows with CRLF and fields with commas", () => {
    const csv = toCsv([
      ["Name", "Company"],
      ["Dana", "Acme, Inc."],
    ]);
    expect(csv).toBe('Name,Company\r\nDana,"Acme, Inc."');
  });
});
