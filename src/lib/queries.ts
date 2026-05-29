import { getProvider } from "@/lib/crm/registry";
import { cachedOpportunities, cachedPipelines, cachedContacts, cachedUsers } from "@/lib/crm/cached";
import { getConfig } from "@/lib/config";
import { getOrgSettings } from "@/lib/org";
import { getIndustry, recallThresholdsFor } from "@/lib/industries";
import { computeMetrics, type PipelineMetrics } from "@/lib/analytics";
import { buildRecallQueue, summarizeRecall, type RecallItem, type RecallSummary } from "@/lib/recall/engine";
import type { Activity, Contact, Opportunity, Pipeline, Stage, User } from "@/lib/crm/types";

/** Everything the dashboard needs in one round trip. */
export interface Overview {
  orgName: string;
  industryLabel: string;
  providerLabel: string;
  terminology: ReturnType<typeof getIndustry>["terminology"];
  pipeline: Pipeline;
  metrics: PipelineMetrics;
  recall: RecallItem[];
  recallSummary: RecallSummary;
}

export async function getOverview(): Promise<Overview> {
  const provider = getProvider();
  const cfg = getConfig();
  const industry = getIndustry(cfg.industryId);

  const [pipelines, opportunities] = await Promise.all([cachedPipelines(), cachedOpportunities()]);
  const pipeline = pipelines[0];
  const metrics = computeMetrics(opportunities, pipeline);
  const recall = buildRecallQueue(opportunities, pipelines);
  const recallSummary = summarizeRecall(recall, metrics.currency);

  return {
    orgName: cfg.orgName,
    industryLabel: industry.label,
    providerLabel: provider.info().label,
    terminology: industry.terminology,
    pipeline,
    metrics,
    recall,
    recallSummary,
  };
}

export interface BoardData {
  pipeline: Pipeline;
  opportunities: Opportunity[];
  contacts: Map<string, Contact>;
  owners: Map<string, string>;
}

export async function getBoard(): Promise<BoardData> {
  const provider = getProvider();
  const [pipelines, opportunities, contacts, users] = await Promise.all([
    provider.listPipelines(),
    provider.listOpportunities(),
    provider.listContacts(),
    provider.listUsers(),
  ]);
  return {
    pipeline: pipelines[0],
    opportunities,
    contacts: new Map(contacts.map((c) => [c.id, c])),
    owners: new Map(users.map((u) => [u.id, u.name])),
  };
}

export async function getRecallQueue(): Promise<{ items: RecallItem[]; summary: RecallSummary; contacts: Map<string, Contact>; opps: Map<string, Opportunity> }> {
  const provider = getProvider();
  const [pipelines, opportunities, contacts, recent] = await Promise.all([
    provider.listPipelines(),
    provider.listOpportunities(),
    provider.listContacts(),
    provider.listRecentActivities(250).catch(() => [] as Activity[]),
  ]);
  // Group recent activities by opportunity so the engine can route to the
  // channel the buyer replies on and prioritize deals that engaged.
  const activitiesByOpp = new Map<string, Activity[]>();
  for (const a of recent) {
    if (!a.opportunityId) continue;
    const list = activitiesByOpp.get(a.opportunityId) ?? [];
    list.push(a);
    activitiesByOpp.set(a.opportunityId, list);
  }
  const thresholds = recallThresholdsFor((await getOrgSettings()).industryId);
  const items = buildRecallQueue(opportunities, pipelines, activitiesByOpp, thresholds);
  const currency = opportunities[0]?.currency ?? "USD";
  return {
    items,
    summary: summarizeRecall(items, currency),
    contacts: new Map(contacts.map((c) => [c.id, c])),
    opps: new Map(opportunities.map((o) => [o.id, o])),
  };
}

export async function getLeads(): Promise<{ contacts: Contact[]; opps: Map<string, Opportunity>; owners: Map<string, User> }> {
  const provider = getProvider();
  const [contacts, opportunities, users] = await Promise.all([
    provider.listContacts(),
    provider.listOpportunities(),
    provider.listUsers(),
  ]);
  const byContact = new Map<string, Opportunity>();
  for (const o of opportunities) if (!byContact.has(o.contactId)) byContact.set(o.contactId, o);
  return { contacts, opps: byContact, owners: new Map(users.map((u) => [u.id, u])) };
}

export interface CallQueueItem {
  dealId: string;
  contactId: string;
  contactName: string;
  company: string;
  phone: string;
  title: string;
  reason: string;
  score: number;
  recommendation: string;
}

