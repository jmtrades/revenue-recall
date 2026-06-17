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
