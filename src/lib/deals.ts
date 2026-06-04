import { getProvider } from "@/lib/crm/registry";
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
