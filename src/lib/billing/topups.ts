/**
 * Usage top-ups: one-time "action packs" a customer buys when they're burning
 * through their monthly pool — so a campaign never stalls mid-flight. Pure data
 * (safe to import on the client); Stripe price ids resolve from env server-side,
 * so a pack is purchasable only once you've wired its price.
 */

export type TopupUnit = "messages" | "minutes";

export interface TopupPack {
  id: string;
  /** Units granted for the current billing month — AI messages or talk minutes,
   *  per `unit`. (Named `actions` for historical reasons; it's a unit count.) */
  actions: number;
  /** What the pack grants. Messages feed the AI-action pool; minutes feed the
   *  voice meter. */
  unit: TopupUnit;
  label: string;
  /** Env var holding the Stripe one-time price id. */
  priceEnv: string;
  /** Suggested USD price (display only; the real charge is the Stripe price). */
  suggestedUsd: number;
  blurb: string;
  featured?: boolean;
}

export const TOPUP_PACKS: TopupPack[] = [
  { id: "1k", unit: "messages", actions: 1000, label: "1,000 messages", priceEnv: "STRIPE_PRICE_TOPUP_1K", suggestedUsd: 29, blurb: "A boost for a busy week." },
  { id: "5k", unit: "messages", actions: 5000, label: "5,000 messages", priceEnv: "STRIPE_PRICE_TOPUP_5K", suggestedUsd: 99, blurb: "A full extra month of volume.", featured: true },
  { id: "25k", unit: "messages", actions: 25000, label: "25,000 messages", priceEnv: "STRIPE_PRICE_TOPUP_25K", suggestedUsd: 399, blurb: "Best value per message — power a big push." },
  // Minute packs: overage priced between our worst-case COGS (~$0.085/min on
  // the premium path) and competitors' $0.13–0.40/min — a hot streak never
  // stalls, and every pack clears a healthy margin even at full burn.
  { id: "m300", unit: "minutes", actions: 300, label: "300 talk minutes", priceEnv: "STRIPE_PRICE_TOPUP_M300", suggestedUsd: 59, blurb: "≈450 extra dials — covers a heater week." },
  { id: "m1000", unit: "minutes", actions: 1000, label: "1,000 talk minutes", priceEnv: "STRIPE_PRICE_TOPUP_M1000", suggestedUsd: 159, blurb: "≈1,500 extra dials at a volume rate.", featured: true },
  { id: "m3000", unit: "minutes", actions: 3000, label: "3,000 talk minutes", priceEnv: "STRIPE_PRICE_TOPUP_M3000", suggestedUsd: 469, blurb: "Best per-minute rate — a second desk for the month." },
];

export function topupPacksFor(unit: TopupUnit): TopupPack[] {
  return TOPUP_PACKS.filter((p) => p.unit === unit);
}

export function getTopupPack(id: string): TopupPack | undefined {
  return TOPUP_PACKS.find((p) => p.id === id);
}

/** Effective price per message, in cents (1 decimal) — so customers see the
 *  per-message economics (and the volume discount on the bigger packs). */
export function perMessageCents(suggestedUsd: number, actions: number): number {
  if (actions <= 0) return 0;
  return Math.round(((suggestedUsd * 100) / actions) * 10) / 10;
}

export function centsPerMessage(pack: TopupPack): number {
  return perMessageCents(pack.suggestedUsd, pack.actions);
}
