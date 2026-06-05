import type { Contact, CrmProvider } from "@/lib/crm/types";

/**
 * Durable opt-out persistence — the compliance backstop for hasOptedOut().
 *
 * The guardrail can read a hard opt-out from a prior inbound activity, but
 * activity reads are windowed (we fetch the most-recent N), so an opt-out older
 * than the window would be missed and the contact could be re-contacted. To make
 * the opt-out permanent regardless of the activity window, we ALSO flag the
 * contact (attributes.doNotContact) the moment a hard opt-out is first detected.
 * That flag is the very first thing hasOptedOut() checks, so it never ages out.
 */

/** Persist a hard opt-out on the contact so it's honored forever (not just while
 *  the opt-out activity stays inside the recent-activity read window).
 *  Best-effort: needs a writable provider that implements updateContact; external
 *  CRMs (which run their own suppression) no-op. Never throws. Returns true when
 *  the flag is set (or was already present). */
export async function markDoNotContact(provider: CrmProvider, contact: Contact): Promise<boolean> {
  if (!provider.info().capabilities.write || !provider.updateContact) return false;
  if (contact.attributes?.doNotContact === true) return true; // already opted out
  try {
    await provider.updateContact(contact.id, {
      attributes: { ...(contact.attributes ?? {}), doNotContact: true, optedOutAt: new Date().toISOString() },
    });
    return true;
  } catch {
    return false; // best-effort; the logged opt-out activity still suppresses near-term
  }
}
