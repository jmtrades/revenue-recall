import type { SubStatus } from "@/lib/billing/store";

/**
 * Can this subscription state start a (card-required) free trial? Only when
 * there's no live subscription — so we auto-open trial checkout for a brand-new
 * or churned account, but never re-prompt a customer who's already trialing,
 * active, or past_due.
 */
export function canStartTrial(status: SubStatus): boolean {
  return status === "none" || status === "canceled";
}