export async function getCallQueue(): Promise<CallQueueItem[]> {
  const provider = getProvider();
  const [pipelines, opps, contacts] = await Promise.all([
    provider.listPipelines(),
    provider.listOpportunities(),
    provider.listContacts(),
  ]);
  const cById = new Map(contacts.map((c) => [c.id, c]));
  const recall = buildRecallQueue(opps, pipelines);
  const items: CallQueueItem[] = [];
  for (const r of recall) {
    const opp = opps.find((o) => o.id === r.opportunityId);
    if (!opp) continue;
    const contact = cById.get(opp.contactId);
    const phone = contact?.points.find((p) => p.channel === "phone")?.value;
    if (!contact || !phone) continue;
    items.push({
      dealId: r.opportunityId,
      contactId: contact.id,
      contactName: contact.name,
      company: contact.company ?? "",
      phone,
      title: r.title,
      reason: r.reason,
      score: r.score,
      recommendation: r.recommendation,
    });
  }
  return items.slice(0, 40);
}

export async function getTeamAndPipeline(): Promise<{ users: User[]; pipeline: Pipeline }> {
  const provider = getProvider();
  const [users, pipelines] = await Promise.all([provider.listUsers(), provider.listPipelines()]);
  return { users, pipeline: pipelines[0] };
}

export interface LeadRow {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  owner: string;
  value: number | null;
  currency: string;
  stage: string;
}

export async function getLeadRows(): Promise<{ rows: LeadRow[]; owners: string[]; valueLabel: string }> {
  const provider = getProvider();
  const [contacts, opps, users, pipelines] = await Promise.all([
    provider.listContacts(),
    provider.listOpportunities(),
    provider.listUsers(),
    provider.listPipelines(),
  ]);
  const userById = new Map(users.map((u) => [u.id, u.name]));
  const stageById = new Map(pipelines.flatMap((p) => p.stages).map((s) => [s.id, s.label]));
  const oppByContact = new Map<string, Opportunity>();
  for (const o of opps) if (!oppByContact.has(o.contactId)) oppByContact.set(o.contactId, o);

  const rows: LeadRow[] = contacts.map((c) => {
    const opp = oppByContact.get(c.id);
    return {
      id: c.id,
      name: c.name,
      company: c.company ?? "",
      email: c.points.find((p) => p.channel === "email")?.value ?? "",
      phone: c.points.find((p) => p.channel === "phone")?.value ?? "",
      owner: opp?.ownerId ? userById.get(opp.ownerId) ?? "—" : "—",
      value: opp?.value ?? null,
      currency: opp?.currency ?? "USD",
      stage: opp ? stageById.get(opp.stageId) ?? "—" : "—",
    };
  });

  return {
    rows,
    owners: [...new Set(rows.map((r) => r.owner).filter((o) => o !== "—"))].sort(),
    valueLabel: getIndustry((await getOrgSettings()).industryId).terminology.value,
  };
}

export interface FeedEntry {
  activity: Activity;
  contactName?: string;
  dealTitle?: string;
}

export async function getActivityFeed(limit = 12): Promise<FeedEntry[]> {
  const provider = getProvider();
  const [activities, contacts, opps] = await Promise.all([
    provider.listRecentActivities(limit),
    cachedContacts(),
    cachedOpportunities(),
  ]);
  const cById = new Map(contacts.map((c) => [c.id, c]));
  const oById = new Map(opps.map((o) => [o.id, o]));
  return activities.map((a) => ({
    activity: a,
    contactName: a.contactId ? cById.get(a.contactId)?.name : undefined,
    dealTitle: a.opportunityId ? oById.get(a.opportunityId)?.title : undefined,
  }));
}

export interface TaskItem {
  id: string;
  title: string;
  dealId: string;
  contactName?: string;
  channel: "call" | "email" | "sms";
  dueInDays: number;
  priority: "high" | "medium" | "low";
  note: string;
}

export async function getTasks(): Promise<TaskItem[]> {
  const provider = getProvider();
  const [pipelines, opps, contacts] = await Promise.all([
    provider.listPipelines(),
    provider.listOpportunities(),
    provider.listContacts(),
  ]);
  const cById = new Map(contacts.map((c) => [c.id, c]));
  const recall = buildRecallQueue(opps, pipelines);
  return recall.slice(0, 25).map((r) => {
    const opp = opps.find((o) => o.id === r.opportunityId);
    return {
      id: `t_${r.opportunityId}`,
      title: r.title,
      dealId: r.opportunityId,
      contactName: opp ? cById.get(opp.contactId)?.name : undefined,
      channel: r.channel,
      dueInDays: r.score >= 75 ? 0 : r.score >= 50 ? 1 : 3,
      priority: r.score >= 75 ? "high" : r.score >= 50 ? "medium" : "low",
      note: r.recommendation,
    };
  });
}

export interface DealDetail {
  opp: Opportunity;
  contact: Contact | null;
  owner: User | null;
  pipeline: Pipeline;
  stage: Stage | undefined;
  activities: Activity[];
  fields: { key: string; label: string }[];
}

