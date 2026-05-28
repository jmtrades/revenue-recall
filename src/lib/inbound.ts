import { getProvider } from "@/lib/crm/registry";
import { getActiveVoice } from "@/lib/voice";
import { getOrgSettings } from "@/lib/org";
import { getIndustry } from "@/lib/industries";
import { draftReply } from "@/lib/ai/reply";
import { sendEmail, sendSms } from "@/lib/comms";
import { createOutboxItem } from "@/lib/agent/store";
import type { Contact, Opportunity } from "@/lib/crm/types";

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
  if (!contact) return { matched: false, action: "unmatched" };

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
  });

  // Auto-send or queue for approval.
  if (process.env.REPLY_AUTOPILOT === "true") {
    const to = channel === "email" ? contact.points.find((p) => p.channel === "email")?.value : contact.points.find((p) => p.channel === "phone")?.value;
    if (to) {
      const res = channel === "email" ? await sendEmail(to, reply.subject ?? "", reply.body) : await sendSms(to, reply.body);
      if (res.status !== "failed") {
        await provider.logActivity({
          opportunityId: deal?.id,
          contactId: contact.id,
          kind: channel,
          summary: reply.subject ? `${reply.subject}\n\n${reply.body}` : reply.body,
          direction: "outbound",
          occurredAt: new Date().toISOString(),
        });
        return { matched: true, contactId: contact.id, dealId: deal?.id, action: res.status === "sent" ? "sent" : "logged", source: reply.source };
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
  return { matched: true, contactId: contact.id, dealId: deal?.id, action: "queued", source: reply.source };
}
