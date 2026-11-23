import {
  ATTRIBUTION_WINDOW_MS,
  DEFAULT_WINDOW_DAYS,
  SAVED_MINUTES,
  type RoiChannel,
  type RoiEvent,
  type RoiEventName,
} from "@/lib/roi/types";

const OUTBOUND = new Set<RoiEventName>(["message.sent", "call.dialed", "call.completed", "ai.action"]);

const RESCUE_AFTER = new Set<RoiEventName>([
  "webinar.joined",
  "webinar.recovered",
  "meeting.booked",
  "message.replied",
]);

export interface Attribution {
  outcomeId: string;
  outcome: RoiEventName;
  occurredAt: string;
  leadKey: string;
  contactId?: string;
  dealId?: string;
  leadId?: string;
  revenue: number;
  touchName?: RoiEventName;
  channel?: RoiChannel;
  campaignId?: string;
  sequenceId?: string;
  touchAt?: string;
}

export interface ChannelStat {
  channel: string;
  touches: number;
  replies: number;
  connects: number;
  clicks: number;
  optOuts: number;
  cost: number;
  revenue: number;
  deals: number;
}

export interface CampaignStat {
  id: string;
  touches: number;
  replies: number;
  revenue: number;
  deals: number;
}

export interface CohortRow {
  week: string;
  leads: number;
  recovered: number;
  revenue: number;
  rate: number;
}

export interface FunnelStage {
  label: string;
  count: number;
}

export interface Insight {
  tone: "good" | "attention";
  title: string;
  detail: string;
  recommendation: string;
}

export interface PeriodSnapshot {
  revenue: number;
  replies: number;
  sent: number;
  rescued: number;
  hoursSaved: number;
  booked: number;
  wonDeals: number;
}

export interface RoiReport {
  currency: string;
  windowDays: number;
  from: string;
  to: string;
  priorFrom: string;
  current: PeriodSnapshot;
  prior: PeriodSnapshot;
  /** Percent change vs the prior window. Null when the prior window was zero and this one is not. */
  delta: {
    revenue: number | null;
    replies: number | null;
    rescued: number | null;
    hoursSaved: number | null;
  };
  revenueRecovered: number;
  wonDeals: number;
  rescuedLeads: number;
  webinarJoined: number;
  webinarLeft: number;
  hoursSaved: number;
  hoursNote: string;
  medianResponseMinutes: number | null;
  funnel: FunnelStage[];
  channels: ChannelStat[];
  campaigns: CampaignStat[];
  cohorts: CohortRow[];
  trend: { label: string; value: number }[];
  attributions: Attribution[];
  insights: Insight[];
  timeline: RoiEvent[];
}

export function leadKey(e: Pick<RoiEvent, "leadId" | "contactId" | "dealId">): string {
  if (e.leadId) return `lead:${e.leadId}`;
  if (e.contactId) return `contact:${e.contactId}`;
  if (e.dealId) return `deal:${e.dealId}`;
  return "";
}

