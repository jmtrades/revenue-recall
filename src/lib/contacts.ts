import { resolveProvider } from "@/lib/crm/registry";
import { emitWebhook } from "@/lib/webhooks-out";
import { matchExistingContact } from "@/lib/leads-capture";
import type { Contact, ContactPoint } from "@/lib/crm/types";

/**
 * Shared contact create/update for the public API. A standalone contacts resource
 * (no deal required) so integrations can sync their people directly. Emits
 * contact.created / contact.updated webhooks (best-effort), mirroring the
 * lead/deal event paths.
 */

export interface ContactInput {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  title?: string;
}

/** Stable v1 JSON shape for a contact (email/phone lifted out of points). */
export function serializeContact(c: Contact) {
  return {
    id: c.id,
    name: c.name,
    company: c.company ?? null,
    title: c.title ?? null,
    email: c.points.find((p) => p.channel === "email")?.value ?? null,
    phone: c.points.find((p) => p.channel === "phone")?.value ?? null,
  };
}

function withPoint(points: ContactPoint[], channel: "email" | "phone", value: string): ContactPoint[] {
  const next = points.filter((p) => p.channel !== channel);
  if (value) next.push({ channel, value });
  return next;
}

/** Upsert a contact: reuse an existing one (matched by email/phone) instead of
 *  creating a duplicate. `deduped` is true when an existing contact was matched. */
export async function createContactRecord(input: ContactInput): Promise<{ contact: Contact; deduped: boolean }> {
  const provider = (await resolveProvider());
  const existing = matchExistingContact(await provider.listContacts(), input.email, input.phone);
  if (existing) {
    // BACKFILL only — never overwrite an existing name/company/title/email/phone
    // from a repeat submission (a typo'd email on a phone-matched contact must not
    // clobber the correct one). Destructive edits go through PATCH /contacts/:id.
    const hasEmail = existing.points.some((p) => p.channel === "email" && p.value);
    const hasPhone = existing.points.some((p) => (p.channel === "phone" || p.channel === "sms") && p.value);
    const patch: ContactInput = {};
    if (input.company && !existing.company) patch.company = input.company;
    if (input.title && !existing.title) patch.title = input.title;
    if (input.email && !hasEmail) patch.email = input.email;
    if (input.phone && !hasPhone) patch.phone = input.phone;
    if (Object.keys(patch).length && provider.updateContact) {
      const updated = await updateContactRecord(existing.id, patch).catch(() => null);
      return { contact: updated ?? existing, deduped: true };
    }
    return { contact: existing, deduped: true };
  }
  const points: ContactPoint[] = [];
  if (input.email) points.push({ channel: "email", value: input.email });
  if (input.phone) points.push({ channel: "phone", value: input.phone });
  const contact = await provider.createContact({ name: input.name ?? "Unnamed", company: input.company, title: input.title, points });
  await emitWebhook("contact.created", serializeContact(contact));
  return { contact, deduped: false };
}

/** Update a contact. Returns null when not found OR the provider can't update. */
export async function updateContactRecord(id: string, patch: ContactInput): Promise<Contact | null> {
  const provider = (await resolveProvider());
  if (!provider.updateContact) return null;
  const existing = await provider.getContact(id);
  if (!existing) return null;

  let points = existing.points;
  if (patch.email !== undefined) points = withPoint(points, "email", patch.email);
  if (patch.phone !== undefined) points = withPoint(points, "phone", patch.phone);

  const updated = await provider.updateContact(id, {
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.company !== undefined ? { company: patch.company } : {}),
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    points,
  });
  await emitWebhook("contact.updated", serializeContact(updated));
  return updated;
}

/**
 * Record (or revoke) express consent to place autonomous AI calls to a contact —
 * the gate the autopilot and call-retries enforce before any auto-dial (TCPA /
 * FCC 2024). Stamps `callConsent` + a dated marker so provenance is on the record,
 * and merges into existing attributes (never clobbers other fields). Returns null
 * when the contact's CRM can't store attributes. Caller records the audit.
 */
export async function setContactConsent(id: string, consent: boolean): Promise<Contact | null> {
  const provider = await resolveProvider();
  if (!provider.updateContact) return null;
  const existing = await provider.getContact(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const attributes: Record<string, string | number | boolean | null> = { ...(existing.attributes ?? {}) };
  if (consent) {
    // Combined express consent to autonomous CALLS and TEXTS (the standard
    // opt-in: "by agreeing you consent to be contacted by call and text"). Set
    // both channels' markers so the call gate (hasCallConsent) and the SMS gate
    // (hasSmsConsent) are both satisfied from one action.
    attributes.callConsent = true;
    attributes.callConsentAt = now;
    attributes.smsConsent = true;
    attributes.smsConsentAt = now;
    attributes.consentAt = now;
    attributes.callConsentRevokedAt = null;
  } else {
    // Withdrawal is the safe default — clear every grant marker for BOTH channels
    // (hasCallConsent/hasSmsConsent treat any dated grant as consent), then stamp
    // the revocation, so autonomous calling AND texting stop at once.
    attributes.callConsent = false;
    attributes.callConsentAt = null;
    attributes.voiceConsentAt = null;
    attributes.consentAt = null;
    attributes.voiceConsent = false;
    attributes.consentToCall = false;
    attributes.smsConsent = false;
    attributes.smsConsentAt = null;
    attributes.textConsent = false;
    attributes.consentToText = false;
    attributes.consentToContact = false;
    attributes.callConsentRevokedAt = now;
  }
  const updated = await provider.updateContact(id, { attributes });
  await emitWebhook("contact.updated", serializeContact(updated));
  return updated;
}

export type DeleteContactResult = { ok: true } | { ok: false; reason: "unsupported" | "not_found" | "has_deals" };

/**
 * Permanently delete a contact (junk/duplicate cleanup). Refuses when the
 * contact still has deals: Postgres nulls a deleted contact's deal links
 * (ON DELETE SET NULL), which would orphan live pipeline records — so we make
 * the caller clear the deals first. "unsupported" covers read-only/external
 * CRMs. Emits contact.deleted (best-effort).
 */
export async function deleteContactRecord(id: string): Promise<DeleteContactResult> {
  const provider = (await resolveProvider());
  if (!provider.deleteContact) return { ok: false, reason: "unsupported" };
  const existing = await provider.getContact(id);
  if (!existing) return { ok: false, reason: "not_found" };
  const deals = (await provider.listOpportunities()).filter((o) => o.contactId === id);
  if (deals.length > 0) return { ok: false, reason: "has_deals" };
  await provider.deleteContact(id);
  await emitWebhook("contact.deleted", { id: existing.id, name: existing.name });
  return { ok: true };
}
