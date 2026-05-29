import { getSubscription } from "@/lib/billing/store";
import { entitlements, type Entitlements } from "@/lib/billing/entitlements";

/**
 * Optional hard gating. Off by default (BILLING_ENFORCE !== "true") so the demo
 * and trials are unrestricted; turn it on to actually enforce plan limits. The
 * gates are designed to never hard-break — a non-entitled org still drafts and
 * queues to Approvals, it just can't auto-send. That's the free → paid boundary.
 */

export function enforcementOn(): boolean {
  return process.env.BILLING_ENFORCE === "true";
}

export async function orgEntitlements(): Promise<Entitlements> {
  const sub = await getSubscription();
  return entitlements(sub.plan);
}

/** When enforcing, is this boolean feature available to the current org? When
 *  not enforcing, everything is available. */
export async function isEntitled(feature: "aiLive" | "autopilot" | "integrations"): Promise<boolean> {
  if (!enforcementOn()) return true;
  return (await orgEntitlements())[feature];
}
