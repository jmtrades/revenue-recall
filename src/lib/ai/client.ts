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
  return process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7";
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
  /** Sampling temperature. Higher = more natural variation (good for human-voice
   *  drafting); lower = more consistent (good for analysis/distillation). */
  temperature?: number;
  think?: boolean;
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
  if (opts.temperature !== undefined) params.temperature = opts.temperature;
  if (opts.think) {
    params.thinking = { type: "adaptive" };
    (params.output_config as Record<string, unknown>).effort = "medium";
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