function num(v: number | undefined): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function weekStart(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

function pctDelta(current: number, prior: number): number | null {
  if (prior === 0) return current === 0 ? 0 : null;
  return Math.round(((current - prior) / prior) * 100);
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function inRange(iso: string, from: number, to: number): boolean {
  const t = Date.parse(iso);
  return Number.isFinite(t) && t >= from && t < to;
}

/** Estimated minutes a logged AI action saved. A dial that later completes counts once. */
export function minutesSaved(events: RoiEvent[]): number {
  const completed = new Set<string>();
  for (const e of events) {
    if (e.actor === "ai" && e.name === "call.completed") {
      const key = leadKey(e) || e.dedupeKey;
      completed.add(`${key}:${Math.floor(Date.parse(e.occurredAt) / 3_600_000)}`);
    }
  }
  let minutes = 0;
  for (const e of events) {
    if (e.actor !== "ai") continue;
    if (e.name === "ai.action") minutes += SAVED_MINUTES.aiAction;
    else if (e.name === "message.sent") minutes += SAVED_MINUTES.aiMessage;
    else if (e.name === "call.completed") minutes += SAVED_MINUTES.aiCall;
    else if (e.name === "call.dialed") {
      const key = leadKey(e) || e.dedupeKey;
      const hour = Math.floor(Date.parse(e.occurredAt) / 3_600_000);
      if (!completed.has(`${key}:${hour}`)) minutes += SAVED_MINUTES.aiCall;
    }
  }
  return minutes;
}

function snapshot(events: RoiEvent[]): PeriodSnapshot {
  const rescued = rescuedLeadSet(events);
  let revenue = 0;
  let replies = 0;
  let sent = 0;
  let booked = 0;
  let wonDeals = 0;
  for (const e of events) {
    if (e.name === "deal.won") {
      revenue += num(e.revenue);
      wonDeals += 1;
    } else if (e.name === "message.replied") replies += 1;
    else if (e.name === "message.sent" || e.name === "call.dialed") sent += 1;
    else if (e.name === "meeting.booked" || e.name === "webinar.recovered") booked += 1;
  }
  const minutes = minutesSaved(events);
  return {
    revenue,
    replies,
    sent,
    rescued: rescued.size,
    hoursSaved: Math.round((minutes / 60) * 10) / 10,
    booked,
    wonDeals,
  };
}

function rescuedLeadSet(events: RoiEvent[]): Set<string> {
  const leftAt = new Map<string, number>();
  for (const e of events) {
    if (e.name !== "webinar.left") continue;
    const key = leadKey(e);
    if (!key) continue;
    const t = Date.parse(e.occurredAt);
    const prev = leftAt.get(key);
    if (prev === undefined || t < prev) leftAt.set(key, t);
  }
  const rescued = new Set<string>();
  for (const e of events) {
    if (!RESCUE_AFTER.has(e.name)) continue;
    const key = leadKey(e);
    const left = key ? leftAt.get(key) : undefined;
    if (left !== undefined && Date.parse(e.occurredAt) > left) rescued.add(key);
  }
  return rescued;
}

function attribute(events: RoiEvent[]): Attribution[] {
  const byLead = new Map<string, RoiEvent[]>();
  for (const e of events) {
    const key = leadKey(e);
    if (!key) continue;
    const list = byLead.get(key);
    if (list) list.push(e);
    else byLead.set(key, [e]);
  }
  for (const list of byLead.values()) list.sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));

  const positive = new Set<RoiEventName>([
    "message.replied",
    "call.connected",
    "webinar.recovered",
    "meeting.booked",
    "meeting.showed",
    "deal.won",
  ]);

  const out: Attribution[] = [];
  for (const [key, list] of byLead) {
    for (const outcome of list) {
      if (!positive.has(outcome.name)) continue;
      const at = Date.parse(outcome.occurredAt);
      let touch: RoiEvent | undefined;
      for (const e of list) {
        if (!OUTBOUND.has(e.name)) continue;
        const t = Date.parse(e.occurredAt);
        if (t <= at && at - t <= ATTRIBUTION_WINDOW_MS) touch = e;
      }
      out.push({
        outcomeId: outcome.id,
        outcome: outcome.name,
        occurredAt: outcome.occurredAt,
        leadKey: key,
        contactId: outcome.contactId,
        dealId: outcome.dealId,
        leadId: outcome.leadId,
        revenue: outcome.name === "deal.won" ? num(outcome.revenue) : 0,
        touchName: touch?.name,
        channel: touch?.channel ?? outcome.channel,
        campaignId: touch?.campaignId ?? touch?.sequenceId,
        sequenceId: touch?.sequenceId,
        touchAt: touch?.occurredAt,
      });
    }
  }
  return out.sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
}

