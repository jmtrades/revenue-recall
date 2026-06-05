/**
 * Minimal RFC-4180 CSV serialization for data export. A field is quoted only
 * when it contains a comma, quote, CR or LF; embedded quotes are doubled. Keeps
 * spreadsheets (and re-import) happy without a dependency.
 *
 * Also neutralizes spreadsheet FORMULA INJECTION: a cell that starts with `=`,
 * `@`, tab/CR, or a `+`/`-` not followed by a digit is evaluated as a formula by
 * Excel/Sheets (e.g. `=HYPERLINK(...)` exfiltrates other cells, `=cmd|...` runs a
 * command). Attacker-controlled fields (a contact name/company/title submitted
 * via public lead capture) flow into exports, so we prefix such a value with a
 * single quote — Excel then treats it as text. A real phone (`+15551234567`) or
 * number (`-5`) starts with a digit after the sign, so it's left untouched.
 */
export function csvField(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=@\t\r]/.test(s) || /^[+\-][^\d]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
  return rows.map((row) => row.map(csvField).join(",")).join("\r\n");
}
