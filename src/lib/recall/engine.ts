import type { Activity, Opportunity, Pipeline, Stage } from "@/lib/crm/types";

/**
 * Revenue Recall engine.
 *
 * Surfaces revenue that's slipping away — open deals going cold and lost deals
 * worth re-approaching — and ranks them so a rep always knows the single best
 * thing to do next. This is the product's core differentiator.
 */

export type RecallReason = "going_cold" | "stalled" | "lost_winnable" | "no_activity";

export interface RecallItem {
  opportunityId: string;
  title: string;
  value: number;
  currency: string;
  /** Probability-weighted value still in play. */
  weightedValue: number;
  daysSinceActivity: number;
  reason: RecallReason;
  /** 0..100 priority. Higher = recall sooner. */
  score: number;
  recommendation: string;
  channel: "call" | "email" | "sms";
  /** The contact replied at least once before going quiet — a hotter recall. */
  engaged: boolean;
  /** An open deal whose expected close date has already passed. */
  overdue: boolean;
}

/** Optional per-opportunity signals that sharpen scoring and channel choice. */
export interface RecallSignals {
  /** Recent activities for this opportunity (any order). */
  activities?: Activity[];
}

/**
 * Day thresholds that define "slipping" — tunable per industry so a months-long
 * enterprise deal isn't flagged as fast as a same-week home-services job.
 */
export interface RecallThresholds {
  /** A live (prob ≥ 0.5) deal with no touch in this many days is going cold. */
  goingColdDays: number;
  /** Any open deal untouched this long is stalled. */
  stalledDays: number;
  /** A low-probability deal untouched this long was never properly worked. */
  noActivityDays: number;
  /** Lost deals older than this are too cold to bother re-approaching. */
  lostWindowDays: number;
}

export const DEFAULT_RECALL_THRESHOLDS: RecallThresholds = {
  goingColdDays: 14,
  stalledDays: 30,
  noActivityDays: 7,
  lostWindowDays: 180,
};

const DAY = 1000 * 60 * 60 * 24;

function daysSince(iso?: string): number {
  if (!iso) return 999;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY));
}

function stageMap(pipelines: Pipeline[]): Map<string, Stage> {
  const m = new Map<string, Stage>();
  for (const p of pipelines) for (const s of p.stages) m.set(s.id, s);
  return m;
}

const REASON_COPY: Record<RecallReason, { rec: (d: number) => string; channel: RecallItem["channel"] }> = {
  going_cold: { rec: (d) => `No touch in ${d} days on a live deal — send a value-add follow-up today.`, channel: "email" },
  stalled: { rec: (d) => `Stalled mid-pipeline for ${d} days — call to surface the real blocker.`, channel: "call" },
  lost_winnable: { rec: () => `Marked lost but high-value — re-approach with a new angle or offer.`, channel: "call" },
  no_activity: { rec: () => `Never properly worked — make first contact before it ages out.`, channel: "sms" },
};

const CHANNELS: ReadonlySet<RecallItem["channel"]> = new Set(["call", "email", "sms"]);
/** Priority bump for deals where the buyer actually replied before going quiet. */
const ENGAGEMENT_BOOST = 10;
/** Max priority bump for an open deal whose close date has slipped. */
const OVERDUE_BOOST_CAP = 15;

/** The messaging channel the contact most recently replied on, if any. */
export function preferredChannel(activities?: Activity[]): RecallItem["channel"] | null {
  if (!activities?.length) return null;
  const inbound = activities
    .filter((a) => a.direction === "inbound" && CHANNELS.has(a.kind as RecallItem["channel"]))
    .sort((a, b) => (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""));
  return (inbound[0]?.kind as RecallItem["channel"]) ?? null;
}

/** Whether the contact ever replied — two-way engagement is a strong recall cue. */
export function hasEngaged(activities?: Activity[]): boolean {
  return Boolean(activities?.some((a) => a.direction === "inbound"));
}

function recommend(reason: RecallReason, days: number, engaged: boolean, channel: RecallItem["channel"], overrode: boolean, daysOverdue: number): string {
  const base = engaged && overrode
    ? `They went quiet after replying by ${channel} — ${(channel === "call" ? "call them back" : channel === "sms" ? "text them" : "email them")} on the thread they actually answer.`
    : REASON_COPY[reason].rec(days);
  return daysOverdue > 0 ? `${base} Close date slipped ${daysOverdue}d ago.` : base;
}

/**
 * Score a single opportunity. Open deals decay with inactivity; lost deals are
 * scored on recoverable value and how recently they died. When activity signals
 * are supplied, a deal the buyer previously engaged on ranks higher and is
 * routed to the channel they actually reply on.
 */
