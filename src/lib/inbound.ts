import { getProvider } from "@/lib/crm/registry";
import { getActiveVoice } from "@/lib/voice";
import { getOrgSettings } from "@/lib/org";
import { getIndustry } from "@/lib/industries";
import { contactPreferredLanguage } from "@/lib/languages";
import { draftReply } from "@/lib/ai/reply";
import { detectIntent } from "@/lib/ai/intent";
import { unsubscribeUrl } from "@/lib/unsubscribe";
import { sendEmail, sendSms } from "@/lib/comms";
import { createOutboxItem } from "@/lib/agent/store";
import { fireSpeedToLead } from "@/lib/agent/speed-to-lead";
import { emitWebhook } from "@/lib/webhooks-out";
import { hasOptedOut, isHardOptOut } from "@/lib/agent/guardrails";
import { markDoNotContact } from "@/lib/opt-out";
import type { Activity, Contact, CrmProvider, Opportunity } from "@/lib/crm/types";

/** Notify the org's webhook that a lead replied (best-effort, never throws). */
async function emitMessageReceived(
  channel: "email" | "sms",
  from: string,
  body: string,
  subject: string | undefined,
  contactId: string,
  dealId: string | undefined,
  matched: boolean,
): Promise<void> {
  await emitWebhook("message.received", {
    contactId,
    dealId: dealId ?? null,
    channel,
    from,
    body: subject ? `${subject}\n\n${body}` : body,
    matched,
  });
}

function digits(s: string): string {
  return s.replace(/\D/g, "");
}

function matchContact(contacts: Contact[], channel: "email" | "sms", from: string): Contact | undefined {
  const f = from.trim().toLowerCase();
  const fd = digits(from);
  return contacts.find((c) =>
    c.points.some((p) => {
      if (channel === "email" && p.channel === "email") return p.value.trim().toLowerCase() === f;
      if (channel === "sms" && p.channel === "phone") return fd.length >= 7 && digits(p.value).endsWith(fd.slice(-10));
      return false;
    }),
  );
}

export interface InboundResult {
  matched: boolean;
  contactId?: string;
  dealId?: string;
  action: "queued" | "sent" | "logged" | "unmatched";
  source?: string;
  /** A callback/message was captured as a task so nothing is lost. */
  messageTaken?: boolean;
  /** What the inbound message was (so callers can route/report). */
  intent?: string;
}

/**
 * Take a message from an unknown sender (no matching contact). Like a good
 * receptionist: create the contact, log what they said, and raise a follow-up
 * task so it's never dropped. Best-effort — needs a writable provider.
 */
async function captureUnmatched(
  provider: CrmProvider,
  channel: "email" | "sms",
  from: string,
  body: string,
  subject?: string,
): Promise<InboundResult> {
  if (!provider.info().capabilities.write) return { matched: false, action: "unmatched" };
  const now = new Date().toISOString();
  const name = channel === "email" ? from.split("@")[0] || "New contact" : `Caller ${digits(from).slice(-4) || ""}`.trim();
  try {
    const optedOut = isHardOptOut(subject ? `${subject}\n\n${body}` : body);
    const contact = await provider.createContact({ name, points: [{ channel: channel === "email" ? "email" : "phone", value: from }] });
    await provider.logActivity({ contactId: contact.id, kind: channel, summary: subject ? `${subject}\n\n${body}` : body, direction: "inbound", occurredAt: now });
    await emitMessageReceived(channel, from, body, subject, contact.id, undefined, false);
    // If the very first message is an opt-out, record it but never start working
    // the lead (no follow-up task, no speed-to-lead outreach). Flag the contact
    // durably so the opt-out is honored even after this activity ages out.
    if (optedOut) {
      await markDoNotContact(provider, contact);
      return { matched: false, contactId: contact.id, action: "logged", messageTaken: false, intent: "optout" };
    }
    await provider.logActivity({ contactId: contact.id, kind: "task", summary: `New inbound from ${name} — follow up`, occurredAt: now });
    // Speed-to-lead: if the org runs new-lead autopilot, start working this fresh
    // lead immediately rather than waiting for the daily cron.
    await fireSpeedToLead(contact.id);
    return { matched: false, contactId: contact.id, action: "logged", messageTaken: true, intent: detectIntent(body) };
  } catch {
    return { matched: false, action: "unmatched" };
  }
}

/**
 * Handle an inbound email/SMS: match the contact, log it to the timeline, and
 * draft a human-voiced reply — queued to Approvals (default) or auto-sent when
 * REPLY_AUTOPILOT=true.
 */
