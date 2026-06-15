import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { sendEmail } from "@/lib/comms";
import { seenInboundEvent } from "@/lib/inbound-dedup";
import { catalogForPlan } from "@/lib/billing/catalog";
import { getPlan, isPlanId, type PlanId } from "@/lib/billing/plans";
import { CALL_MINUTES_FEATURE } from "@/lib/billing/voice-minutes";
import { logInfo } from "@/lib/log";

/**
 * Platform pulse — the OPERATOR's weekly business email. Every other report in
 * the product is per-customer-org; this is the one view of the whole platform:
 * signups, paid subscriptions, estimated MRR, usage, and AI spend, mailed every
 * Monday to OPERATOR_EMAIL. Runs off the same hourly platform tick as the rest
 * of the housekeeping; durable once-per-week dedupe so a retried tick can't
 * double-send. Entirely inert until OPERATOR_EMAIL is set.
 */

export interface PlatformStats {
  totalOrgs: number;
  newOrgs7d: number;
  paidSubs: number;
  byPlan: Partial<Record<PlanId, number>>;
  /** Estimated monthly recurring revenue in USD (per-seat plans × seats). */
  mrrUsd: number;
  /** Last 7 days. */
  aiCostUsd7d: number;
  aiActions7d: number;
  talkMinutes7d: number;
  /** Revenue earned in the 7-day window (MRR pro-rated to a week). */
  weeklyRevenueUsd: number;
  /** Estimated gross margin % this week = (weekly revenue − COGS) / revenue.
   *  null when there's no revenue yet (margin is undefined on $0). */
  grossMarginPct: number | null;
}

/** Monthly price for a plan in USD from the billing catalog (source of truth). */
function planMonthlyUsd(plan: PlanId): number {
  const item = catalogForPlan(plan as Exclude<PlanId, "free">, "monthly");
  return item ? item.unitAmountCents / 100 : 0;
}

/** Aggregate platform-wide stats via the service client. Null without a DB. */
export async function platformStats(now: Date = new Date()): Promise<PlatformStats | null> {
  if (!isSupabaseConfigured()) return null;
  const client = getSupabase()!;
  const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  try {
    const [orgsAll, orgsNew, subs, usage] = await Promise.all([
      client.from("orgs").select("id", { count: "exact", head: true }),
      client.from("orgs").select("id", { count: "exact", head: true }).gte("created_at", since),
      client.from("subscriptions").select("plan,status,seats").eq("status", "active"),
      client.from("ai_usage").select("cost_usd,feature,input_tokens").gte("created_at", since),
    ]);
    const byPlan: Partial<Record<PlanId, number>> = {};
    let mrr = 0;
    let paid = 0;
    for (const s of (subs.data ?? []) as { plan?: string; seats?: number }[]) {
      if (!isPlanId(s.plan) || s.plan === "free") continue;
      paid += 1;
      byPlan[s.plan] = (byPlan[s.plan] ?? 0) + 1;
      const seats = getPlan(s.plan).perSeat ? Math.max(1, Number(s.seats ?? 1)) : 1;
      mrr += planMonthlyUsd(s.plan) * seats;
    }
    let cost = 0;
    let actions = 0;
    let talkSeconds = 0;
    for (const u of (usage.data ?? []) as { cost_usd?: number; feature?: string; input_tokens?: number }[]) {
      cost += Number(u.cost_usd ?? 0);
      if (u.feature === CALL_MINUTES_FEATURE) talkSeconds += Number(u.input_tokens ?? 0);
      else actions += 1;
    }
    // Pro-rate monthly revenue to the 7-day COGS window so margin compares like
    // with like (avg month ≈ 30.44 days).
    const weeklyRevenue = mrr * 7 / 30.44;
    const grossMarginPct = weeklyRevenue > 0 ? Math.round(((weeklyRevenue - cost) / weeklyRevenue) * 100) : null;
    return {
      totalOrgs: orgsAll.count ?? 0,
      newOrgs7d: orgsNew.count ?? 0,
      paidSubs: paid,
      byPlan,
      mrrUsd: Math.round(mrr),
      aiCostUsd7d: Number(cost.toFixed(2)),
      aiActions7d: actions,
      talkMinutes7d: Math.round(talkSeconds / 60),
      weeklyRevenueUsd: Math.round(weeklyRevenue),
      grossMarginPct,
    };
  } catch {
    return null;
  }
}

/** The email body — pure so the framing is testable. Plain numbers, no spin:
 *  this is the founder's own scoreboard. */
export function pulseBody(s: PlatformStats): string {
  const plans = (Object.entries(s.byPlan) as [PlanId, number][])
    .map(([p, n]) => `${getPlan(p).name} ×${n}`)
    .join(" · ");
  return [
    "Your platform this week:",
    "",
    `  Workspaces: ${s.totalOrgs} total · ${s.newOrgs7d} new this week`,
    `  Paid subscriptions: ${s.paidSubs}${plans ? ` (${plans})` : ""}`,
    `  Estimated MRR: $${s.mrrUsd.toLocaleString()}`,
    "",
    "  Last 7 days of usage:",
    `  AI actions: ${s.aiActions7d.toLocaleString()} · talk minutes: ${s.talkMinutes7d.toLocaleString()}`,
    `  AI + voice COGS: $${s.aiCostUsd7d.toFixed(2)}`,
    `  Gross margin (est): ${s.grossMarginPct === null ? "—" : `${s.grossMarginPct}%`} (weekly rev ~$${s.weeklyRevenueUsd.toLocaleString()} vs COGS $${s.aiCostUsd7d.toFixed(2)})`,
    "",
    "Numbers come straight from the live database — no sampling, no spin.",
  ].join("\n");
}

/** ISO-week key (e.g. 2026-W24) — the once-per-week dedupe unit. */
export function isoWeekKey(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = d.getUTCDay() || 7; // Mon=1 … Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - day); // shift to the ISO week's Thursday
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export type PulseResult = "n/a" | "not_monday" | "duplicate" | "no_stats" | "sent" | "send_failed";

/** Fire the weekly pulse: Mondays (UTC), after 13:00 so it reads as a morning
 *  note in the Americas, durable once-per-ISO-week dedupe. */
export async function runPlatformPulse(now: Date = new Date()): Promise<PulseResult> {
  const to = process.env.OPERATOR_EMAIL;
  if (!to) return "n/a";
  if (now.getUTCDay() !== 1 || now.getUTCHours() < 13) return "not_monday";
  if (!isSupabaseConfigured()) return "n/a";
  if (await seenInboundEvent("platform-pulse", isoWeekKey(now))) return "duplicate";
  const stats = await platformStats(now);
  if (!stats) return "no_stats";
  const base = process.env.NEXT_PUBLIC_SITE_URL;
  const r = await sendEmail(to, "Platform pulse — your week in numbers", pulseBody(stats), {
    internal: true,
    ...(base ? { cta: { label: "Open the dashboard", url: `${base.replace(/\/$/, "")}/dashboard` } } : {}),
  }).catch(() => null);
  const ok = Boolean(r && r.status !== "failed");
  if (ok) logInfo("platform.pulse_sent", { to, week: isoWeekKey(now) });
  return ok ? "sent" : "send_failed";
}
