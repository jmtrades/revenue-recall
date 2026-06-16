import Anthropic from "@anthropic-ai/sdk";
import { costOf } from "@/lib/ai/cost";
import { recordUsage, budgetFraction, isWithinActionAllowance } from "@/lib/ai/usage";
import { enforcementOn } from "@/lib/billing/enforce";

/**
 * Anthropic client factory. Returns null when no API key is configured, so the
 * AI features transparently fall back to deterministic templates and the app
 * runs with zero setup. Wire ANTHROPIC_API_KEY at launch to switch to live AI.
 */

let cached: Anthropic | null = null;

export function getAnthropic(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  if (!cached) cached = new Anthropic({ apiKey: key });
  return cached;
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Default to the most capable model; operators may pin a faster one via env. */
export function aiModel(): string {
  return process.env.ANTHROPIC_MODEL ?? "claude-opus-4-8";
}

/** The model for high-volume, lower-stakes drafting (cold re-engagement nudges).
 *  Defaults to Sonnet 4.6 — a large quality step over Haiku for cold copy that
 *  still reads human, at a fraction of Opus's cost so margin holds on volume.
 *  Operators can pin a cheaper one (ANTHROPIC_MODEL_CHEAP=claude-haiku-4-5) for
 *  pure scale, or let warm/high-value drafts and replies keep the premium model. */
export function aiCheapModel(): string {
  return process.env.ANTHROPIC_MODEL_CHEAP ?? "claude-sonnet-4-6";
}

export type EffortLevel = "low" | "medium" | "high" | "xhigh" | "max";
const EFFORT_ORDER: readonly EffortLevel[] = ["low", "medium", "high", "xhigh", "max"];
const EFFORTS: ReadonlySet<string> = new Set(EFFORT_ORDER);

/** The higher of two effort levels (so a floor can raise, never lower). */
export function maxEffort(a?: EffortLevel, b?: EffortLevel): EffortLevel | undefined {
  if (!a) return b;
  if (!b) return a;
  return EFFORT_ORDER.indexOf(a) >= EFFORT_ORDER.indexOf(b) ? a : b;
}

/** The lower of two effort levels — used to clamp a request under a ceiling. */
export function minEffort(a?: EffortLevel, b?: EffortLevel): EffortLevel | undefined {
  if (!a) return b;
  if (!b) return a;
  return EFFORT_ORDER.indexOf(a) <= EFFORT_ORDER.indexOf(b) ? a : b;
}

/**
 * Budget-aware effort ceiling: as monthly spend approaches the cap, glide effort
 * down (max→high→medium→low) instead of falling off a cliff to templates at
 * 100%. Returns the highest effort allowed at the given spend fraction, or
 * undefined for no ceiling (plenty of headroom / unlimited budget).
 */
export function effortCeiling(spentFraction: number): EffortLevel | undefined {
  if (spentFraction >= 0.97) return "low";
  if (spentFraction >= 0.9) return "medium";
  if (spentFraction >= 0.75) return "high";
  return undefined;
}

/**
 * Org-wide effort floor from ANTHROPIC_EFFORT (low|medium|high|xhigh|max).
 * Controls thinking depth + token spend on Opus 4.6+. Unset = let each call
 * decide. NOTE: higher effort = more thinking tokens = more cost; with a
 * monthly budget cap configured, a blanket "xhigh" can exhaust it quickly and
 * force the template fallback — prefer per-call effort for intelligence-heavy
 * work and leave short drafts at the default.
 */
export function aiEffort(): EffortLevel | undefined {
  const v = process.env.ANTHROPIC_EFFORT;
  return v && EFFORTS.has(v) ? (v as EffortLevel) : undefined;
}

export interface CompletionShape {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
  think?: boolean;
  effort?: EffortLevel;
  /** Override the model for this call (e.g. aiCheapModel() for cold nudges). */
  model?: string;
}

/**
 * Build the Messages API params for a structured-output completion. Shared by
 * the synchronous path (`completeJson`) and the Batches path so both send the
 * identical model/effort/thinking/schema config. `spent` is the monthly-budget
 * fraction used to clamp effort under the cap.
 */
export function buildMessageParams(opts: CompletionShape & { spent?: number }): Record<string, unknown> {
  // Built untyped: output_config / adaptive thinking are current API fields
  // that may post-date the installed SDK's static types.
  const params: Record<string, unknown> = {
    model: opts.model ?? aiModel(),
    max_tokens: opts.maxTokens ?? 1500,
    system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: opts.user }],
    output_config: { format: { type: "json_schema", schema: opts.schema } },
  };
  // NB: temperature/top_p/top_k are intentionally NOT sent — Opus 4.7/4.8 reject
  // sampling params with a 400. Steer variation via the prompt instead.
  // ANTHROPIC_EFFORT raises (never lowers) the per-call effort; the budget
  // ceiling then clamps it down as monthly spend nears the cap.
  let effort = maxEffort(opts.effort, aiEffort());
  const ceiling = effortCeiling(opts.spent ?? 0);
  if (effort && ceiling) effort = minEffort(effort, ceiling);
  if (opts.think || effort) {
    params.thinking = { type: "adaptive" };
    (params.output_config as Record<string, unknown>).effort = effort ?? "medium";
  }
  return params;
}

