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
export async function usageSummary(now: Date = new Date()): Promise<UsageSummary> {
  const mk = now.toISOString().slice(0, 7);
  const empty: UsageSummary = { costUsd: 0, inputTokens: 0, outputTokens: 0, calls: 0 };
  try {
    if (!isSupabaseConfigured()) {
      return mem.filter((r) => monthKey(r.at) === mk).reduce(
        (s, r) => ({ costUsd: s.costUsd + r.costUsd, inputTokens: s.inputTokens + r.inputTokens, outputTokens: s.outputTokens + r.outputTokens, calls: s.calls + 1 }),
        empty,
      );
    }
    const id = await orgId();
    if (!id) return empty;
    const from = `${mk}-01T00:00:00.000Z`;
    const { data } = await getSupabase()!.from("ai_usage").select("input_tokens,output_tokens,cost_usd").eq("org_id", id).gte("created_at", from);
    return (data ?? []).reduce(
      (s, r) => ({
        costUsd: s.costUsd + Number(r.cost_usd ?? 0),
        inputTokens: s.inputTokens + Number(r.input_tokens ?? 0),
        outputTokens: s.outputTokens + Number(r.output_tokens ?? 0),
        calls: s.calls + 1,
      }),
      empty,
    );
  } catch {
    return empty;
  }
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