export async function getDealDetail(id: string): Promise<DealDetail | null> {
  const provider = getProvider();
  const opp = await provider.getOpportunity(id);
  if (!opp) return null;
  const [pipelines, users, activities, contact] = await Promise.all([
    provider.listPipelines(),
    provider.listUsers(),
    provider.listActivities(id),
    provider.getContact(opp.contactId),
  ]);
  const pipeline = pipelines.find((p) => p.id === opp.pipelineId) ?? pipelines[0];
  const stage = pipeline.stages.find((s) => s.id === opp.stageId);
  const industry = getIndustry((await getOrgSettings()).industryId);
  return {
    opp,
    contact,
    owner: users.find((u) => u.id === opp.ownerId) ?? null,
    pipeline,
    stage,
    activities,
    fields: industry.fields.map((f) => ({ key: f.key, label: f.label })),
  };
}

export interface ContactDetail {
  contact: Contact;
  deals: Opportunity[];
  activities: Activity[];
}

export async function getContactDetail(id: string): Promise<ContactDetail | null> {
  const provider = getProvider();
  const contact = await provider.getContact(id);
  if (!contact) return null;
  const opps = await provider.listOpportunities();
  const deals = opps.filter((o) => o.contactId === id);
  const activityLists = await Promise.all(deals.map((d) => provider.listActivities(d.id)));
  const activities = activityLists.flat().sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
  return { contact, deals, activities };
}

export interface InboxMessage {
  id: string;
  channel: string;
  direction: "inbound" | "outbound";
  body: string;
  at: string;
}

export interface InboxThread {
  contactId: string;
  contactName: string;
  company: string;
  channel: string;
  lastAt: string;
  snippet: string;
  unread: boolean;
  messages: InboxMessage[];
}

export async function getInbox(): Promise<InboxThread[]> {
  const provider = getProvider();
  const [contacts, opps] = await Promise.all([provider.listContacts(), provider.listOpportunities()]);
  const cById = new Map(contacts.map((c) => [c.id, c]));
  const oppsByContact = new Map<string, string>();
  for (const o of opps) if (!oppsByContact.has(o.contactId)) oppsByContact.set(o.contactId, o.id);

  const threads: InboxThread[] = [];
  for (const [contactId, oppId] of oppsByContact) {
    const contact = cById.get(contactId);
    if (!contact) continue;
    const acts = (await provider.listActivities(oppId)).filter((a) => ["email", "sms", "call", "note"].includes(a.kind));
    if (acts.length === 0) continue;
    const messages: InboxMessage[] = acts
      .slice()
      .reverse()
      .map((a) => ({ id: a.id, channel: a.kind, direction: a.direction ?? "outbound", body: a.summary, at: a.occurredAt }));
    const last = acts[0];
    threads.push({
      contactId,
      contactName: contact.name,
      company: contact.company ?? "",
      channel: last.kind,
      lastAt: last.occurredAt,
      snippet: last.summary,
      unread: last.direction === "inbound",
      messages,
    });
  }
  return threads.sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1)).slice(0, 20);
}

export interface CalendarEvent {
  date: string;
  title: string;
  type: "close" | "task" | "meeting";
  dealId?: string;
}

export async function getCalendar(): Promise<{ events: CalendarEvent[] }> {
  const provider = getProvider();
  const [pipelines, opps] = await Promise.all([provider.listPipelines(), provider.listOpportunities()]);
  const stageById = new Map(pipelines.flatMap((p) => p.stages).map((s) => [s.id, s]));
  const events: CalendarEvent[] = [];
  const now = Date.now();
  const horizon = now + 45 * 86400000;

  for (const o of opps) {
    const stage = stageById.get(o.stageId);
    if (stage?.type !== "open") continue;
    if (o.expectedCloseAt) {
      const t = new Date(o.expectedCloseAt).getTime();
      if (t >= now && t <= horizon) events.push({ date: o.expectedCloseAt, title: `Target close · ${o.title}`, type: "close", dealId: o.id });
    }
  }

  const recall = buildRecallQueue(opps, pipelines).slice(0, 12);
  recall.forEach((r, i) => {
    const d = new Date(now + (r.score >= 75 ? 0 : r.score >= 50 ? 1 : 3 + (i % 5)) * 86400000);
    events.push({ date: d.toISOString(), title: `Follow up · ${r.title}`, type: "task", dealId: r.opportunityId });
  });

  events.sort((a, b) => (a.date < b.date ? -1 : 1));
  return { events };
}

export interface Forecast {
  currency: string;
  quota: number;
  commit: number;
  bestCase: number;
  pipeline: number;
  weighted: number;
  categories: { label: string; value: number; count: number; color: string }[];
  byStage: { label: string; value: number; weighted: number; count: number }[];
}

