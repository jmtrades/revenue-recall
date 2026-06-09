import { resolveProvider } from "@/lib/crm/registry";
import { safePipeline } from "@/lib/queries";
import { getOrgSettings } from "@/lib/org";
import { enroll } from "@/lib/cadence";
import { emitWebhook } from "@/lib/webhooks-out";
import type { Contact, ContactPoint, Opportunity } from "@/lib/crm/types";

/**
 * Shared lead-capture: turn an inbound lead into a contact + open opportunity the
 * autonomous engine immediately works. Used by the Lead Capture API
 * (POST /api/v1/leads) and the hosted/embeddable web form. Runs in the CURRENT
 * org scope — the caller must already be inside runWithOrg (webhook/token path)
 * or an authenticated request.
 *
 * De-duplicates: a repeat submission (same email/phone) reuses the existing
 * contact and any open deal rather than creating duplicate people, duplicate
 * pipeline, and a second round of outreach.
 */

export interface LeadInput {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  title?: string;
  value?: number;
  source?: string;
  notes?: string;
  dealTitle?: string;
  sequenceId?: string;
}

export interface CaptureResult {
  contactId: string;
  dealId: string;
  enrolled: boolean;
  /** True when we matched an existing contact + open deal instead of creating new. */
  deduped: boolean;
}

const normEmail = (s?: string) => (s ?? "").trim().toLowerCase();
const digitsOf = (s?: string) => (s ?? "").replace(/\D/g, "");

/** Find an existing contact by email or phone, or undefined.
 *  Email match is exact (normalized). Phone match requires BOTH numbers to have
 *  ≥10 digits with an equal last-10 — short/partial numbers are NOT matched, so
 *  two different people can't be merged on a shared 7–9 digit suffix. */
export function matchExistingContact(contacts: Contact[], email?: string, phone?: string): Contact | undefined {
  const e = normEmail(email);
  const ph = digitsOf(phone);
  const phoneMatchable = ph.length >= 10;
  if (!e && !phoneMatchable) return undefined;
  return contacts.find((c) =>
    c.points.some((p) => {
      if (e && p.channel === "email" && normEmail(p.value) === e) return true;
      if (phoneMatchable && (p.channel === "phone" || p.channel === "sms")) {
        const s = digitsOf(p.value);
        return s.length >= 10 && s.slice(-10) === ph.slice(-10);
      }
      return false;
    }),
  );
}

export async function captureLead(lead: LeadInput): Promise<CaptureResult> {
  const provider = (await resolveProvider());
  const [pipelines, org, contacts] = await Promise.all([provider.listPipelines(), getOrgSettings(), provider.listContacts()]);
  const pipeline = safePipeline(pipelines);
  const stage = pipeline.stages.find((s) => s.type === "open") ?? pipeline.stages[0];
  if (!stage) throw new Error("No pipeline stage available");
  const stageById = new Map(pipelines.flatMap((p) => p.stages).map((s) => [s.id, s]));

  // Reuse an existing contact when the email/phone already exists.
  const existing = matchExistingContact(contacts, lead.email, lead.phone);
  let contact: Contact;
  let newContact = false;
  if (existing) {
    contact = existing;
    // Backfill company/title we didn't have before (best-effort, never destructive).
    if (provider.updateContact && ((lead.company && !existing.company) || (lead.title && !existing.title))) {
      contact = await provider
        .updateContact(existing.id, { company: existing.company ?? lead.company, title: existing.title ?? lead.title })
        .catch(() => existing);
    }
  } else {
    const points: ContactPoint[] = [];
    if (lead.email) points.push({ channel: "email", value: lead.email });
    if (lead.phone) points.push({ channel: "phone", value: lead.phone });
    contact = await provider.createContact({ name: lead.name, company: lead.company, title: lead.title, points });
    newContact = true;
  }

  // Reuse an existing OPEN deal for this contact; only open a new one if none.
  let opp: Opportunity | undefined;
  let newDeal = false;
  if (!newContact) {
    const opps = await provider.listOpportunities();
    opp = opps.find((o) => o.contactId === contact.id && stageById.get(o.stageId)?.type === "open");
  }
  if (!opp) {
    opp = await provider.createOpportunity({
      title: lead.dealTitle || (lead.company ? `${lead.company} — ${lead.name}` : lead.name),
      pipelineId: pipeline.id,
      stageId: stage.id,
      value: lead.value ?? 0,
      currency: org.currency,
      contactId: contact.id,
      source: lead.source || "API",
    });
    newDeal = true;
  }

  if (lead.notes) {
    await provider
      .logActivity({
        contactId: contact.id,
        opportunityId: opp.id,
        kind: "note",
        summary: lead.notes,
        direction: "inbound",
        occurredAt: new Date().toISOString(),
      })
      .catch(() => undefined); // a note failure must not fail the capture
  }

  let enrolled = false;
  if (lead.sequenceId) {
    // Best-effort: a bad sequence id shouldn't reject an otherwise-good lead.
    const res = await enroll(lead.sequenceId, `deal:${opp.id}`).catch(() => null);
    enrolled = Boolean(res && res.enrolled > 0);
  }

  // Notify the org's webhook — but only when something NEW was created, so a
  // repeat submission doesn't re-fire lead.created. Best-effort; never blocks.
  if (newContact || newDeal) {
    await emitWebhook("lead.created", {
      contactId: contact.id,
      dealId: opp.id,
      name: lead.name,
      email: lead.email ?? null,
      phone: lead.phone ?? null,
      company: lead.company ?? null,
      value: lead.value ?? 0,
      source: lead.source || "API",
    });
  }

  return { contactId: contact.id, dealId: opp.id, enrolled, deduped: !newContact && !newDeal };
}
