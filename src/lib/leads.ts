import { resolveProvider } from "@/lib/crm/registry";
import { normalizeLeadStatus, type LeadStatus } from "@/lib/crm/lead-status";
import type { Contact } from "@/lib/crm/types";

/**
 * Set a contact's lead-lifecycle status. Merges into the existing attributes
 * (never clobbers other keys) and persists via the provider's optional
 * updateContact. Returns the new status, or null if the provider can't write or
 * the contact is missing. Server-only (touches the provider); pure logic is
 * unit-testable against the built-in CRM.
 */
export async function setContactStatus(id: string, status: LeadStatus): Promise<LeadStatus | null> {
  const provider = (await resolveProvider());
  if (!provider.updateContact || !provider.getContact) return null;
  const contact = await provider.getContact(id);
  if (!contact) return null;
  const attributes: Contact["attributes"] = { ...(contact.attributes ?? {}), status };
  await provider.updateContact(id, { attributes });
  return normalizeLeadStatus(status) ?? null;
}
