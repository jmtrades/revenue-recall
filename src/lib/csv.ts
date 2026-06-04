/**
 * Minimal RFC-4180 CSV serialization for data export. A field is quoted only
 * when it contains a comma, quote, CR or LF; embedded quotes are doubled. Keeps
 * spreadsheets (and re-import) happy without a dependency.
 */
export function csvField(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
  return rows.map((row) => row.map(csvField).join(",")).join("\r\n");
}
