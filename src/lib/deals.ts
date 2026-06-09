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
    // One currency per workspace: every deal uses the org's currency so reports
    // (pipeline value, forecast, recovered revenue) never sum mixed currencies
    // into a meaningless total. A client-supplied currency is ignored.
    currency: org.currency,
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

export type DeleteDealResult = { ok: true } | { ok: false; reason: "unsupported" | "not_found" };

/**
 * Permanently delete a deal (junk/duplicate cleanup so the pipeline + forecast
 * aren't skewed). Returns a discriminated result: providers that can't delete
 * here (read-only / external CRMs) report "unsupported" so the route can answer
 * 409. Emits deal.deleted (best-effort) for integrators keeping a mirror.
 */
export async function deleteDeal(id: string): Promise<DeleteDealResult> {
  const provider = getProvider();
  if (!provider.deleteOpportunity) return { ok: false, reason: "unsupported" };
  const opp = await provider.getOpportunity(id);
  if (!opp) return { ok: false, reason: "not_found" };
  await provider.deleteOpportunity(id);
  await emitWebhook("deal.deleted", {
    dealId: opp.id,
    title: opp.title,
    value: opp.value,
    currency: opp.currency,
    contactId: opp.contactId,
  });
  return { ok: true };
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