/**
 * Run a structured-output completion and return the parsed JSON object.
 *
 * The system block carries `cache_control`, but note: prompt caching only
 * engages once the cached prefix clears the model's minimum (~4096 tokens on
 * Opus). Our system prompts are all well under that (~100–650 tokens), so the
 * marker is currently INERT — no cache write/read, no premium, no savings. It's
 * kept as harmless forward-compat (auto-engages if a prompt grows past the
 * floor). The real cost levers here are model choice and `effort`, not caching.
 * Per-request context belongs in the user message.
 */
export async function completeJson<T>(opts: {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
  /** @deprecated Sampling params (temperature/top_p/top_k) are removed on Opus
   *  4.7/4.8 and return a 400 — this is accepted but no longer sent. Variation
   *  is now steered by the prompt (e.g. the per-variant "open differently"
   *  directive in the draft prompt). */
  temperature?: number;
  /** Enable adaptive thinking (Claude decides depth). Pairs with `effort`. */
  think?: boolean;
  /** Thinking depth + token spend for this call. Defaults to the ANTHROPIC_EFFORT
   *  floor, then "medium" when thinking is on. Use "xhigh"/"max" only for
   *  intelligence-heavy calls — they cost materially more. */
  effort?: EffortLevel;
  /** Override the model for this call (e.g. aiCheapModel() for cold nudges). */
  model?: string;
  /** Label for usage/cost attribution (e.g. "draft", "reply", "brief"). */
  feature?: string;
}): Promise<T> {
  const client = getAnthropic();
  if (!client) throw new Error("AI not configured");

  // Margin guard: at 100% of the monthly budget, stop spending (caller falls
  // back to templates). Below that, we glide effort down as the cap nears
  // (see effortCeiling) rather than dropping off a cliff.
  const spent = await budgetFraction();
  if (spent >= 1) throw new Error("AI monthly budget reached");

  // Plan action allowance (monetization). Gates whenever enforcement is on
  // (auto-on once Stripe is connected), so a paid org can't run unlimited live
  // AI past the pool it bought. Over the monthly pool (+ purchased top-ups) →
  // caller falls back to templates, nudging a top-up. Open demo stays unlimited.
  if (enforcementOn() && !(await isWithinActionAllowance())) {
    throw new Error("AI action allowance reached");
  }

  const params = buildMessageParams({ ...opts, spent });
  const res = await client.messages.create(params as any);

  // Meter the call (best-effort) so cost is tracked and the budget cap works.
  const usage = (res as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
  const inTok = usage?.input_tokens ?? 0;
  const outTok = usage?.output_tokens ?? 0;
  // Attribute cost to the model ACTUALLY used (cheap model on cold nudges), so the
  // budget/margin reflect the real spend, not the premium default.
  const usedModel = opts.model ?? aiModel();
  void recordUsage({ model: usedModel, inputTokens: inTok, outputTokens: outTok, costUsd: costOf(usedModel, inTok, outTok), feature: opts.feature });

  // With adaptive thinking + high effort, responses are larger and likelier to
  // hit the cap or refuse — give the caller a precise reason instead of an
  // opaque JSON.parse throw, so the template fallback is an informed decision.
  const stop = (res as { stop_reason?: string }).stop_reason;
  if (stop === "refusal") throw new Error("AI declined to answer (refusal)");

  const block = res.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!block) {
    throw new Error(stop === "max_tokens" ? `AI response truncated before any text (raise maxTokens above ${opts.maxTokens ?? 1500})` : "No content returned");
  }
  try {
    return JSON.parse(block.text) as T;
  } catch {
    throw new Error(stop === "max_tokens" ? `AI response truncated mid-JSON (raise maxTokens above ${opts.maxTokens ?? 1500})` : "AI returned malformed JSON");
  }
}
