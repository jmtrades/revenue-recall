import { getSubscription } from "@/lib/billing/store";
import { entitlements, effectivePlan, effectiveSeats, type Entitlements } from "@/lib/billing/entitlements";
import { billingConfigured } from "@/lib/billing/stripe";

/**
 * Plan-limit gating (the free → paid boundary). Margin-safe by default: the
 * moment real billing (Stripe) is connected, limits are ENFORCED automatically,
 * so usage is tied to what customers pay for — no unlimited live AI bleeding
 * money. With no Stripe (demo/trial) it stays open. An explicit BILLING_ENFORCE
 * always wins (`true`/`false`). Gates never hard-break — an unentitled org still
 * drafts to Approvals and falls back to free templates, it just can't spend on
 * live AI or auto-send.
 */
export function enforcementOn(): boolean {
  const v = process.env.BILLING_ENFORCE;
  if (v === "true") return true;
  if (v === "false") return false;
  return billingConfigured();
}

export async function orgEntitlements(): Promise<Entitlements> {
  const sub = await getSubscription();
  // Gate on standing: a past_due/canceled org drops to free entitlements.
  const plan = effectivePlan(sub.plan, sub.status);
  // …but honor the seats they actually paid for on a per-seat plan (Stripe
  // quantity = seats), so a customer billed for 5 reps can invite 5.
  return { ...entitlements(plan), seats: effectiveSeats(plan, sub.seats) };
}

/** When enforcing, is this boolean feature available to the current org? When
 *  not enforcing, everything is available. */
export async function isEntitled(feature: "aiLive" | "autopilot" | "integrations"): Promise<boolean> {
  if (!enforcementOn()) return true;
  return (await orgEntitlements())[feature];
}
