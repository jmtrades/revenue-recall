/**
 * Usage top-ups: one-time "action packs" a customer buys when they're burning
 * through their monthly pool — so a campaign never stalls mid-flight. Pure data
 * (safe to import on the client); Stripe price ids resolve from env server-side,
 * so a pack is purchasable only once you've wired its price.
 */

export interface TopupPack {
  id: string;
  /** Extra live-AI actions granted for the current billing month. */
  actions: number;
  label: string;
  /** Env var holding the Stripe one-time price id. */
  priceEnv: string;
  /** Suggested USD price (display only; the real charge is the Stripe price). */
  suggestedUsd: number;
  blurb: string;
  featured?: boolean;
}

export const TOPUP_PACKS: TopupPack[] = [
  { id: "1k", actions: 1000, label: "1,000 actions", priceEnv: "STRIPE_PRICE_TOPUP_1K", suggestedUsd: 29, blurb: "A boost for a busy week." },
  { id: "5k", actions: 5000, label: "5,000 actions", priceEnv: "STRIPE_PRICE_TOPUP_5K", suggestedUsd: 99, blurb: "A full extra month of volume.", featured: true },
  { id: "25k", actions: 25000, label: "25,000 actions", priceEnv: "STRIPE_PRICE_TOPUP_25K", suggestedUsd: 399, blurb: "Best value per action — power a big push." },
];

export function getTopupPack(id: string): TopupPack | undefined {
  return TOPUP_PACKS.find((p) => p.id === id);
}
