import type { ImportRow } from "@/lib/import/csv";
import type { Contact } from "@/lib/crm/types";

/**
 * De-duplication for bulk lead import. Real lead lists are messy: the same
 * person appears twice in a CSV, or a list gets re-imported next month. Without
 * this, "load your full list of leads" would create duplicate contacts and the
 * rep would call the same person twice — the fastest way to churn.
 *
 * We match on email or phone (the stable identifiers), normalized so trivial
 * formatting differences still collapse. A row that matches an existing contact
 * — or an earlier row in the same batch — is dropped. Rows with neither email
 * nor phone are always kept (we can't tell two anonymous rows apart, and
 * dropping them would silently lose real leads).
 */

/** Lowercased, trimmed email for matching. */
export function normEmail(v?: string): string {
  return (v ?? "").trim().toLowerCase();
}

/**
 * Digits-only phone for matching. Keeps the last 10 digits so the same number
 * collapses whether or not it carries a country code (+1 555…, 1 555…, 555…).
 * Returns "" for anything too short to be a real number.
 */
export function normPhone(v?: string): string {
  const digits = (v ?? "").replace(/\D/g, "");
  if (digits.length < 7) return "";
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function keysFor(email?: string, phone?: string): string[] {
  const out: string[] = [];
  const e = normEmail(email);
  if (e) out.push(`e:${e}`);
  const p = normPhone(phone);
  if (p) out.push(`p:${p}`);
  return out;
}

export interface DedupeResult {
  /** Rows that should be created (unique within the batch and not already on file). */
  toCreate: ImportRow[];
  /** Rows dropped because they matched an existing contact. */
  existingDuplicates: number;
  /** Rows dropped because they duplicated an earlier row in the same batch. */
  batchDuplicates: number;
}

/** Build the set of identity keys already present in the CRM. */
function indexExisting(existing: Contact[]): Set<string> {
  const seen = new Set<string>();
  for (const c of existing) {
    for (const pt of c.points ?? []) {
      if (pt.channel === "email") {
        const e = normEmail(pt.value);
        if (e) seen.add(`e:${e}`);
      } else if (pt.channel === "phone" || pt.channel === "sms" || pt.channel === "whatsapp") {
        const p = normPhone(pt.value);
        if (p) seen.add(`p:${p}`);
      }
    }
  }
  return seen;
}

/**
 * Drop rows that duplicate an existing contact or an earlier row in the batch.
 * Order is preserved; the first occurrence of any identity wins.
 */
export function dedupeRows(rows: ImportRow[], existing: Contact[] = []): DedupeResult {
  const existingKeys = indexExisting(existing);
  const batchKeys = new Set<string>();
  const toCreate: ImportRow[] = [];
  let existingDuplicates = 0;
  let batchDuplicates = 0;

  for (const r of rows) {
    const keys = keysFor(r.email, r.phone);
    if (keys.length === 0) {
      toCreate.push(r); // no identity to match on — keep it
      continue;
    }
    if (keys.some((k) => existingKeys.has(k))) {
      existingDuplicates++;
      continue;
    }
    if (keys.some((k) => batchKeys.has(k))) {
      batchDuplicates++;
      continue;
    }
    for (const k of keys) batchKeys.add(k);
    toCreate.push(r);
  }

  return { toCreate, existingDuplicates, batchDuplicates };
}
