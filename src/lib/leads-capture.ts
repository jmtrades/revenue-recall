import { getProvider } from "@/lib/crm/registry";
import { safePipeline } from "@/lib/queries";
import { getOrgSettings } from "@/lib/org";
import { enroll } from "@/lib/cadence";
import type { ContactPoint } from "@/lib/crm/types";

/**
 * Shared lead-capture: turn an inbound lead into a contact + open opportunity the
 * autonomous engine immediately works. Used by the Lead Capture API
 * (POST /api/v1/leads) and the hosted/embeddable web form. Runs in the CURRENT
 * org scope — the caller must already be inside runWithOrg (webhook/token path)
 * or an authenticated request.
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
}

export async function captureLead(lead: LeadInput): Promise<CaptureResult> {
  const provider = getProvider();
  const [pipelines, org] = await Promise.all([provider.listPipelines(), getOrgSettings()]);
  const pipeline = safePipeline(pipelines);
  const stage = pipeline.stages.find((s) => s.type === "open") ?? pipeline.stages[0];
  if (!stage) throw new Error("No pipeline stage available");

  const points: ContactPoint[] = [];
  if (lead.email) points.push({ channel: "email", value: lead.email });
  if (lead.phone) points.push({ channel: "phone", value: lead.phone });

  const contact = await provider.createContact({ name: lead.name, company: lead.company, title: lead.title, points });

  const opp = await provider.createOpportunity({
    title: lead.dealTitle || (lead.company ? `${lead.company} — ${lead.name}` : lead.name),
    pipelineId: pipeline.id,
    stageId: stage.id,
    value: lead.value ?? 0,
    currency: org.currency,
    contactId: contact.id,
    source: lead.source || "API",
  });

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

  return { contactId: contact.id, dealId: opp.id, enrolled };
}
