import { isSupabaseConfigured, getSupabase } from "@/lib/supabase/client";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { getActiveOrgId } from "@/lib/supabase/tenant";
import { entitlements } from "@/lib/billing/entitlements";
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
  /** Cost (USD) attributed per feature label, for ROI/breakdown. */
  byFeature: Record<string, number>;
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
  return { costUsd: 0, inputTokens: 0, outputTokens: 0, calls: 0, byFeature: {} };
}

function add(s: UsageSummary, cost: number, inTok: number, outTok: number, feature?: string): UsageSummary {
  const key = feature || "other";
  return {
    costUsd: s.costUsd + cost,
    inputTokens: s.inputTokens + inTok,
    outputTokens: s.outputTokens + outTok,
    calls: s.calls + 1,
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

/** Extra AI actions purchased for the current billing month (top-ups). */
export async function creditsThisPeriod(now: Date = new Date()): Promise<number> {
  try {
    if (!isSupabaseConfigured()) return 0;
    const id = await orgId();
    if (!id) return 0;
    const { data } = await getSupabase()!
      .from("usage_credits")
      .select("actions")
      .eq("org_id", id)
      .eq("period", periodKey(now));
    return (data ?? []).reduce((s, r) => s + Number(r.actions ?? 0), 0);
  } catch {
    return 0;
  }
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
  const [{ calls }, credits, sub] = await Promise.all([usageSummary(now), creditsThisPeriod(now), getSubscription()]);
  const included = entitlements(sub.plan).actionsPerMonth;
  const unlimited = !Number.isFinite(included);
  const limit = unlimited ? Infinity : included + credits;
  const remaining = unlimited ? Infinity : Math.max(0, limit - calls);
  const fraction = unlimited || limit <= 0 ? 0 : Math.min(1, calls / limit);
  return { used: calls, included, credits, limit, remaining, fraction, unlimited };
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
