/**
 * AI cost model — so the economics are visible and controllable. Token prices are
 * per the model family (USD per million tokens) and intentionally overridable via
 * env, since list prices change. Pure and tested; the usage ledger and budget cap
 * build on this to protect margins.
 */

export interface ModelPrice {
  /** USD per 1M input tokens. */
  inputPerM: number;
  /** USD per 1M output tokens. */
  outputPerM: number;
}

/** Representative list prices by family. Override with AI_PRICE_* env if needed. */
export const MODEL_PRICING: Record<"opus" | "sonnet" | "haiku", ModelPrice> = {
  opus: { inputPerM: 15, outputPerM: 75 },
  sonnet: { inputPerM: 3, outputPerM: 15 },
  haiku: { inputPerM: 0.8, outputPerM: 4 },
};

function envNum(name: string): number | undefined {
  const v = process.env[name];
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Resolve the price for a model id, honoring env overrides; defaults to opus (conservative). */
export function priceFor(model: string): ModelPrice {
  const family = /haiku/i.test(model) ? "haiku" : /sonnet/i.test(model) ? "sonnet" : "opus";
  const base = MODEL_PRICING[family];
  return {
    inputPerM: envNum(`AI_PRICE_${family.toUpperCase()}_IN`) ?? base.inputPerM,
    outputPerM: envNum(`AI_PRICE_${family.toUpperCase()}_OUT`) ?? base.outputPerM,
  };
}

/** Rough token estimate from text (~4 chars/token) for pre-call budgeting. */
export function estimateTokens(text: string): number {
  return Math.ceil((text?.length ?? 0) / 4);
}

/** Cost in USD for a completion given token counts. */
export function costOf(model: string, inputTokens: number, outputTokens: number): number {
  const p = priceFor(model);
  const cost = (Math.max(0, inputTokens) / 1_000_000) * p.inputPerM + (Math.max(0, outputTokens) / 1_000_000) * p.outputPerM;
  // Round to 6 dp — sub-cent precision matters when you're summing millions of calls.
  return Math.round(cost * 1_000_000) / 1_000_000;
}
