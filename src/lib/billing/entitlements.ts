import type { PlanId } from "@/lib/billing/plans";
import type { SubStatus } from "@/lib/billing/store";

/**
 * Monetization layer: what each plan unlocks, and whether a subscription is in
 * good standing. Pure and tested. Gating stays gentle by design — these helpers
 * let the UI nudge an upgrade and (optionally) cap usage without hard-breaking a
 * trial or the demo.
 */

export interface Entitlements {
  /** Max billable seats (Infinity = unlimited). */
  seats: number;
  /** Max pipelines. */
  pipelines: number;
  /** Live AI drafting (vs. template fallback) is included in the plan. */
  aiLive: boolean;
  /** Autonomous Autopilot sending is included. */
  autopilot: boolean;
  /** Connect external CRMs / providers. */
  integrations: boolean;
}

export const PLAN_LIMITS: Record<PlanId, Entitlements> = {
  free: { seats: 1, pipelines: 1, aiLive: false, autopilot: false, integrations: false },
  growth: { seats: 1, pipelines: Infinity, aiLive: true, autopilot: true, integrations: true },
  team: { seats: 5, pipelines: Infinity, aiLive: true, autopilot: true, integrations: true },
  scale: { seats: Infinity, pipelines: Infinity, aiLive: true, autopilot: true, integrations: true },
};

export function entitlements(plan: PlanId): Entitlements {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;
}

export type Standing = "active" | "trial" | "free" | "action_needed";

export interface StandingInfo {
  standing: Standing;
  /** Should we surface a billing prompt? */
  prompt: boolean;
  /** Urgent (payment problem) vs. a soft upgrade nudge. */
  urgent: boolean;
  message: string;
  cta: string;
}

/** Human-readable account standing from a subscription's plan + status. */
export function subscriptionStanding(plan: PlanId, status: SubStatus): StandingInfo {
  if (status === "past_due") {
    return { standing: "action_needed", prompt: true, urgent: true, message: "Your last payment didn't go through — update your billing to keep things running.", cta: "Fix billing" };
  }
  if (status === "canceled") {
    return { standing: "action_needed", prompt: true, urgent: true, message: "Your subscription was canceled. Reactivate to keep sending and using live AI.", cta: "Reactivate" };
  }
  if (status === "trialing") {
    return { standing: "trial", prompt: true, urgent: false, message: "You're on a trial — add a plan anytime to keep full access when it ends.", cta: "Choose a plan" };
  }
  if (status === "active" && plan !== "free") {
    return { standing: "active", prompt: false, urgent: false, message: "", cta: "" };
  }
  // free plan / no subscription
  return { standing: "free", prompt: true, urgent: false, message: "You're on the free plan. Upgrade for live AI, autopilot, and connected CRMs.", cta: "Upgrade" };
}
