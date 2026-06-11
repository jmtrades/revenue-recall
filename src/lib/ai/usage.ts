import { isSupabaseConfigured, getSupabase } from "@/lib/supabase/client";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { getActiveOrgId } from "@/lib/supabase/tenant";
import { entitlements, effectivePlan } from "@/lib/billing/entitlements";
import { getSubscription } from "@/lib/billing/store";

/**
 * AI usage ledger + budget guard. Records every live AI call's tokens and cost so
 * spend is visible (margins!), and enforces an optional monthly cap that, when
 * hit, transparently degrades to the free template path instead of billing more.
 * Supabase-backed when configured; in-memory otherwise so the demo works.
 */

export interface UsageEntry {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  feature?: string;
  at: string; // ISO
}

export interface UsageSummary {
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  calls: number;
  /**
   * Customer-visible AI actions — what the plan's "AI messages" allowance
   * sells. Excludes internal passes (the humanness refine that can double a
   * draft's calls, and the diagnostics probe): one draft = one action no matter
   * how many model calls it takes internally. `calls`/cost keep the full
   * picture for the operator breakdown.
   */
  actions: number;
  /** Cost (USD) attributed per feature label, for ROI/breakdown. */
  byFeature: Record<string, number>;
}

/** Entries that must not burn the customer's ACTION allowance: internal model
 *  passes (refine/health), and call-minute rows — phone time is metered on its
 *  own voice-minutes meter, not the AI-message pool. */
function isInternalFeature(feature?: string): boolean {
  return !!feature && (feature === "refine" || feature.endsWith(".refine") || feature === "health" || feature === "call_minutes");
}

const mem: (UsageEntry & { orgId?: string })[] = [];

async function orgId(): Promise<string | null> {
  return (await resolveActiveOrgId()) ?? (getSupabase() ? await getActiveOrgId(getSupabase()!) : null);
}

function monthKey(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}

/** Monthly budget cap in USD (0 / unset = unlimited). */
export function monthlyBudgetUsd(): number {
  const v = Number(process.env.AI_MONTHLY_BUDGET_USD);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** Record a completed AI call. Best-effort — never throws into the caller. */
export async function recordUsage(entry: Omit<UsageEntry, "at">): Promise<void> {
  const row: UsageEntry = { ...entry, at: new Date().toISOString() };
  try {
    if (!isSupabaseConfigured()) {
      mem.push(row);
      return;
    }
    const id = await orgId();
    if (!id) {
      mem.push(row);
      return;
    }
    await getSupabase()!
      .from("ai_usage")
      .insert({ org_id: id, model: row.model, input_tokens: row.inputTokens, output_tokens: row.outputTokens, cost_usd: row.costUsd, feature: row.feature ?? null });
  } catch {
    /* metering must never break a draft */
  }
}

/** Spend + token summary for the current calendar month. */
function blank(): UsageSummary {
  return { costUsd: 0, inputTokens: 0, outputTokens: 0, calls: 0, actions: 0, byFeature: {} };
}

function add(s: UsageSummary, cost: number, inTok: number, outTok: number, feature?: string): UsageSummary {
  const key = feature || "other";
  const actions = s.actions + (isInternalFeature(feature) ? 0 : 1);
  return {
    costUsd: s.costUsd + cost,
    inputTokens: s.inputTokens + inTok,
    outputTokens: s.outputTokens + outTok,
    calls: s.calls + 1,
    actions,
    byFeature: { ...s.byFeature, [key]: (s.byFeature[key] ?? 0) + cost },
  };
}

export async function usageSummary(now: Date = new Date()): Promise<UsageSummary> {
  const mk = now.toISOString().slice(0, 7);
  try {
    if (!isSupabaseConfigured()) {
      return mem.filter((r) => monthKey(r.at) === mk).reduce((s, r) => add(s, r.costUsd, r.inputTokens, r.outputTokens, r.feature), blank());
    }
    const id = await orgId();
    if (!id) return blank();
    const from = `${mk}-01T00:00:00.000Z`;
    const { data } = await getSupabase()!.from("ai_usage").select("input_tokens,output_tokens,cost_usd,feature").eq("org_id", id).gte("created_at", from);
    return (data ?? []).reduce((s, r) => add(s, Number(r.cost_usd ?? 0), Number(r.input_tokens ?? 0), Number(r.output_tokens ?? 0), (r.feature as string) ?? undefined), blank());
  } catch {
    return blank();
  }
}

/**
 * Sum of `input_tokens` for one feature label this month. The ledger's unit
 * columns are feature-defined: AI completions store tokens; `call_minutes`
 * rows store SECONDS of connected call time (cost_usd stays real money in
 * both). This is what lets voice minutes meter through the existing table —
 * no new migration, same org scoping, same month windows.
 */
export async function featureUnitsThisMonth(feature: string, now: Date = new Date()): Promise<number> {
  const mk = now.toISOString().slice(0, 7);
  try {
    if (!isSupabaseConfigured()) {
      return mem.filter((r) => r.feature === feature && monthKey(r.at) === mk).reduce((s, r) => s + r.inputTokens, 0);
    }
    const id = await orgId();
    if (!id) return 0;
    const from = `${mk}-01T00:00:00.000Z`;
    const { data } = await getSupabase()!.from("ai_usage").select("input_tokens").eq("org_id", id).eq("feature", feature).gte("created_at", from);
    return (data ?? []).reduce((s, r) => s + Number(r.input_tokens ?? 0), 0);
  } catch {
    return 0;
  }
}

/** Fraction of the monthly budget already spent (0 = none/unlimited, ≥1 = capped). */
export async function budgetFraction(now: Date = new Date()): Promise<number> {
  const cap = monthlyBudgetUsd();
  if (cap <= 0) return 0; // unlimited
  const { costUsd } = await usageSummary(now);
  return costUsd / cap;
}

/** True when we're under the monthly budget (or no budget is set). */
export async function isWithinBudget(now: Date = new Date()): Promise<boolean> {
  const cap = monthlyBudgetUsd();
  if (cap <= 0) return true;
  const { costUsd } = await usageSummary(now);
  return costUsd < cap;
}

// ---------------------------------------------------------------------------
// Action allowance + top-up credits (customer-facing usage meter).
// An "action" = one live AI completion. Each plan includes a monthly pool;
// customers buy extra "actions" (top-ups) that stack onto the current month.
// ---------------------------------------------------------------------------

function periodKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7); // YYYY-MM
}

