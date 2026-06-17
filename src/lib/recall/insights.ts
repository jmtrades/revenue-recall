import type { RecallTouch, RecallTouchChannel, RecallTouchSource } from "@/lib/recall/events";

/**
 * Recall flywheel (v1) — pure aggregation of where the recall engine is actually
 * spending its effort, derived from the recorded recall touches. This is the
 * honest first turn of the flywheel: "what are we doing, on which channels" —
 * the foundation for per-channel win-back attribution once there's enough
 * outcome data to be meaningful. Pure + tested; safe to call anywhere.
 */

export interface RecallChannelStat {
  channel: RecallTouchChannel;
  touches: number;
  /** Distinct deals touched on this channel. */
  deals: number;
  /** Share of all touches, 0–1. */
  share: number;
}

export interface RecallSourceStat {
  source: RecallTouchSource;
  touches: number;
  share: number;
}

export interface RecallInsights {
  totalTouches: number;
  /** Distinct deals touched across all channels. */
  dealsTouched: number;
  byChannel: RecallChannelStat[];
  bySource: RecallSourceStat[];
}

const CHANNELS: RecallTouchChannel[] = ["call", "email", "sms"];
const SOURCES: RecallTouchSource[] = ["autopilot", "cadence", "manual"];

export function recallInsights(touches: RecallTouch[]): RecallInsights {
  const total = touches.length;
  const dealsAll = new Set<string>();
  const byChannelTouches = new Map<RecallTouchChannel, number>();
  const byChannelDeals = new Map<RecallTouchChannel, Set<string>>();
  const bySourceTouches = new Map<RecallTouchSource, number>();

  for (const t of touches) {
    byChannelTouches.set(t.channel, (byChannelTouches.get(t.channel) ?? 0) + 1);
    bySourceTouches.set(t.source, (bySourceTouches.get(t.source) ?? 0) + 1);
    if (t.dealId) {
      dealsAll.add(t.dealId);
      const set = byChannelDeals.get(t.channel) ?? new Set<string>();
      set.add(t.dealId);
      byChannelDeals.set(t.channel, set);
    }
  }

  const share = (n: number) => (total > 0 ? n / total : 0);

  const byChannel: RecallChannelStat[] = CHANNELS.map((channel) => ({
    channel,
    touches: byChannelTouches.get(channel) ?? 0,
    deals: byChannelDeals.get(channel)?.size ?? 0,
    share: share(byChannelTouches.get(channel) ?? 0),
  }))
    .filter((c) => c.touches > 0)
    .sort((a, b) => b.touches - a.touches);

  const bySource: RecallSourceStat[] = SOURCES.map((source) => ({
    source,
    touches: bySourceTouches.get(source) ?? 0,
    share: share(bySourceTouches.get(source) ?? 0),
  }))
    .filter((s) => s.touches > 0)
    .sort((a, b) => b.touches - a.touches);

  return { totalTouches: total, dealsTouched: dealsAll.size, byChannel, bySource };
}

/**
 * Recall flywheel (v2) — per-channel WIN-BACK attribution. Turns "where effort
 * goes" into "what actually recovers deals" by crediting each won-back deal to
 * the channel that last re-engaged it (last-touch: the most recent recall touch
 * on/before the deal was won). Last-touch is the honest, defensible default —
 * the channel that closed the loop — without overstating multi-channel assists.
 * Pure + tested.
 */

/** A recovered deal, reduced to what attribution needs. */
export interface AttributableWin {
  dealId: string;
  value: number;
  /** ISO timestamp the deal reached a won stage. */
  wonAt: string;
}

export interface RecallChannelWins {
  channel: RecallTouchChannel;
  /** Won-back deals last re-engaged on this channel. */
  deals: number;
  recoveredValue: number;
  /** Share of attributed recovered value, 0–1. */
  share: number;
}

export interface RecallAttribution {
  byChannel: RecallChannelWins[];
  attributedValue: number;
  attributedDeals: number;
  /** Won-back deals with no recall touch on/before the win (e.g. enrollment-only). */
  unattributedDeals: number;
}

