import type { SpendRow } from "@/lib/ads/store";

function cells(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (ch === "," && !quoted) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** date,campaign,spend with optional source and currency columns. */
export function parseSpendCsv(text: string): { rows: Omit<SpendRow, "id">[]; errors: string[] } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { rows: [], errors: ["The file is empty."] };
  const header = cells(lines[0]).map((h) => h.toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const dateI = idx("date");
  const campaignI = idx("campaign");
  const spendI = idx("spend") >= 0 ? idx("spend") : idx("amount");
  if (dateI < 0 || campaignI < 0 || spendI < 0) {
    return { rows: [], errors: ["The header needs date, campaign, and spend columns."] };
  }
  const sourceI = idx("source");
  const currencyI = idx("currency");
  const rows: Omit<SpendRow, "id">[] = [];
  const errors: string[] = [];
  for (let n = 1; n < lines.length; n++) {
    const col = cells(lines[n]);
    const date = (col[dateI] ?? "").slice(0, 10);
    const campaign = (col[campaignI] ?? "").slice(0, 160);
    const amount = Number(col[spendI]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !campaign || !Number.isFinite(amount) || amount < 0) {
      errors.push(`Row ${n + 1} was skipped.`);
      continue;
    }
    rows.push({
      date,
      campaign,
      source: (sourceI >= 0 ? col[sourceI] : "manual").slice(0, 80) || "manual",
      amount,
      currency: ((currencyI >= 0 ? col[currencyI] : "USD") || "USD").toUpperCase().slice(0, 8),
    });
  }
  return { rows, errors };
}
