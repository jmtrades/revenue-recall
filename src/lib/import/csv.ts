/**
 * CSV import parsing. Pure, dependency-free, and tolerant of the messy files
 * real sales teams export: quoted fields, embedded commas/newlines, CRLF line
 * endings, and a header row whose columns may be named any number of ways.
 *
 * The output is a normalized list of {@link ImportRow}s that the import API turns
 * into contacts (and, when a value/stage is present, opportunities).
 */

export interface ImportRow {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  value?: number;
  stage?: string;
  /** Preferred outreach language (code/label/locale; resolved server-side). */
  language?: string;
}

export interface ParseResult {
  rows: ImportRow[];
  /** Lower-cased header cells, in order. */
  headers: string[];
  /** Data rows dropped because they had no name. */
  skipped: number;
}

type Field = keyof ImportRow;

const HEADER_ALIASES: Record<string, Field> = {
  email: "email",
  "email address": "email",
  "e-mail": "email",
  phone: "phone",
  "phone number": "phone",
  mobile: "phone",
  cell: "phone",
  tel: "phone",
  telephone: "phone",
  company: "company",
  organization: "company",
  organisation: "company",
  account: "company",
  business: "company",
  value: "value",
  amount: "value",
  deal: "value",
  "deal value": "value",
  "deal size": "value",
  price: "value",
  revenue: "value",
  stage: "stage",
  status: "stage",
  "deal stage": "stage",
  "pipeline stage": "stage",
  language: "language",
  "preferred language": "language",
  lang: "language",
  locale: "language",
};

// Name columns are handled separately so a "First Name" + "Last Name" pair
// composes into one full name instead of the surname being silently dropped (no
// "last name" alias used to exist) or one column overwriting the other.
const NAME_PARTS: Record<string, "first" | "last" | "full"> = {
  name: "full",
  "full name": "full",
  "contact": "full",
  "contact name": "full",
  "first name": "first",
  firstname: "first",
  "given name": "first",
  "last name": "last",
  lastname: "last",
  surname: "last",
  "family name": "last",
};

/** Tokenize raw CSV text into a grid of cells, honoring RFC-4180 quoting. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function toNumber(raw: string): number | undefined {
  const cleaned = raw.replace(/[^0-9.\-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

/** Map a tokenized CSV grid (first row = header) into normalized import rows. */
export function rowsToImport(table: string[][]): ParseResult {
  if (table.length === 0) return { rows: [], headers: [], skipped: 0 };
  const headers = table[0].map((h) => h.trim().toLowerCase());
  const columns = headers.map((h) => HEADER_ALIASES[h]);
  const nameParts = headers.map((h) => NAME_PARTS[h]);

  const rows: ImportRow[] = [];
  let skipped = 0;

  for (let i = 1; i < table.length; i++) {
    const cells = table[i];
    const rec: ImportRow = { name: "" };
    let first = "";
    let last = "";
    let full = "";
    for (let c = 0; c < columns.length; c++) {
      const raw = (cells[c] ?? "").trim();
      if (!raw) continue;
      const part = nameParts[c];
      if (part) {
        // First non-empty wins per part, so a duplicate column can't clobber it.
        if (part === "first") first ||= raw;
        else if (part === "last") last ||= raw;
        else full ||= raw;
        continue;
      }
      const field = columns[c];
      if (!field || rec[field] !== undefined) continue; // first non-empty value wins
      if (field === "value") {
        const num = toNumber(raw);
        if (num !== undefined) rec.value = num;
      } else {
        rec[field] = raw;
      }
    }
    // A full-name column wins; otherwise compose first + last (in that order).
    rec.name = (full || [first, last].filter(Boolean).join(" ")).trim();
    if (!rec.name) {
      skipped++;
      continue;
    }
    rows.push(rec);
  }
  return { rows, headers, skipped };
}

/** Convenience: parse raw CSV text straight into normalized import rows. */
export function parseImportCsv(text: string): ParseResult {
  return rowsToImport(parseCsv(text));
}
