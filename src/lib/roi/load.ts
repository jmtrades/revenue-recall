import { cachedRecallTouches } from "@/lib/crm/cached";
import { resolveProvider } from "@/lib/crm/registry";
import { getOrgSettings } from "@/lib/org";
import { getWonBackDeals } from "@/lib/queries";
import { computeRoi, filterTimeline, type RoiReport } from "@/lib/roi/model";
import { mergeLedger } from "@/lib/roi/project";
import { listRoiEvents } from "@/lib/roi/store";
import type { RoiEvent } from "@/lib/roi/types";

export interface LoadedRoi {
  report: RoiReport;
  events: RoiEvent[];
  stored: number;
  /** Events that came from CRM history rather than the live ledger. */
  projected: number;
}

/** The results page's read model. Never throws — a ledger hiccup shows an empty report. */
export async function loadRoi(now = new Date()): Promise<LoadedRoi> {
  const org = await getOrgSettings().catch(() => null);
  const currency = org?.currency || "USD";
  try {
    const [stored, activities, touches, wins] = await Promise.all([
      listRoiEvents().catch(() => [] as RoiEvent[]),
      resolveProvider().then((p) => p.listRecentActivities(800)).catch(() => []),
      cachedRecallTouches().catch(() => []),
      getWonBackDeals().catch(() => []),
    ]);
    const events = mergeLedger(
      stored,
      activities,
      touches,
      wins.map((w) => ({ dealId: w.dealId, value: w.value, wonAt: w.wonAt })),
    );
    return {
      report: computeRoi(events, { now, currency }),
      events,
      stored: stored.length,
      projected: Math.max(0, events.length - stored.length),
    };
  } catch {
    return { report: computeRoi([], { now, currency }), events: [], stored: 0, projected: 0 };
  }
}

export function timelineFor(events: RoiEvent[], query?: string): RoiEvent[] {
  if (!query) return [...events].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt)).slice(0, 30);
  return filterTimeline(events, query);
}