/** Sum purchased credits for the current month, filtered by pool. The
 *  usage_credits table holds BOTH AI-message packs (source "topup") and talk-
 *  minute packs (source "voice_topup") — the source keeps the pools separate,
 *  so a minute purchase can never inflate the message meter or vice versa. */
async function creditsBySource(now: Date, voice: boolean): Promise<number> {
  try {
    if (!isSupabaseConfigured()) return 0;
    const id = await orgId();
    if (!id) return 0;
    let q = getSupabase()!.from("usage_credits").select("actions,source").eq("org_id", id).eq("period", periodKey(now));
    q = voice ? q.eq("source", "voice_topup") : q.neq("source", "voice_topup");
    const { data } = await q;
    return (data ?? []).reduce((s, r) => s + Number(r.actions ?? 0), 0);
  } catch {
    return 0;
  }
}

/** Extra AI MESSAGE actions purchased for the current billing month. */
export async function creditsThisPeriod(now: Date = new Date()): Promise<number> {
  return creditsBySource(now, false);
}

/** Extra TALK MINUTES purchased for the current billing month. */
export async function voiceMinuteCreditsThisPeriod(now: Date = new Date()): Promise<number> {
  return creditsBySource(now, true);
}

export interface UsageMeter {
  /** Live AI actions used this month. */
  used: number;
  /** Plan's included monthly actions (Infinity = unmetered). */
  included: number;
  /** Purchased top-up actions active this month. */
  credits: number;
  /** included + credits (Infinity = unmetered). */
  limit: number;
  /** max(0, limit − used) (Infinity = unmetered). */
  remaining: number;
  /** used / limit, clamped 0–1 (0 when unmetered). */
  fraction: number;
  unlimited: boolean;
}

/** The current org's usage meter: actions used vs included + purchased credits. */
export async function usageMeter(now: Date = new Date()): Promise<UsageMeter> {
  const [{ actions }, credits, sub] = await Promise.all([usageSummary(now), creditsThisPeriod(now), getSubscription()]);
  // Use the EFFECTIVE plan (past_due/canceled → free), so the action allowance
  // fails closed for a lapsed subscription — consistent with the feature gate in
  // billing/enforce.ts. Otherwise a past_due "team" org keeps a 10k pool.
  const included = entitlements(effectivePlan(sub.plan, sub.status)).actionsPerMonth;
  const unlimited = !Number.isFinite(included);
  const limit = unlimited ? Infinity : included + credits;
  const remaining = unlimited ? Infinity : Math.max(0, limit - actions);
  const fraction = unlimited || limit <= 0 ? 0 : Math.min(1, actions / limit);
  return { used: actions, included, credits, limit, remaining, fraction, unlimited };
}

/** True when the org still has live AI actions left this month (or is unmetered). */
export async function isWithinActionAllowance(now: Date = new Date()): Promise<boolean> {
  const m = await usageMeter(now);
  return m.unlimited || m.used < m.limit;
}

/** Credit purchased top-up actions to the current period. Idempotent on `ref`
 *  (the Stripe session id), so webhook retries never double-credit. */
export async function addUsageCredits(input: { orgId: string; actions: number; source?: string; ref?: string; now?: Date }): Promise<void> {
  if (!isSupabaseConfigured() || !(input.actions > 0)) return;
  const { error } = await getSupabase()!
    .from("usage_credits")
    .insert({
      org_id: input.orgId,
      period: periodKey(input.now ?? new Date()),
      actions: Math.floor(input.actions),
      source: input.source ?? "topup",
      ref: input.ref ?? null,
    });
  // A duplicate `ref` (Postgres 23505) is a retried webhook — idempotency working,
  // so ignore it. ANY OTHER error means we failed to credit a top-up the customer
  // already PAID for: throw so the webhook returns 500 and Stripe retries (the
  // unique(ref) index keeps the retry safe). Previously every error — including
  // transient DB failures — was swallowed, silently losing paid credits.
  if (error && (error as { code?: string }).code !== "23505") {
    throw new Error(`Failed to credit top-up actions: ${error.message}`);
  }
}

/** Test-only reset of the in-memory ledger. */
export function _resetUsage(): void {
  mem.length = 0;
}
