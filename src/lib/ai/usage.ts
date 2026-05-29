import { isSupabaseConfigured, getSupabase } from "@/lib/supabase/client";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { getActiveOrgId } from "@/lib/supabase/tenant";

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

/** Test-only reset of the in-memory ledger. */
export function _resetUsage(): void {
  mem.length = 0;
}