export function scoreOpportunity(
  opp: Opportunity,
  stages: Map<string, Stage>,
  signals?: RecallSignals,
  thresholds: RecallThresholds = DEFAULT_RECALL_THRESHOLDS,
): RecallItem | null {
  const stage = stages.get(opp.stageId);
  const days = daysSince(opp.lastActivityAt ?? opp.updatedAt);
  const prob = stage?.probability ?? 0.2;

  let reason: RecallReason;
  let recoverable: number; // 0..1 of value considered still winnable

  if (stage?.type === "won") return null;

  if (stage?.type === "lost") {
    if (days > thresholds.lostWindowDays || opp.value < 1000) return null; // too cold / too small
    reason = "lost_winnable";
    recoverable = 0.25;
  } else if (days >= thresholds.goingColdDays && prob >= 0.5) {
    reason = "going_cold";
    recoverable = prob;
  } else if (days >= thresholds.stalledDays) {
    reason = "stalled";
    recoverable = Math.max(0.15, prob * 0.6);
  } else if (days >= thresholds.noActivityDays && prob <= 0.2) {
    reason = "no_activity";
    recoverable = 0.2;
  } else {
    return null; // healthy / recently touched
  }

  const weightedValue = Math.round(opp.value * recoverable);

  // Channel: prefer the channel the buyer actually replies on; else the
  // reason's default. Engagement (a prior inbound reply) raises priority.
  const engaged = hasEngaged(signals?.activities);
  const preferred = preferredChannel(signals?.activities);
  const channel = preferred ?? REASON_COPY[reason].channel;
  const overrode = preferred !== null && preferred !== REASON_COPY[reason].channel;

  // An open deal past its expected close date is a distinct, urgent signal:
  // it was forecast to land and didn't. (Lost deals already have their own path.)
  const daysOverdue = reason !== "lost_winnable" && opp.expectedCloseAt ? daysSince(opp.expectedCloseAt) : 0;
  const overdue = daysOverdue > 0;

  // Score blends recoverable value (log-scaled) with urgency (inactivity), plus
  // boosts for proven two-way engagement and a slipped close date.
  const valueScore = Math.min(60, Math.log10(Math.max(10, weightedValue)) * 14);
  const urgency = Math.min(40, days * (reason === "lost_winnable" ? 0.15 : 0.6));
  const overdueBoost = Math.min(OVERDUE_BOOST_CAP, daysOverdue * 0.5);
  const score = Math.round(Math.min(100, valueScore + urgency + (engaged ? ENGAGEMENT_BOOST : 0) + overdueBoost));

  return {
    opportunityId: opp.id,
    title: opp.title,
    value: opp.value,
    currency: opp.currency,
    weightedValue,
    daysSinceActivity: days,
    reason,
    score,
    recommendation: recommend(reason, days, engaged, channel, overrode, daysOverdue),
    channel,
    engaged,
    overdue,
  };
}

export function buildRecallQueue(
  opportunities: Opportunity[],
  pipelines: Pipeline[],
  activitiesByOpp?: Map<string, Activity[]>,
  thresholds: RecallThresholds = DEFAULT_RECALL_THRESHOLDS,
): RecallItem[] {
  const stages = stageMap(pipelines);
  return opportunities
    .map((o) => scoreOpportunity(o, stages, activitiesByOpp ? { activities: activitiesByOpp.get(o.id) } : undefined, thresholds))
    .filter((x): x is RecallItem => x !== null)
    .sort((a, b) => b.score - a.score);
}

export interface RecallSummary {
  totalRecoverable: number;
  currency: string;
  itemCount: number;
  byReason: Record<RecallReason, { count: number; value: number }>;
}

/**
 * Recall ROI, derived from recall-sequence enrollments joined against current
 * deal states — so we can show "did recalling actually win deals back?" without
 * any new persistence. Attribution is necessarily heuristic: a deal counts as
 * won-back only if it reached a won stage on/after it was enrolled in recall.
 */
export interface RecallEnrollmentRef {
  sequenceId: string;
  dealId?: string;
  stepIndex: number;
  status: "active" | "completed" | "stopped";
  enrolledAt: string;
  lastStepAt?: string;
}

export interface RecallOutcomes {
  /** Deals enrolled into a recall sequence. */
  recalled: number;
  /** Of those, how many got at least one outreach touch. */
  reEngaged: number;
  /** Reached a won stage on/after being recalled. */
  wonBack: number;
  /** Total value of won-back deals. */
  recoveredValue: number;
  /** Still open and in play. */
  inProgress: number;
  currency: string;
}

/** Sequence ids that represent a re-engagement ("recall") effort. */
const RECALL_SEQUENCE_IDS: ReadonlySet<string> = new Set(["recall"]);

export function computeRecallOutcomes(
  enrollments: RecallEnrollmentRef[],
  oppById: Map<string, Opportunity>,
  stages: Map<string, Stage>,
  currency: string,
): RecallOutcomes {
  let recalled = 0;
  let reEngaged = 0;
  let wonBack = 0;
  let recoveredValue = 0;
  let inProgress = 0;
  for (const e of enrollments) {
    if (!RECALL_SEQUENCE_IDS.has(e.sequenceId)) continue;
    recalled += 1;
    if (e.stepIndex > 0 || e.lastStepAt) reEngaged += 1;
    const deal = e.dealId ? oppById.get(e.dealId) : undefined;
    if (!deal) continue;
    const stage = stages.get(deal.stageId);
    if (stage?.type === "won") {
      // Only credit recall when the win landed on/after enrollment.
      const wonAt = deal.closedAt ?? deal.updatedAt;
      if (!wonAt || wonAt >= e.enrolledAt) {
        wonBack += 1;
        recoveredValue += deal.value;
      }
    } else if (stage?.type === "open") {
      inProgress += 1;
    }
  }
  return { recalled, reEngaged, wonBack, recoveredValue, inProgress, currency };
}

export function summarizeRecall(items: RecallItem[], currency: string): RecallSummary {
  const byReason = {
    going_cold: { count: 0, value: 0 },
    stalled: { count: 0, value: 0 },
    lost_winnable: { count: 0, value: 0 },
    no_activity: { count: 0, value: 0 },
  } satisfies RecallSummary["byReason"];
  let total = 0;
  for (const it of items) {
    byReason[it.reason].count += 1;
    byReason[it.reason].value += it.weightedValue;
    total += it.weightedValue;
  }
  return { totalRecoverable: total, currency, itemCount: items.length, byReason };
}
