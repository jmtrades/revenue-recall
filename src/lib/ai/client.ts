import Anthropic from "@anthropic-ai/sdk";
import { costOf } from "@/lib/ai/cost";
import { recordUsage, isWithinBudget } from "@/lib/ai/usage";

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

export type EffortLevel = "low" | "medium" | "high" | "xhigh" | "max";
const EFFORTS: ReadonlySet<string> = new Set(["low", "medium", "high", "xhigh", "max"]);

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

/**
 * Run a structured-output completion and return the parsed JSON object.
 * The system prompt is marked cacheable (stable across calls); per-request
 * context belongs in the user message.
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
  /** Label for usage/cost attribution (e.g. "draft", "reply", "brief"). */
  feature?: string;
}): Promise<T> {
  const client = getAnthropic();
  if (!client) throw new Error("AI not configured");

  // Margin guard: if the org has hit its monthly AI budget, stop spending — the
  // caller catches this and falls back to the free template path.
  if (!(await isWithinBudget())) throw new Error("AI monthly budget reached");

  // Built untyped: output_config / adaptive thinking are current API fields
  // that may post-date the installed SDK's static types.
  const params: Record<string, unknown> = {
    model: aiModel(),
    max_tokens: opts.maxTokens ?? 1500,
    system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: opts.user }],
    output_config: { format: { type: "json_schema", schema: opts.schema } },
  };
  // NB: temperature/top_p/top_k are intentionally NOT sent — Opus 4.7/4.8 reject
  // sampling params with a 400. Steer variation via the prompt instead.
  const effort = opts.effort ?? aiEffort();
  if (opts.think || effort) {
    params.thinking = { type: "adaptive" };
    (params.output_config as Record<string, unknown>).effort = effort ?? "medium";
  }

  const res = await client.messages.create(params as any);

  // Meter the call (best-effort) so cost is tracked and the budget cap works.
  const usage = (res as { usage?: { input_tokens?: number; output_tokens?: number } }).usage;
  const inTok = usage?.input_tokens ?? 0;
  const outTok = usage?.output_tokens ?? 0;
  void recordUsage({ model: aiModel(), inputTokens: inTok, outputTokens: outTok, costUsd: costOf(aiModel(), inTok, outTok), feature: opts.feature });

  const block = res.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!block) throw new Error("No content returned");
  return JSON.parse(block.text) as T;
}
