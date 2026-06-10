import { resolveProvider } from "@/lib/crm/registry";
import { markDoNotContact } from "@/lib/opt-out";
import type { Contact } from "@/lib/crm/types";

/**
 * The suppression list — who the engine will NOT email/contact, and why. Built
 * on the existing contact-attribute flags: `doNotContact` (a hard opt-out) and
 * `emailBounced` (a hard bounce). This is the operator's window into, and manual
 * control over, those flags. Best-effort: needs a writable built-in/Supabase
 * provider; external CRMs run their own suppression and no-op.
 */
export type SuppressReason = "opted_out" | "bounced";

export interface SuppressedRow {
  contactId: string;
  name: string;
  email?: string;
  reasons: SuppressReason[];
  at?: string;
}

function emailOf(c: Contact): string | undefined {
  return c.points.find((p) => p.channel === "email")?.value;
}

function reasonsFor(c: Contact): SuppressReason[] {
  const out: SuppressReason[] = [];
  if (c.attributes?.doNotContact === true) out.push("opted_out");
  if (c.attributes?.emailBounced) out.push("bounced");
  return out;
}

const matchesEmail = (c: Contact, email: string) => {
  const e = email.trim().toLowerCase();
  return c.points.some((p) => p.channel === "email" && p.value.trim().toLowerCase() === e);
};

/** Suppressed contacts (newest suppression first), capped. Never throws. */
export async function listSuppressed(limit = 200): Promise<SuppressedRow[]> {
  const provider = await resolveProvider().catch(() => null);
  if (!provider) return [];
  const contacts = await provider.listContacts().catch(() => [] as Contact[]);
  const rows: SuppressedRow[] = [];
  for (const c of contacts) {
    const reasons = reasonsFor(c);
    if (reasons.length === 0) continue;
    rows.push({
      contactId: c.id,
      name: c.name,
      email: emailOf(c),
      reasons,
      at: (c.attributes?.optedOutAt ?? c.attributes?.emailBouncedAt) as string | undefined,
    });
  }
  rows.sort((a, b) => (a.at && b.at ? (a.at < b.at ? 1 : -1) : 0));
  return rows.slice(0, limit);
}

/** Manually suppress an email (hard opt-out every matching contact). Returns the
 *  number of contacts flagged. Never throws. */
export async function suppressEmail(email: string): Promise<number> {
  const provider = await resolveProvider().catch(() => null);
  if (!provider) return 0;
  const contacts = (await provider.listContacts().catch(() => [] as Contact[])).filter((c) => matchesEmail(c, email));
  let n = 0;
  for (const c of contacts) {
    if (await markDoNotContact(provider, c)) n++;
  }
  return n;
}

/** Lift suppression for an email — clears both the opt-out and bounce flags on
 *  matching contacts so the engine may contact them again. Returns the count. */
export async function unsuppressEmail(email: string): Promise<number> {
  const provider = await resolveProvider().catch(() => null);
  if (!provider || !provider.info().capabilities.write || !provider.updateContact) return 0;
  const contacts = (await provider.listContacts().catch(() => [] as Contact[])).filter((c) => matchesEmail(c, email));
  let n = 0;
  for (const c of contacts) {
    if (c.attributes?.doNotContact !== true && !c.attributes?.emailBounced) continue; // not suppressed
    try {
      await provider.updateContact(c.id, { attributes: { ...(c.attributes ?? {}), doNotContact: false, emailBounced: false } });
      n++;
    } catch {
      /* best-effort */
    }
  }
  return n;
}