function responseMinutes(events: RoiEvent[]): number | null {
  const byLead = new Map<string, RoiEvent[]>();
  for (const e of events) {
    if (e.name !== "message.sent" && e.name !== "message.replied") continue;
    const key = leadKey(e);
    if (!key) continue;
    const list = byLead.get(key);
    if (list) list.push(e);
    else byLead.set(key, [e]);
  }
  const gaps: number[] = [];
  for (const list of byLead.values()) {
    list.sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
    let lastSent: number | null = null;
    for (const e of list) {
      const t = Date.parse(e.occurredAt);
      if (e.name === "message.sent") lastSent = t;
      else if (lastSent !== null && t >= lastSent) gaps.push((t - lastSent) / 60_000);
    }
  }
  return median(gaps);
}

function buildInsights(input: {
  current: PeriodSnapshot;
  prior: PeriodSnapshot;
  channels: ChannelStat[];
  webinarLeft: number;
  rescued: number;
  medianResponseMinutes: number | null;
}): Insight[] {
  const insights: Insight[] = [];
  const curRate = input.current.sent > 0 ? input.current.replies / input.current.sent : 0;
  const priorRate = input.prior.sent > 0 ? input.prior.replies / input.prior.sent : 0;
  if (input.current.sent >= 8 && priorRate > 0 && curRate < priorRate * 0.75) {
    insights.push({
      tone: "attention",
      title: "Reply rate dropped",
      detail: `Replies are ${Math.round(curRate * 100)}% of sends this window, down from ${Math.round(priorRate * 100)}% in the one before.`,
      recommendation: "Read the last ten replies and the sends that got silence. Shorten the opener on the channel that fell off.",
    });
  }
  for (const c of input.channels) {
    if (c.cost >= 1 && c.touches >= 5 && c.replies + c.connects === 0) {
      insights.push({
        tone: "attention",
        title: `${c.channel} is spending without a conversation`,
        detail: `${c.touches} touches and ${c.cost.toFixed(2)} in estimated cost, with no reply and no connect.`,
        recommendation: `Pause new ${c.channel} work on the coldest list until a smaller test gets a reply.`,
      });
      break;
    }
  }
  if (input.webinarLeft >= 5 && input.rescued / input.webinarLeft < 0.35) {
    insights.push({
      tone: "attention",
      title: "Webinar drop-off is outrunning recovery",
      detail: `${input.webinarLeft} people left the room and ${input.rescued} came back or booked.`,
      recommendation: "Call the live leave first, then text the rejoin link. The minute after they leave is the one that still has their attention.",
    });
  }
  if (input.medianResponseMinutes !== null && input.medianResponseMinutes > 24 * 60 && input.current.replies >= 3) {
    const hours = Math.round(input.medianResponseMinutes / 60);
    insights.push({
      tone: "attention",
      title: "Responses are landing late",
      detail: `The median gap from send to reply is about ${hours} hours.`,
      recommendation: "Move the first follow-up inside the same business day. A next-morning bump is late for someone who already opened.",
    });
  }
  const best = input.channels.find((c) => c.revenue > 0);
  if (best) {
    insights.push({
      tone: "good",
      title: `${best.channel} is carrying recovered revenue`,
      detail: `${best.deals} won deal${best.deals === 1 ? "" : "s"} attributed to a ${best.channel} touch.`,
      recommendation: `Keep ${best.channel} in the first two steps of the sequences that are winning deals back.`,
    });
  } else if (input.rescued > 0) {
    insights.push({
      tone: "good",
      title: "Webinar recovery is bringing people back",
      detail: `${input.rescued} lead${input.rescued === 1 ? "" : "s"} left and later rejoined, replied, or booked.`,
      recommendation: "Leave the live-leave path on. It is the step that is working.",
    });
  }
  const order = { attention: 0, good: 1 };
  return insights.sort((a, b) => order[a.tone] - order[b.tone]).slice(0, 4);
}

