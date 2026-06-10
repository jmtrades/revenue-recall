import { createManualTask } from "@/lib/tasks/manual";
import { getOrgSettings } from "@/lib/org";
import { isAutomationEnabled } from "@/lib/automations";
import { runCustomDealAutomations } from "@/lib/automations/run-custom";
import type { Opportunity, Stage } from "@/lib/crm/types";

/**
 * Deal-lifecycle automations. When a deal is moved, fire the org's enabled
 * automations for that transition by creating the relevant follow-up tasks so
 * the win/loss/handoff actually drives next steps instead of the toggle being
 * inert.
 *
 * Deliberately SAFE, internal actions (tasks a rep then works) — never an
 * autonomous customer-facing send; those stay behind the approval/autopilot
 * flow. Best-effort and never throws: a stage move must succeed even if task
 * creation hiccups (no DB, RLS, transient error).
 */
function inDays(n: number): string {
  return new Date(Date.now() + n * 86_400_000).toISOString();
}

export async function fireDealStageAutomations(opp: Opportunity, stage: Stage | undefined): Promise<void> {
  if (!stage) return;
  try {
    const org = await getOrgSettings().catch(() => null);
    const overrides = org?.automations;
    const deal = (opp.title || "this deal").slice(0, 120);

    // Org-authored custom rules run alongside the presets (each gated by its own
    // enabled flag). Best-effort and isolated — never blocks the move.
    await runCustomDealAutomations(opp, stage);

    if (stage.type === "won" && isAutomationEnabled("won_onboarding", overrides)) {
      await createManualTask(`Welcome & kick off — ${deal}`).catch(() => {});
      await createManualTask(`Schedule a 30-day check-in — ${deal}`, inDays(30)).catch(() => {});
      await createManualTask(`Ask for a referral or review — ${deal}`, inDays(14)).catch(() => {});
      return;
    }
    if (stage.type === "lost" && isAutomationEnabled("lost_winback", overrides)) {
      await createManualTask(`Win-back follow-up — ${deal}`, inDays(90)).catch(() => {});
      return;
    }
    if (stage.type === "open" && isAutomationEnabled("stage_handoff", overrides)) {
      await createManualTask(`Next step for ${deal} — now in ${stage.label}`).catch(() => {});
    }
  } catch {
    /* never block a stage move */
  }
}
