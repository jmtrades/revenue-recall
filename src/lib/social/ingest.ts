import { getProvider } from "@/lib/crm/registry";
import { detectIntent } from "@/lib/ai/intent";
import type { Contact, CrmProvider } from "@/lib/crm/types";
import type { InboundSocialMessage, SocialPlatform } from "@/lib/social/types";

/**
 * Ingest normalized social messages into the unified inbox. For each message we
 * resolve (or create) the contact by their platform identity, log the message to
 * the timeline so it surfaces in the inbox immediately, and raise a follow-up
 * task for brand-new senders so nothing is dropped.
 *
 * Social identities are stored in contact.attributes under `social:<platform>`
 * (the typed ContactChannel union only covers email/phone/sms/whatsapp/linkedin,
 * so this keeps every platform addressable without widening core types). The
 * outbound reply path reads the same attribute to know where to send back.
 */

export function socialAttrKey(platform: SocialPlatform): string {
  return `social:${platform}`;
}

function matchBySocial(contacts: Contact[], platform: SocialPlatform, externalId: string): Contact | undefined {
  const key = socialAttrKey(platform);
  const id = externalId.trim();
  return contacts.find((c) => String(c.attributes?.[key] ?? "").trim() === id && id !== "");
}

export interface SocialIngestResult {
  platform: SocialPlatform;
  contactId?: string;
  created: boolean;
  logged: boolean;
  intent?: string;
}

export async function ingestSocialMessages(messages: InboundSocialMessage[]): Promise<SocialIngestResult[]> {
  const provider = getProvider();
  const writable = provider.info().capabilities.write;
  const contacts = await provider.listContacts().catch(() => [] as Contact[]);
  const results: SocialIngestResult[] = [];

  for (const m of messages) {
    const platform = m.platform;
    const key = socialAttrKey(platform);
    let contact = matchBySocial(contacts, platform, m.from.externalId);
    let created = false;

    if (!contact && writable) {
      try {
        contact = await provider.createContact({
          name: m.from.name || m.from.handle || `${cap(platform)} contact`,
          attributes: {
            [key]: m.from.externalId,
            ...(m.from.handle ? { [`${key}:handle`]: m.from.handle } : {}),
            source: platform,
          },
        });
        contacts.push(contact);
        created = true;
      } catch {
        contact = undefined;
      }
    }

    if (!contact) {
      results.push({ platform, created: false, logged: false });
      continue;
    }

    let logged = false;
    try {
      // Log the inbound message to the timeline (kind:note keeps within core
      // types; the platform prefix makes the channel unambiguous in the inbox).
      await provider.logActivity({
        contactId: contact.id,
        kind: "note",
        summary: `[${cap(platform)}] ${m.text}`,
        direction: "inbound",
        occurredAt: m.at,
      });
      logged = true;

      // New sender → raise a follow-up task so it's never lost.
      if (created) {
        await provider.logActivity({
          contactId: contact.id,
          kind: "task",
          summary: `New ${cap(platform)} message from ${contact.name} — follow up`,
          occurredAt: m.at,
        });
      }
    } catch {
      logged = false;
    }

    results.push({ platform, contactId: contact.id, created, logged, intent: detectIntent(m.text) });
  }

  return results;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Resolve a contact's external id for a platform (for the outbound reply path). */
export function socialAddress(contact: Contact, platform: SocialPlatform): string | undefined {
  const v = contact.attributes?.[socialAttrKey(platform)];
  return v ? String(v) : undefined;
}
