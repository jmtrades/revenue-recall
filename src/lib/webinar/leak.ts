/**
 * Money walking out of a webinar. No-shows are valued at the same close rate
 * as the people who stayed. The inputs are the operator's own numbers.
 */
export interface LeakInput {
  registrants: number;
  showRate: number;
  offerPrice: number;
  closeRate: number;
}

export interface LeakResult {
  showed: number;
  missed: number;
  leaked: number;
}

export function webinarLeak(input: LeakInput): LeakResult | null {
  const { registrants, showRate, offerPrice, closeRate } = input;
  if (![registrants, showRate, offerPrice, closeRate].every((n) => Number.isFinite(n))) return null;
  if (registrants < 0 || offerPrice < 0) return null;
  if (showRate < 0 || showRate > 1 || closeRate < 0 || closeRate > 1) return null;
  const showed = registrants * showRate;
  const missed = registrants - showed;
  const leaked = missed * closeRate * offerPrice;
  return { showed, missed, leaked };
}
