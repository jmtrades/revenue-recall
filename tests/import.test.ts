import { describe, it, expect } from "vitest";
import { parseCsv, parseImportCsv, rowsToImport } from "@/lib/import/csv";

describe("parseCsv", () => {
  it("splits simple rows and columns", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("honors quoted fields with embedded commas and newlines", () => {
    const text = 'name,note\n"Doe, Jane","line1\nline2"';
    expect(parseCsv(text)).toEqual([
      ["name", "note"],
      ["Doe, Jane", "line1\nline2"],
    ]);
  });

  it("handles escaped double quotes", () => {
    expect(parseCsv('q\n"she said ""hi"""')).toEqual([["q"], ['she said "hi"']]);
  });

  it("tolerates CRLF and trailing blank lines", () => {
    expect(parseCsv("a,b\r\n1,2\r\n\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("rowsToImport / parseImportCsv", () => {
  it("maps aliased headers to canonical fields", () => {
    const csv = "Full Name,Email Address,Phone Number,Organization,Amount,Status\nJane Roe,jane@acme.com,555-1212,Acme Inc,\"$12,500\",Proposal";
    const { rows, headers } = parseImportCsv(csv);
    expect(headers).toEqual(["full name", "email address", "phone number", "organization", "amount", "status"]);
    expect(rows).toEqual([
      { name: "Jane Roe", email: "jane@acme.com", phone: "555-1212", company: "Acme Inc", value: 12500, stage: "Proposal" },
    ]);
  });

  it("maps a language / lang / locale column to the language field", () => {
    expect(parseImportCsv("name,language\nJane,Spanish").rows).toEqual([{ name: "Jane", language: "Spanish" }]);
    expect(parseImportCsv("name,lang\nPat,fr").rows).toEqual([{ name: "Pat", language: "fr" }]);
    expect(parseImportCsv("name,Preferred Language\nSam,es-MX").rows).toEqual([{ name: "Sam", language: "es-MX" }]);
  });

  it("ignores unknown columns and empty cells", () => {
    const csv = "name,favorite_color,value\nSam,,1000\nPat,blue,";
    const { rows } = parseImportCsv(csv);
    expect(rows).toEqual([
      { name: "Sam", value: 1000 },
      { name: "Pat" },
    ]);
  });

  it("composes a First Name + Last Name pair into one full name", () => {
    const csv = "First Name,Last Name,Email\nJane,Roe,jane@acme.com";
    expect(parseImportCsv(csv).rows).toEqual([{ name: "Jane Roe", email: "jane@acme.com" }]);
  });

  it("prefers a full-name column and tolerates first-only / last-only", () => {
    expect(parseImportCsv("name,first name\nJane Roe,Ignored").rows).toEqual([{ name: "Jane Roe" }]); // full wins
    expect(parseImportCsv("first name\nMadonna").rows).toEqual([{ name: "Madonna" }]);
    expect(parseImportCsv("surname\nRoe").rows).toEqual([{ name: "Roe" }]);
  });

  it("does not let a duplicate column clobber an earlier value", () => {
    expect(parseImportCsv("name,phone,phone\nSam,555-1,555-2").rows).toEqual([{ name: "Sam", phone: "555-1" }]);
  });

  it("skips rows that have no name", () => {
    const csv = "name,email\n,nobody@example.com\nReal Person,real@example.com";
    const { rows, skipped } = parseImportCsv(csv);
    expect(skipped).toBe(1);
    expect(rows).toEqual([{ name: "Real Person", email: "real@example.com" }]);
  });

  it("parses currency-formatted values into plain numbers", () => {
    const { rows } = parseImportCsv("name,deal value\nA,\"1,234.56\"\nB,€900\nC,n/a");
    expect(rows[0].value).toBe(1234.56);
    expect(rows[1].value).toBe(900);
    expect(rows[2].value).toBeUndefined();
  });

  it("returns empty for an empty file", () => {
    expect(rowsToImport([])).toEqual({ rows: [], headers: [], skipped: 0 });
  });
});
