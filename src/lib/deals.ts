import { getProvider } from "@/lib/crm/registry";
import { safePipeline } from "@/lib/queries";
import { getOrgSettings } from "@/lib/org";
import { emitWebhook } from "@/lib/webhooks-out";
import type { Opportunity, Stage } from "@/lib/crm/types";

/**
 * Map a destination stage type to the webhook event a stage move emits.
 * Reaching a won/lost stage is the high-value signal integrators want.
 */
export function dealEvent(stageType: Stage["type"] | undefined): "deal.won" | "deal.lost" | "deal.stage_changed" {
  return stageType === "won" ? "deal.won" : stageType === "lost" ? "deal.lost" : "deal.stage_changed";
}

/**
 * Move a deal to a stage and emit the corresponding lifecycle webhook
 * (deal.won / deal.lost / deal.stage_changed). The single move path for both the
 * in-app board and the public API, so events fire exactly once wherever a deal
 * moves. The emit is best-effort and never affects the move.
 */
export interface NewDealInput {
  contactId: string;
  title?: string;
  value?: number;
  currency?: string;
  source?: string;
  stageId?: string;
}

export type CreateDealResult =
  | { ok: true; opp: Opportunity; stageLabel: string }
  | { ok: false; reason: "contact_not_found" | "no_stage" };

/**
 * Create an open deal for an EXISTING contact (the public POST /api/v1/deals).
 * Validates the contact + optional stage, defaults to the first open stage, and
 * emits deal.created. Returns a discriminated result so the route can map clean
 * 404 / 400 responses.
 */
export async function createDealRecord(input: NewDealInput): Promise<CreateDealResult> {
  const provider = getProvider();
  const contact = await provider.getContact(input.contactId);
  if (!contact) return { ok: false, reason: "contact_not_found" };

  const [pipelines, org] = await Promise.all([provider.listPipelines(), getOrgSettings()]);
  const pipeline = safePipeline(pipelines);
  let stage = input.stageId ? pipeline.stages.find((s) => s.id === input.stageId) : undefined;
  if (input.stageId && !stage) return { ok: false, reason: "no_stage" };
  if (!stage) stage = pipeline.stages.find((s) => s.type === "open") ?? pipeline.stages[0];
  if (!stage) return { ok: false, reason: "no_stage" };

  const opp = await provider.createOpportunity({
    title: input.title || (contact.company ? `${contact.company} — ${contact.name}` : contact.name),
    pipelineId: pipeline.id,
    stageId: stage.id,
    value: input.value ?? 0,
    currency: input.currency || org.currency,
    contactId: contact.id,
    source: input.source || "API",
  });
  await emitWebhook("deal.created", {
    dealId: opp.id,
    title: opp.title,
    value: opp.value,
    currency: opp.currency,
    contactId: opp.contactId,
    stage: stage.label,
  });
  return { ok: true, opp, stageLabel: stage.label };
}

export async function moveDeal(id: string, stageId: string): Promise<Opportunity> {
  const provider = getProvider();
  const opp = await provider.moveOpportunity(id, stageId);
  const pipelines = await provider.listPipelines();
  const stage = pipelines.flatMap((p) => p.stages).find((s) => s.id === stageId);
  await emitWebhook(dealEvent(stage?.type), {
    dealId: opp.id,
    title: opp.title,
    value: opp.value,
    currency: opp.currency,
    contactId: opp.contactId,
    stage: stage?.label ?? null,
    stageType: stage?.type ?? null,
  });
  return opp;
}