export function recallWinAttribution(touches: RecallTouch[], wins: AttributableWin[]): RecallAttribution {
  const byDeal = new Map<string, RecallTouch[]>();
  for (const t of touches) {
    if (!t.dealId) continue;
    const list = byDeal.get(t.dealId) ?? [];
    list.push(t);
    byDeal.set(t.dealId, list);
  }

  const dealsByChannel = new Map<RecallTouchChannel, number>();
  const valueByChannel = new Map<RecallTouchChannel, number>();
  let attributedValue = 0;
  let attributedDeals = 0;
  let unattributedDeals = 0;

  for (const win of wins) {
    // Last recall touch on/before the win — the channel that closed the loop.
    const candidates = (byDeal.get(win.dealId) ?? []).filter((t) => t.occurredAt <= win.wonAt);
    if (candidates.length === 0) {
      unattributedDeals += 1;
      continue;
    }
    const last = candidates.reduce((a, b) => (a.occurredAt >= b.occurredAt ? a : b));
    dealsByChannel.set(last.channel, (dealsByChannel.get(last.channel) ?? 0) + 1);
    valueByChannel.set(last.channel, (valueByChannel.get(last.channel) ?? 0) + win.value);
    attributedValue += win.value;
    attributedDeals += 1;
  }

  const byChannel: RecallChannelWins[] = CHANNELS.map((channel) => ({
    channel,
    deals: dealsByChannel.get(channel) ?? 0,
    recoveredValue: valueByChannel.get(channel) ?? 0,
    share: attributedValue > 0 ? (valueByChannel.get(channel) ?? 0) / attributedValue : 0,
  }))
    .filter((c) => c.deals > 0)
    .sort((a, b) => b.recoveredValue - a.recoveredValue);

  return { byChannel, attributedValue, attributedDeals, unattributedDeals };
}

/** Who is actually winning revenue back — the recovered-revenue counterpart to
 *  the at-risk-by-rep table. Groups won-back deals by owner, sorted by value. */
export interface OwnerRecovery {
  name: string;
  deals: number;
  recoveredValue: number;
}

export function recoveredByOwner(deals: ReadonlyArray<{ ownerName: string; value: number }>): OwnerRecovery[] {
  const byOwner = new Map<string, OwnerRecovery>();
  for (const d of deals) {
    const row = byOwner.get(d.ownerName) ?? { name: d.ownerName, deals: 0, recoveredValue: 0 };
    row.deals += 1;
    row.recoveredValue += d.value;
    byOwner.set(d.ownerName, row);
  }
  return [...byOwner.values()].sort((a, b) => b.recoveredValue - a.recoveredValue);
}

/**
 * A single deal's recall journey — when re-engagement began, every touch in
 * order, and which channels were used. The in-product proof artifact: open a
 * deal and see exactly how recall worked it. Pure; the caller pre-filters the
 * touches to this deal.
 */
export interface RecallJourney {
  totalTouches: number;
  firstTouchAt: string | null;
  lastTouchAt: string | null;
  /** Distinct channels used, most-used first. */
  channels: RecallTouchChannel[];
  /** Touches oldest-first. */
  timeline: RecallTouch[];
}

export function recallJourney(touches: RecallTouch[]): RecallJourney {
  const timeline = touches.slice().sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : 1));
  const counts = new Map<RecallTouchChannel, number>();
  for (const t of timeline) counts.set(t.channel, (counts.get(t.channel) ?? 0) + 1);
  const channels = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  return {
    totalTouches: timeline.length,
    firstTouchAt: timeline[0]?.occurredAt ?? null,
    lastTouchAt: timeline[timeline.length - 1]?.occurredAt ?? null,
    channels,
    timeline,
  };
}

/**
 * Recovered revenue by week — the flywheel's OUTPUT over time, the counterpart
 * to outreach-by-week. Buckets each won-back deal's value into the week it
 * closed, oldest-first, for a bar chart. Pure (mirrors touchesByWeek's windowing
 * so the two charts line up). Caller passes won-back deals with value + wonAt.
 */
export function recoveredByWeek(
  wins: ReadonlyArray<{ value: number; wonAt: string }>,
  now: Date = new Date(),
  weeks = 6,
): { label: string; value: number }[] {
  const DAY = 86_400_000;
  const end = now.getTime();
  const out: { label: string; value: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = end - (i + 1) * 7 * DAY;
    const stop = end - i * 7 * DAY;
    let value = 0;
    for (const w of wins) {
      const ts = Date.parse(w.wonAt);
      if (!Number.isNaN(ts) && ts >= start && ts < stop) value += w.value;
    }
    const d = new Date(start);
    out.push({ label: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`, value });
  }
  return out;
}
