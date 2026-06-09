import { resolveProvider } from "@/lib/crm/registry";
import { detectIntent } from "@/lib/ai/intent";
import { draftReply } from "@/lib/ai/reply";
import { getActiveVoice } from "@/lib/voice";
import { getOrgSettings } from "@/lib/org";
import { getIndustry } from "@/lib/industries";
import { contactPreferredLanguage } from "@/lib/languages";
import { sendReply } from "@/lib/outbound";
import { createOutboxItem } from "@/lib/agent/store";
import { fireSpeedToLead } from "@/lib/agent/speed-to-lead";
import { hasOptedOut, isHardOptOut } from "@/lib/agent/guardrails";
import { markDoNotContact } from "@/lib/opt-out";
import type { Activity, Contact } from "@/lib/crm/types";
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

/**
 * The "[Platform]" tag prefixed onto a social message's timeline summary, so the
 * inbox can recover the channel from a note. Shared by the inbound ingest and
 * the outbound reply path so the two formats can never drift apart.
 */
export function platformTag(platform: SocialPlatform): string {
  return platform.charAt(0).toUpperCase() + platform.slice(1);
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
  /** Outbound reply outcome: auto-sent, queued to Approvals, or none. */
  replied?: "sent" | "queued" | false;
  intent?: string;
}

export async function ingestSocialMessages(messages: InboundSocialMessage[]): Promise<SocialIngestResult[]> {
  const provider = (await resolveProvider());
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
          points: [],
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
    let replied: "sent" | "queued" | false = false;
    try {
      // Log the inbound message to the timeline (kind:note keeps within core
      // types; the platform prefix makes the channel unambiguous in the inbox).
      await provider.logActivity({
        contactId: contact.id,
        kind: "note",
        summary: `[${platformTag(platform)}] ${m.text}`,
        direction: "inbound",
        occurredAt: m.at,
      });
      logged = true;

      // Honor opt-out before ANY automated reply or outreach (TCPA/CTIA/CAN-SPAM),
      // exactly like the email/SMS inbound path: if this DM is a hard opt-out
      // ("STOP", "unsubscribe", …) persist a durable do-not-contact flag; if the
      // contact already opted out, suppress. Either way: no auto-reply, no queued
      // reply, no new-lead follow-up task, no speed-to-lead.
      const priorActs: Activity[] = provider.listActivitiesByContact ? await provider.listActivitiesByContact(contact.id).catch(() => []) : [];
      const optedOut = isHardOptOut(m.text) || hasOptedOut(contact, undefined, priorActs);
      if (isHardOptOut(m.text)) await markDoNotContact(provider, contact);

      // New sender → raise a follow-up task so it's never lost, and kick off
      // speed-to-lead (opt-in) just like a fresh inbound email/SMS lead — but never
      // for someone who just opted out.
      if (created && !optedOut) {
        await provider.logActivity({
          contactId: contact.id,
          kind: "task",
          summary: `New ${cap(platform)} message from ${contact.name} — follow up`,
          occurredAt: m.at,
        });
        await fireSpeedToLead(contact.id);
      }

      // Draft a human-voiced reply and send it back on the SAME platform (auto
      // when REPLY_AUTOPILOT=true), or queue it to Approvals — so social is
      // two-way like email/SMS, not a one-way log. Suppressed entirely on opt-out.
      replied = optedOut || !m.text.trim() ? false : await autoReply(contact, platform, m.text);
    } catch {
      logged = false;
    }

    results.push({ platform, contactId: contact.id, created, logged, replied, intent: detectIntent(m.text) });
  }

  return results;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Draft a reply to an inbound social DM in the rep's voice and either send it
 * back on the same platform (REPLY_AUTOPILOT=true) or queue it to Approvals.
 * Mirrors the email/SMS inbound behavior so every channel is genuinely two-way.
 * Best-effort: a reply failure never breaks ingestion of the message itself.
 */
async function autoReply(contact: Contact, platform: SocialPlatform, incoming: string): Promise<"sent" | "queued" | false> {
  try {
    const [voice, org] = await Promise.all([getActiveVoice(), getOrgSettings()]);
    const industry = getIndustry(org.industryId);
    const reply = await draftReply({
      channel: "sms", // social DMs are short-form; reuse the SMS register
      contactName: contact.name,
      company: contact.company,
      dealTitle: contact.name,
      industryLabel: industry.label,
      industryId: industry.id,
      incoming,
      voice,
      language: contactPreferredLanguage(contact.attributes, org.language),
    });

    if (process.env.REPLY_AUTOPILOT === "true" && reply.body.trim()) {
      const res = await sendReply({ contact, channel: platform, body: reply.body });
      if (res.status !== "failed") {
        const provider = (await resolveProvider());
        await provider.logActivity({
          contactId: contact.id,
          kind: "note",
          summary: `[${platformTag(platform)}] ${reply.body}`,
          direction: "outbound",
          occurredAt: new Date().toISOString(),
        });
        return "sent";
      }
    }

    // Default: queue the drafted reply to Approvals for one-click send.
    await createOutboxItem({ contactId: contact.id, channel: platform, body: reply.body, source: reply.source });
    return "queued";
  } catch {
    return false;
  }
}

/** Resolve a contact's external id for a platform (for the outbound reply path). */
export function socialAddress(contact: Contact, platform: SocialPlatform): string | undefined {
  const v = contact.attributes?.[socialAttrKey(platform)];
  return v ? String(v) : undefined;
}
