import { getProvider } from "@/lib/crm/registry";
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
  const provider = getProvider();
  const existing = matchExistingContact(await provider.listContacts(), input.email, input.phone);
  if (existing) {
    // Merge any newly-provided fields into the existing contact, don't duplicate.
    const updated = await updateContactRecord(existing.id, input).catch(() => null);
    return { contact: updated ?? existing, deduped: true };
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
  const provider = getProvider();
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