export async function getForecast(): Promise<Forecast> {
  const provider = getProvider();
  const [pipelines, opps, org] = await Promise.all([provider.listPipelines(), provider.listOpportunities(), getOrgSettings()]);
  const pipeline = pipelines[0];
  const stageById = new Map(pipeline.stages.map((s) => [s.id, s]));
  const currency = org.currency;

  let commit = 0;
  let bestCase = 0;
  let pipelineVal = 0;
  let weighted = 0;
  const open = opps.filter((o) => stageById.get(o.stageId)?.type === "open");
  for (const o of open) {
    const p = stageById.get(o.stageId)!.probability;
    weighted += o.value * p;
    if (p >= 0.8) commit += o.value;
    else if (p >= 0.5) bestCase += o.value;
    else pipelineVal += o.value;
  }

  const byStage = pipeline.stages
    .filter((s) => s.type === "open")
    .map((s) => {
      const items = open.filter((o) => o.stageId === s.id);
      const value = items.reduce((sum, o) => sum + o.value, 0);
      return { label: s.label, value, weighted: Math.round(value * s.probability), count: items.length };
    });

  return {
    currency,
    quota: org.monthlyQuota,
    commit: Math.round(commit),
    bestCase: Math.round(bestCase),
    pipeline: Math.round(pipelineVal),
    weighted: Math.round(weighted),
    categories: [
      { label: "Commit (≥80%)", value: Math.round(commit), count: open.filter((o) => stageById.get(o.stageId)!.probability >= 0.8).length, color: "#34d399" },
      { label: "Best case (50–79%)", value: Math.round(bestCase), count: open.filter((o) => { const p = stageById.get(o.stageId)!.probability; return p >= 0.5 && p < 0.8; }).length, color: "#5b8cff" },
      { label: "Pipeline (<50%)", value: Math.round(pipelineVal), count: open.filter((o) => stageById.get(o.stageId)!.probability < 0.5).length, color: "#8a93a6" },
    ],
    byStage,
  };
}

export interface Reports {
  currency: string;
  metrics: PipelineMetrics;
  funnel: { label: string; value: number; count: number }[];
  sources: { label: string; value: number; color: string }[];
  monthlyWon: { label: string; value: number }[];
  leaderboard: { name: string; won: number; value: number; openValue: number }[];
}

const PALETTE = ["#5b8cff", "#34d399", "#fbbf24", "#f87171", "#a78bfa", "#22d3ee", "#fb923c", "#94a3b8"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export async function getReports(): Promise<Reports> {
  const provider = getProvider();
  const [pipelines, opps, users] = await Promise.all([
    cachedPipelines(),
    cachedOpportunities(),
    cachedUsers(),
  ]);
  const pipeline = pipelines[0];
  const metrics = computeMetrics(opps, pipeline);

  const funnel = pipeline.stages
    .filter((s) => s.type !== "lost")
    .map((s) => {
      const bucket = metrics.buckets.find((b) => b.stage.id === s.id);
      return { label: s.label, value: bucket?.value ?? 0, count: bucket?.count ?? 0 };
    });

  const sourceMap = new Map<string, number>();
  for (const o of opps) sourceMap.set(o.source ?? "Unknown", (sourceMap.get(o.source ?? "Unknown") ?? 0) + 1);
  const sources = [...sourceMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, value], i) => ({ label, value, color: PALETTE[i % PALETTE.length] }));

  const wonByMonth = new Map<string, number>();
  for (const o of opps) {
    if (!o.closedAt) continue;
    const stage = pipeline.stages.find((s) => s.id === o.stageId);
    if (stage?.type !== "won") continue;
    const d = new Date(o.closedAt);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    wonByMonth.set(key, (wonByMonth.get(key) ?? 0) + o.value);
  }
  const monthlyWon: { label: string; value: number }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthlyWon.push({ label: MONTHS[d.getMonth()], value: Math.round(wonByMonth.get(`${d.getFullYear()}-${d.getMonth()}`) ?? 0) });
  }

  const board = new Map<string, { won: number; value: number; openValue: number }>();
  for (const u of users) board.set(u.id, { won: 0, value: 0, openValue: 0 });
  for (const o of opps) {
    if (!o.ownerId) continue;
    const row = board.get(o.ownerId);
    if (!row) continue;
    const stage = pipeline.stages.find((s) => s.id === o.stageId);
    if (stage?.type === "won") {
      row.won += 1;
      row.value += o.value;
    } else if (stage?.type === "open") {
      row.openValue += o.value;
    }
  }
  const leaderboard = users
    .map((u) => ({ name: u.name, ...board.get(u.id)! }))
    .sort((a, b) => b.value - a.value);

  return { currency: metrics.currency, metrics, funnel, sources, monthlyWon, leaderboard };
}