export async function handleInbound(channel: "email" | "sms", from: string, body: string, subject?: string): Promise<InboundResult> {
  const provider = getProvider();
  const [contacts, opps] = await Promise.all([provider.listContacts(), provider.listOpportunities()]);
  const contact = matchContact(contacts, channel, from);
  if (!contact) return captureUnmatched(provider, channel, from, body, subject);

  const deal: Opportunity | undefined =
    opps.filter((o) => o.contactId === contact.id).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0];

  // Log the inbound message to the timeline.
  await provider.logActivity({
    opportunityId: deal?.id,
    contactId: contact.id,
    kind: channel,
    summary: subject ? `${subject}\n\n${body}` : body,
    direction: "inbound",
    occurredAt: new Date().toISOString(),
  });
  await emitMessageReceived(channel, from, body, subject, contact.id, deal?.id, true);

  // Honor opt-out before ANY automated reply (TCPA / CTIA / CAN-SPAM): if this
  // message is a hard opt-out ("STOP", "unsubscribe", …) or the contact already
  // opted out, never auto-send or even queue a reply. The inbound message is
  // logged above, so future cron/approvals already suppress this contact.
  const incoming = subject ? `${subject}\n\n${body}` : body;
  let priorActs: Activity[] = [];
  try {
    if (provider.listActivitiesByContact) priorActs = await provider.listActivitiesByContact(contact.id);
    else if (deal) priorActs = await provider.listActivities(deal.id);
  } catch {
    /* best-effort — fall back to the current message's own opt-out check */
  }
  const optedOutNow = isHardOptOut(incoming);
  if (optedOutNow || hasOptedOut(contact, deal, priorActs)) {
    // On a FRESH opt-out, persist the flag so it's honored permanently — the
    // logged activity alone could later fall outside the recent-activity window.
    if (optedOutNow) await markDoNotContact(provider, contact);
    return { matched: true, contactId: contact.id, dealId: deal?.id, action: "logged", messageTaken: false, intent: "optout" };
  }

  // If they're unavailable / it's a gatekeeper, take a message: capture a
  // callback task so the follow-up is never lost (and still reply below).
  const intent = detectIntent(body);
  let messageTaken = false;
  if (intent === "busy" || intent === "gatekeeper") {
    await provider.logActivity({
      opportunityId: deal?.id,
      contactId: contact.id,
      kind: "task",
      summary: `Message taken — call ${contact.name} back about ${deal?.title ?? "their enquiry"}`,
      occurredAt: new Date().toISOString(),
    });
    messageTaken = true;
  }

  const [voice, org] = await Promise.all([getActiveVoice(), getOrgSettings()]);
  const industry = getIndustry(org.industryId);
  const history = deal ? (await provider.listActivities(deal.id)).map((a) => `${a.direction ?? "out"} ${a.kind}: ${a.summary}`) : [];
  const reply = await draftReply({
    channel,
    contactName: contact.name,
    company: contact.company,
    dealTitle: deal?.title ?? `${contact.name}`,
    industryLabel: industry.label,
    industryId: industry.id,
    incoming: body,
    history,
    voice,
    language: contactPreferredLanguage(contact.attributes, org.language),
  });

  // Auto-send or queue for approval.
  if (process.env.REPLY_AUTOPILOT === "true") {
    const to = channel === "email" ? contact.points.find((p) => p.channel === "email")?.value : contact.points.find((p) => p.channel === "phone")?.value;
    if (to) {
      const res = channel === "email" ? await sendEmail(to, reply.subject ?? "", reply.body, { unsubscribeUrl: unsubscribeUrl(contact.id), compliance: { orgName: org.compliance.senderName ?? org.name, address: org.compliance.address } }) : await sendSms(to, reply.body, { from: org.callerId });
      if (res.status !== "failed") {
        await provider.logActivity({
          opportunityId: deal?.id,
          contactId: contact.id,
          kind: channel,
          summary: reply.subject ? `${reply.subject}\n\n${reply.body}` : reply.body,
          direction: "outbound",
          occurredAt: new Date().toISOString(),
        });
        return { matched: true, contactId: contact.id, dealId: deal?.id, action: res.status === "sent" ? "sent" : "logged", source: reply.source, messageTaken, intent };
      }
    }
  }

  await createOutboxItem({
    dealId: deal?.id,
    contactId: contact.id,
    channel,
    subject: reply.subject,
    body: reply.body,
    source: reply.source,
  });
  return { matched: true, contactId: contact.id, dealId: deal?.id, action: "queued", source: reply.source, messageTaken, intent };
}
