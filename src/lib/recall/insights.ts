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
