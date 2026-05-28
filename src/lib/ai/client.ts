import Anthropic from "@anthropic-ai/sdk";
import crypto from "crypto";
import { consumeAiAction } from "@/lib/billing/usage";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";

/** Thrown when an org has exhausted its AI actions and credits. Callers fall
 *  back to deterministic templates, so the product degrades gracefully. */
export class AiQuotaError extends Error {
  constructor() {
    super("AI action quota exhausted");
    this.name = "AiQuotaError";
  }
}

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

/**
 * Default model. Haiku keeps per-action inference cost low enough to hold
 * 90%+ gross margin on metered plans; the system prompt is cached on every
 * call (see completeJson). Operators can pin a different model via env, and
 * individual call sites can request a stronger one for quality-critical work.
 */
export function aiModel(override?: string): string {
  return override ?? process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";
}

/**
 * Stronger model for nuance-critical, lower-frequency work (live objection
 * handling, voice distillation). Live certification showed Haiku occasionally
 * emits placeholders and mishandles angry opt-outs on replies, while Sonnet
 * handles them correctly — so replies route here. Drafts stay on Haiku (Haiku
 * matched voice perfectly there). An ANTHROPIC_MODEL env override still wins.
 */
export const QUALITY_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

// Short-lived output cache: identical idempotent requests (e.g. a deal brief
// re-rendered on each page view) are served free — no API call, no metered
// action. This is one of the biggest cost savers. Per-instance + ephemeral.
const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 500;
const outputCache = new Map<string, { value: unknown; expires: number }>();

function cacheKey(org: string, model: string, system: string, user: string): string {
  return crypto.createHash("sha256").update(`${org} ${model} ${system} ${user}`).digest("hex");
}

/**
 * Run a structured-output completion and return the parsed JSON object.
 * The system prompt is marked cacheable (Anthropic prompt caching ~90% off
 * input on hits). Pass cache:true for idempotent calls (briefs, summaries) to
 * also serve repeat requests from a local cache — free and unmetered.
 */
export async function completeJson<T>(opts: {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
  think?: boolean;
  model?: string;
  cache?: boolean;
}): Promise<T> {
  const client = getAnthropic();
  if (!client) throw new Error("AI not configured");

  const model = aiModel(opts.model);
  // Scope the cache to the tenant so outputs can never leak across orgs.
  const key = opts.cache ? cacheKey((await resolveActiveOrgId()) ?? "none", model, opts.system, opts.user) : "";
  if (opts.cache) {
    const hit = outputCache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value as T; // free + unmetered, same tenant only
  }

  // Meter every paid model call at this single chokepoint, so no path (drafts,
  // briefs, summaries, voice distillation, autopilot, inbound auto-reply) can
  // bypass the plan quota. On exhaustion we throw; callers fall back to free
  // templates. This is what keeps inference cost from ever outrunning revenue.
  const gate = await consumeAiAction();
  if (!gate.ok) throw new AiQuotaError();

  // Built untyped: output_config / adaptive thinking are current API fields
  // that may post-date the installed SDK's static types.
  const params: Record<string, unknown> = {
    model,
    max_tokens: opts.maxTokens ?? 1500,
    system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: opts.user }],
    output_config: { format: { type: "json_schema", schema: opts.schema } },
  };
  if (opts.think) {
    params.thinking = { type: "adaptive" };
    (params.output_config as Record<string, unknown>).effort = "medium";
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await client.messages.create(params as any);
  const block = res.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!block) throw new Error("No content returned");
  const parsed = JSON.parse(block.text) as T;

  if (opts.cache) {
    if (outputCache.size >= MAX_ENTRIES) {
      const oldest = outputCache.keys().next().value;
      if (oldest) outputCache.delete(oldest);
    }
    outputCache.set(key, { value: parsed, expires: Date.now() + TTL_MS });
  }
  return parsed;
}