export function computeRoi(
  events: RoiEvent[],
  opts: { now?: Date; windowDays?: number; currency?: string } = {},
): RoiReport {
  const now = opts.now ?? new Date();
  const windowDays = opts.windowDays ?? DEFAULT_WINDOW_DAYS;
  const windowMs = windowDays * 86_400_000;
  const to = now.getTime();
  const from = to - windowMs;
  const priorFrom = from - windowMs;
  const currentEvents = events.filter((e) => inRange(e.occurredAt, from, to));
  const priorEvents = events.filter((e) => inRange(e.occurredAt, priorFrom, from));
  const current = snapshot(currentEvents);
  const prior = snapshot(priorEvents);
  const attributions = attribute(currentEvents);

  const channelMap = new Map<string, ChannelStat>();
  const ensure = (channel: string): ChannelStat => {
    let row = channelMap.get(channel);
    if (!row) {
      row = { channel, touches: 0, replies: 0, connects: 0, clicks: 0, optOuts: 0, cost: 0, revenue: 0, deals: 0 };
      channelMap.set(channel, row);
    }
    return row;
  };
  for (const e of currentEvents) {
    const channel = e.channel ?? "system";
    const row = ensure(channel);
    if (e.name === "message.sent" || e.name === "call.dialed") row.touches += 1;
    if (e.name === "message.replied") row.replies += 1;
    if (e.name === "call.connected") row.connects += 1;
    if (e.name === "message.clicked") row.clicks += 1;
    if (e.name === "message.opt_out" || e.name === "call.opt_out") row.optOuts += 1;
    row.cost += num(e.cost);
  }
  for (const a of attributions) {
    if (a.revenue <= 0) continue;
    const row = ensure(a.channel ?? "system");
    row.revenue += a.revenue;
    row.deals += 1;
  }
  const channels = [...channelMap.values()].sort((a, b) => b.revenue - a.revenue || b.touches - a.touches);

  const campaignMap = new Map<string, CampaignStat>();
  for (const e of currentEvents) {
    const id = e.campaignId || e.sequenceId;
    if (!id) continue;
    if (e.name !== "message.sent" && e.name !== "call.dialed" && e.name !== "message.replied") continue;
    let row = campaignMap.get(id);
    if (!row) {
      row = { id, touches: 0, replies: 0, revenue: 0, deals: 0 };
      campaignMap.set(id, row);
    }
    if (e.name === "message.replied") row.replies += 1;
    else row.touches += 1;
  }
  for (const a of attributions) {
    if (!a.campaignId || a.revenue <= 0) continue;
    let row = campaignMap.get(a.campaignId);
    if (!row) {
      row = { id: a.campaignId, touches: 0, replies: 0, revenue: 0, deals: 0 };
      campaignMap.set(a.campaignId, row);
    }
    row.revenue += a.revenue;
    row.deals += 1;
  }
  const campaigns = [...campaignMap.values()].sort((a, b) => b.revenue - a.revenue || b.touches - a.touches);

  const first = new Map<string, string>();
  const recoveredLeads = new Set<string>();
  for (const e of events) {
    const key = leadKey(e);
    if (!key) continue;
    const prev = first.get(key);
    if (!prev || Date.parse(e.occurredAt) < Date.parse(prev)) first.set(key, e.occurredAt);
  }
  for (const a of attribute(events)) {
    if (a.outcome === "message.replied" || a.outcome === "meeting.booked" || a.outcome === "deal.won" || a.outcome === "webinar.recovered" || a.outcome === "call.connected") {
      recoveredLeads.add(a.leadKey);
    }
  }
  const rescuedAll = rescuedLeadSet(events);
  for (const key of rescuedAll) recoveredLeads.add(key);
  const cohortMap = new Map<string, CohortRow>();
  for (const [key, iso] of first) {
    const week = weekStart(iso);
    if (!week) continue;
    let row = cohortMap.get(week);
    if (!row) {
      row = { week, leads: 0, recovered: 0, revenue: 0, rate: 0 };
      cohortMap.set(week, row);
    }
    row.leads += 1;
    if (recoveredLeads.has(key)) row.recovered += 1;
  }
  for (const a of attribute(events)) {
    if (a.revenue <= 0) continue;
    const start = first.get(a.leadKey);
    if (!start) continue;
    const row = cohortMap.get(weekStart(start));
    if (row) row.revenue += a.revenue;
  }
  const cohorts = [...cohortMap.values()]
    .map((r) => ({ ...r, rate: r.leads ? r.recovered / r.leads : 0 }))
    .sort((a, b) => a.week.localeCompare(b.week))
    .slice(-8);

  const dayMs = 86_400_000;
  const trend: { label: string; value: number }[] = [];
  for (let i = windowDays - 1; i >= 0; i -= Math.max(1, Math.round(windowDays / 8))) {
    const start = to - (i + 1) * dayMs;
    const end = to - i * dayMs;
    const label = new Date(end).toISOString().slice(5, 10);
    const value = currentEvents
      .filter((e) => e.name === "deal.won" && inRange(e.occurredAt, start, end))
      .reduce((s, e) => s + num(e.revenue), 0);
    trend.push({ label, value });
  }

  const touched = new Set<string>();
  const engaged = new Set<string>();
  const replied = new Set<string>();
  const booked = new Set<string>();
  const showed = new Set<string>();
  const won = new Set<string>();
  for (const e of currentEvents) {
    const key = leadKey(e) || e.id;
    if (OUTBOUND.has(e.name)) touched.add(key);
    if (e.name === "message.clicked" || e.name === "call.connected" || e.name === "webinar.joined" || e.name === "webinar.replay_started") engaged.add(key);
    if (e.name === "message.replied") replied.add(key);
    if (e.name === "meeting.booked" || e.name === "webinar.recovered") booked.add(key);
    if (e.name === "meeting.showed") showed.add(key);
    if (e.name === "deal.won") won.add(key);
  }
  const funnel: FunnelStage[] = [
    { label: "Touched", count: touched.size },
    { label: "Engaged", count: engaged.size },
    { label: "Replied", count: replied.size },
    { label: "Booked", count: booked.size },
    { label: "Showed", count: showed.size },
    { label: "Won", count: won.size },
  ];

  const rescued = rescuedLeadSet(currentEvents);
  let webinarJoined = 0;
  let webinarLeft = 0;
  for (const e of currentEvents) {
    if (e.name === "webinar.joined") webinarJoined += 1;
    if (e.name === "webinar.left") webinarLeft += 1;
  }
  const minutes = minutesSaved(currentEvents);
  const hoursSaved = Math.round((minutes / 60) * 10) / 10;
  const insights = buildInsights({
    current,
    prior,
    channels,
    webinarLeft,
    rescued: rescued.size,
    medianResponseMinutes: responseMinutes(currentEvents),
  });

  const timeline = [...currentEvents].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt)).slice(0, 40);

  return {
    currency: opts.currency ?? "USD",
    windowDays,
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    priorFrom: new Date(priorFrom).toISOString(),
    current,
    prior,
    delta: {
      revenue: pctDelta(current.revenue, prior.revenue),
      replies: pctDelta(current.replies, prior.replies),
      rescued: pctDelta(current.rescued, prior.rescued),
      hoursSaved: pctDelta(current.hoursSaved, prior.hoursSaved),
    },
    revenueRecovered: current.revenue,
    wonDeals: current.wonDeals,
    rescuedLeads: rescued.size,
    webinarJoined,
    webinarLeft,
    hoursSaved,
    hoursNote: `Estimated from logged AI actions: ${SAVED_MINUTES.aiMessage} min per message sent, ${SAVED_MINUTES.aiCall} min per call, ${SAVED_MINUTES.aiAction} min per other AI action. A dial that completes in the same hour counts once. This is a workload estimate, not a timesheet.`,
    medianResponseMinutes: responseMinutes(currentEvents),
    funnel,
    channels,
    campaigns,
    cohorts,
    trend,
    attributions,
    insights,
    timeline,
  };
}

export function filterTimeline(events: RoiEvent[], query: string): RoiEvent[] {
  const q = query.trim().toLowerCase();
  if (!q) return events;
  return events
    .filter((e) => {
      const blob = [e.contactId, e.dealId, e.leadId, e.campaignId, e.sequenceId, leadKey(e)].filter(Boolean).join(" ").toLowerCase();
      return blob.includes(q);
    })
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
}
