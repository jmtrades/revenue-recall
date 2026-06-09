import { resolveProvider } from "@/lib/crm/registry";
import type { Contact } from "@/lib/crm/types";

/**
 * Email-bounce suppression. When an address hard-bounces, we must stop emailing
 * it — continuing to hit dead addresses is the fastest way to wreck sender
 * reputation and get a domain blacklisted. A hard bounce flags the contact
 * (attributes.emailBounced); the cadence's addressFor() then skips the email
 * channel for that contact (other channels still work).
 */

/** Has this contact's email hard-bounced? Then don't email it again. */
export function isEmailBounced(contact: Contact | undefined): boolean {
  return Boolean(contact?.attributes?.emailBounced);
}

function emailMatches(contact: Contact, email: string): boolean {
  const e = email.trim().toLowerCase();
  return contact.points.some((p) => p.channel === "email" && p.value.trim().toLowerCase() === e);
}

/**
 * Flag every contact with this email as hard-bounced. Best-effort: needs a
 * writable provider that implements updateContact (built-in + Supabase do;
 * external CRMs no-op, since they run their own suppression). Returns the count
 * of contacts now suppressed.
 */
export async function markEmailBounced(email: string): Promise<number> {
  const provider = (await resolveProvider());
  if (!provider.info().capabilities.write || !provider.updateContact) return 0;
  const at = new Date().toISOString();
  const matches = (await provider.listContacts()).filter((c) => emailMatches(c, email));
  let suppressed = 0;
  for (const c of matches) {
    suppressed++;
    if (c.attributes?.emailBounced) continue; // already suppressed
    await provider.updateContact(c.id, { attributes: { ...(c.attributes ?? {}), emailBounced: true, emailBouncedAt: at } });
    await provider
      .logActivity({ contactId: c.id, kind: "email", direction: "inbound", summary: `[bounce] ${email} hard-bounced — suppressing further email`, occurredAt: at })
      .catch(() => undefined);
  }
  return suppressed;
}
