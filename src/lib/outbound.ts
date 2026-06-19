import type { Contact } from "@/lib/crm/types";
import type { SocialPlatform } from "@/lib/social/types";
import { getSocialChannel } from "@/lib/social/registry";
import { socialAddress } from "@/lib/social/ingest";
import { sendEmail, sendSms } from "@/lib/comms";
import { getOrgSettings } from "@/lib/org";
import { unsubscribeUrl } from "@/lib/unsubscribe";

/**
 * Unified outbound — reply on whatever channel the conversation arrived on.
 *
 * Inbound flows in from email, SMS, and six social platforms (WhatsApp,
 * Instagram, Messenger, Telegram, X, LinkedIn). Without one send seam, a reply
 * to a WhatsApp DM would leak out over email — the opposite of "handle every
 * message perfectly." This routes a reply to the right transport and resolves
 * the right address for the contact, so a reply always leaves on the channel it
 * came in on. Email/SMS go through the comms layer; social goes through the
 * social channel registry. Every result is normalized to one shape.
 */

export type OutboundChannel = "email" | "sms" | SocialPlatform;

export interface OutboundReply {
  contact: Contact;
  channel: OutboundChannel;
  body: string;
  /** Email subject (ignored on SMS/social). */
  subject?: string;
  /** Explicit destination; when omitted we resolve it from the contact. */
  to?: string;
}

export interface OutboundResult {
  status: "sent" | "queued" | "logged" | "failed";
  provider: string;
  id: string;
  detail?: string;
}

// Exhaustive by construction: if SocialPlatform gains a member, this object
// stops type-checking until it's added here, so the guard can never drift.
const SOCIAL_PLATFORMS: Record<SocialPlatform, true> = {
  whatsapp: true,
  instagram: true,
  messenger: true,
  linkedin: true,
  x: true,
  telegram: true,
};

export function isSocialChannel(channel: string): channel is SocialPlatform {
  return Object.prototype.hasOwnProperty.call(SOCIAL_PLATFORMS, channel);
}

/** Resolve the address to send to for a channel (explicit override wins). */
export function resolveAddress(contact: Contact, channel: OutboundChannel, override?: string): string | undefined {
  if (override) return override;
  if (channel === "email") return contact.points.find((p) => p.channel === "email")?.value;
  if (channel === "sms") return contact.points.find((p) => p.channel === "sms" || p.channel === "phone")?.value;
  return socialAddress(contact, channel);
}

export async function sendReply(reply: OutboundReply): Promise<OutboundResult> {
  const { contact, channel, body, subject, to } = reply;
  const address = resolveAddress(contact, channel, to);
  if (!address) {
    return { status: "failed", provider: channel, id: "", detail: `No ${channel} address on contact` };
  }

  if (channel === "email") {
    // Commercial outreach — carry the same CAN-SPAM footer the engine/cadence
    // send: the org's configured sender name + postal address (from Settings),
    // and a per-contact one-click unsubscribe link. This path backs the
    // Approvals "approve & send" flow, so dropping it would ship non-compliant
    // email from the primary review-mode send route.
    const org = await getOrgSettings().catch(() => null);
    const r = await sendEmail(address, subject ?? "", body, {
      unsubscribeUrl: contact.id ? await unsubscribeUrl(contact.id) : null,
      compliance: { orgName: org?.compliance?.senderName ?? org?.name, address: org?.compliance?.address },
    });
    return { status: r.status, provider: r.provider, id: r.id, detail: r.detail };
  }
  if (channel === "sms") {
    // Text from this org's own caller-ID number (falls back inside sendSms).
    const from = (await getOrgSettings().catch(() => null))?.callerId;
    const r = await sendSms(address, body, { from });
    return { status: r.status, provider: r.provider, id: r.id, detail: r.detail };
  }

  const social = getSocialChannel(channel);
  if (!social) {
    return { status: "failed", provider: channel, id: "", detail: `${channel} is not connected` };
  }
  const r = await social.send({ to: address, text: body });
  return { status: r.status, provider: r.platform, id: r.id, detail: r.detail };
}
