import { resolveProvider } from "@/lib/crm/registry";
import { cachedOpportunities, cachedPipelines, cachedContacts, cachedUsers } from "@/lib/crm/cached";
import { getConfig } from "@/lib/config";
import { getOrgSettings } from "@/lib/org";
import { getIndustry, recallThresholdsFor } from "@/lib/industries";
import { computeMetrics, type PipelineMetrics } from "@/lib/analytics";
import { buildRecallQueue, summarizeRecall, computeRecallOutcomes, recallByOwner, wonBackDeals, type RecallItem, type RecallSummary, type RecallOutcomes, type WonBackDeal } from "@/lib/recall/engine";
import { MAX_CALL_ATTEMPTS } from "@/lib/calls/retry";
import { hasOptedOut } from "@/lib/agent/guardrails";
import { listEnrollments } from "@/lib/cadence";
import { listRecallTouches, earliestTouchByDeal, touchesByWeek } from "@/lib/recall/events";
import { listSnoozedOppIds } from "@/lib/recall/snooze";
import type { Activity, Contact, Opportunity, Pipeline, Stage, User } from "@/lib/crm/types";
import { normalizeLeadStatus, type LeadStatus } from "@/lib/crm/lead-status";

/**
 * Guarantee a usable pipeline. A provider can legitimately return zero pipelines
 * (an empty HTTP-CRM endpoint, a transient read, a freshly-connected source), and
 * the dashboard/board/analytics all assume `pipelines[0]` exists — passing
 * undefined into them throws "Cannot read properties of undefined". Falling back
 * to the active industry's template pipeline (always non-empty) keeps every
 * surface rendering instead of white-screening.
 */
export function safePipeline(pipelines: Pipeline[]): Pipeline {
  return pipelines[0] ?? (getIndustry(getConfig().industryId).pipeline as Pipeline);
}

/** Pipelines with the safe fallback guaranteed present as the first entry. */
function safePipelines(pipelines: Pipeline[]): Pipeline[] {
  return pipelines.length > 0 ? pipelines : [safePipeline(pipelines)];
}

/** Outbound calls logged so far in the local calendar day. The dial-pace pulse:
 *  every dial is an outbound "call" activity (real calls AND one-tap no-connect
 *  outcomes from the power dialer both log one), so this counts the rep's dials
 *  today against the volume the plan sells. Exported for tests. */
export function countDialsToday(activities: Activity[], now: Date = new Date()): number {
  const today = now.toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
  let n = 0;
  for (const a of activities) {
    if (a.kind !== "call" || a.direction !== "outbound" || !a.occurredAt) continue;
    if (new Date(a.occurredAt).toLocaleDateString("en-CA") === today) n++;
  }
  return n;
}

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
  /** Outbound dials logged today (real + one-tap no-connects). */
  dialsToday: number;
}

export async function getOverview(): Promise<Overview> {
  const provider = (await resolveProvider());
  const cfg = getConfig();
  const industry = getIndustry(cfg.industryId);

  const [rawPipelines, opportunities, recent] = await Promise.all([
    cachedPipelines(),
    cachedOpportunities(),
    provider.listRecentActivities(250).catch(() => [] as Activity[]),
  ]);
  const pipelines = safePipelines(rawPipelines);
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
    dialsToday: countDialsToday(recent),
  };
}

export interface BoardData {
  pipeline: Pipeline;
  opportunities: Opportunity[];
  contacts: Map<string, Contact>;
  owners: Map<string, string>;
}

export async function getBoard(): Promise<BoardData> {
  const provider = (await resolveProvider());
  const [pipelines, opportunities, contacts, users] = await Promise.all([
    provider.listPipelines(),
    provider.listOpportunities(),
    provider.listContacts(),
    provider.listUsers(),
  ]);
  return {
    pipeline: safePipeline(pipelines),
    opportunities,
    contacts: new Map(contacts.map((c) => [c.id, c])),
    owners: new Map(users.map((u) => [u.id, u.name])),
  };
}

export async function getRecallQueue(): Promise<{ items: RecallItem[]; summary: RecallSummary; contacts: Map<string, Contact>; opps: Map<string, Opportunity> }> {
  const provider = (await resolveProvider());
  // Route the no-arg list reads through the request-cache so a dashboard render
  // (overview + recall + feed) shares one fetch each instead of re-reading all
  // contacts/opps per helper. listRecentActivities is parameterized, so direct.
  const [pipelines, opportunities, contacts, recent] = await Promise.all([
    cachedPipelines(),
    cachedOpportunities(),
    cachedContacts(),
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
  const cById = new Map(contacts.map((c) => [c.id, c]));
  const oppById = new Map(opportunities.map((o) => [o.id, o]));
  // Per-contact activities for the opt-out check.
  const actsByContact = new Map<string, Activity[]>();
  for (const a of recent) {
    if (!a.contactId) continue;
    const list = actsByContact.get(a.contactId);
    if (list) list.push(a);
    else actsByContact.set(a.contactId, [a]);
  }
  // Never surface an opted-out contact in the recall worklist.
  const live = dropOptedOutRecall(buildRecallQueue(opportunities, pipelines, activitiesByOpp, thresholds), oppById, cById, actsByContact);
  // Drop deals the user has snoozed (graceful: empty set without a DB / table).
  const snoozed = await listSnoozedOppIds();
  const items = snoozed.size ? live.filter((it) => !snoozed.has(it.opportunityId)) : live;
  const currency = opportunities[0]?.currency ?? "USD";
  return { items, summary: summarizeRecall(items, currency), contacts: cById, opps: oppById };
}

/** Drop recall items whose contact has opted out / is do-not-contact. Pure. */
export function dropOptedOutRecall(
  items: RecallItem[],
  oppById: Map<string, Opportunity>,
  cById: Map<string, Contact>,
  actsByContact: Map<string, Activity[]>,
): RecallItem[] {
  return items.filter((it) => {
    const opp = oppById.get(it.opportunityId);
    if (!opp) return true;
    const contact = cById.get(opp.contactId);
    if (!contact) return true;
    return !hasOptedOut(contact, opp, actsByContact.get(opp.contactId) ?? []);
  });
}

/** Recall ROI — did re-engaging cold/lost deals actually win them back? */
export async function getRecallOutcomes(): Promise<RecallOutcomes> {
  const provider = (await resolveProvider());
  const [pipelines, opportunities, enrollments, touches] = await Promise.all([
    provider.listPipelines(),
    provider.listOpportunities(),
    listEnrollments(undefined, 1000),
    listRecallTouches(),
  ]);
  const stages = new Map(pipelines.flatMap((p) => p.stages).map((s) => [s.id, s]));
  const oppById = new Map(opportunities.map((o) => [o.id, o]));
  return computeRecallOutcomes(enrollments, oppById, stages, opportunities[0]?.currency ?? "USD", earliestTouchByDeal(touches));
}

/** Won-back deals plus resolved owner names — the case-study proof export. */
export async function getWonBackDeals(): Promise<Array<WonBackDeal & { ownerName: string }>> {
  const provider = await resolveProvider();
  const [pipelines, opportunities, users, enrollments, touches] = await Promise.all([
    provider.listPipelines(),
    provider.listOpportunities(),
    provider.listUsers(),
    listEnrollments(undefined, 1000),
    listRecallTouches(),
  ]);
  const stages = new Map(pipelines.flatMap((p) => p.stages).map((s) => [s.id, s]));
  const oppById = new Map(opportunities.map((o) => [o.id, o]));
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  return wonBackDeals(enrollments, oppById, stages, earliestTouchByDeal(touches)).map((d) => ({
    ...d,
    ownerName: (d.ownerId && nameById.get(d.ownerId)) || "Unassigned",
  }));
}

export async function getLeads(): Promise<{ contacts: Contact[]; opps: Map<string, Opportunity>; owners: Map<string, User> }> {
  const provider = (await resolveProvider());
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
  /** Prior outbound call attempts to this contact (so the dialer shows "#N"). */
  attempts: number;
}

export async function getCallQueue(): Promise<CallQueueItem[]> {
  const provider = (await resolveProvider());
  const [pipelines, opps, contacts, recent] = await Promise.all([
    provider.listPipelines(),
    provider.listOpportunities(),
    provider.listContacts(),
    provider.listRecentActivities(500).catch(() => [] as Activity[]),
  ]);
  const cById = new Map(contacts.map((c) => [c.id, c]));
  // Group recent activities by contact for both the attempt count AND the
  // opt-out check below, so we never dial someone who told us to stop.
  const actsByContact = new Map<string, Activity[]>();
  const callAttempts = new Map<string, number>();
  for (const a of recent) {
    if (!a.contactId) continue;
    const list = actsByContact.get(a.contactId);
    if (list) list.push(a);
    else actsByContact.set(a.contactId, [a]);
    if (a.kind === "call" && a.direction === "outbound") {
      callAttempts.set(a.contactId, (callAttempts.get(a.contactId) ?? 0) + 1);
    }
  }
  const recall = buildRecallQueue(opps, pipelines);
  const items: CallQueueItem[] = [];
  const queuedContacts = new Set<string>();
  for (const r of recall) {
    const opp = opps.find((o) => o.id === r.opportunityId);
    if (!opp) continue;
    const contact = cById.get(opp.contactId);
    const phone = contact?.points.find((p) => p.channel === "phone")?.value;
    if (!contact || !phone) continue;
    // One card per PERSON: a contact with several slipping deals shouldn't appear
    // multiple times (and shouldn't multiply their per-contact attempt budget).
    // buildRecallQueue is score-sorted, so the first hit is their best deal.
    if (queuedContacts.has(contact.id)) continue;
    // Never queue a contact who's opted out / is marked do-not-contact.
    if (hasOptedOut(contact, opp, actsByContact.get(contact.id) ?? [])) continue;
    const attempts = callAttempts.get(contact.id) ?? 0;
    if (attempts >= MAX_CALL_ATTEMPTS) continue; // exhausted by phone — pivot to another channel
    queuedContacts.add(contact.id);
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
      attempts,
    });
  }
  return items.slice(0, 40);
}

export async function getTeamAndPipeline(): Promise<{ users: User[]; pipeline: Pipeline }> {
  const provider = (await resolveProvider());
  const [users, pipelines] = await Promise.all([provider.listUsers(), provider.listPipelines()]);
  return { users, pipeline: safePipeline(pipelines) };
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
  /** Editable sales lifecycle status (new/working/qualified/…), from attributes. */
  status?: LeadStatus;
}

export async function getLeadRows(): Promise<{ rows: LeadRow[]; owners: string[]; valueLabel: string }> {
  const provider = (await resolveProvider());
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
      status: normalizeLeadStatus(c.attributes?.status),
    };
  });

  return {
    rows,
    owners: [...new Set(rows.map((r) => r.owner).filter((o) => o !== "—"))].sort(),
    valueLabel: getIndustry((await getOrgSettings()).industryId).terminology.value,
  };
}

export interface CaptureRow {
  dealId: string;
  title: string;
  contactName: string;
  source: string;
  value: number;
  currency: string;
  at: string;
}

/** Recent deals created through the Lead Capture API or the embeddable form —
 *  a "proof it's working" feed for the Developer settings tab. */
export async function getRecentCaptures(limit = 8): Promise<CaptureRow[]> {
  const provider = (await resolveProvider());
  const [opps, contacts] = await Promise.all([provider.listOpportunities(), provider.listContacts()]);
  const nameById = new Map(contacts.map((c) => [c.id, c.name]));
  const SOURCES = new Set(["API", "Web form"]);
  return opps
    .filter((o) => o.source != null && SOURCES.has(o.source))
    .sort((a, b) => ((a.createdAt ?? "") < (b.createdAt ?? "") ? 1 : -1))
    .slice(0, limit)
    .map((o) => ({
      dealId: o.id,
      title: o.title,
      contactName: nameById.get(o.contactId) ?? "—",
      source: o.source ?? "",
      value: o.value,
      currency: o.currency,
      at: o.createdAt ?? "",
    }));
}

export interface FeedEntry {
  activity: Activity;
  contactName?: string;
  dealTitle?: string;
}

export async function getActivityFeed(limit = 12): Promise<FeedEntry[]> {
  const provider = (await resolveProvider());
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
  const provider = (await resolveProvider());
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
  const provider = (await resolveProvider());
  const opp = await provider.getOpportunity(id);
  if (!opp) return null;
  const [pipelines, users, activities, contact] = await Promise.all([
    provider.listPipelines(),
    provider.listUsers(),
    provider.listActivities(id),
    provider.getContact(opp.contactId),
  ]);
  const pipeline = pipelines.find((p) => p.id === opp.pipelineId) ?? safePipeline(pipelines);
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
  const provider = (await resolveProvider());
  const contact = await provider.getContact(id);
  if (!contact) return null;
  const opps = await provider.listOpportunities();
  const deals = opps.filter((o) => o.contactId === id);
  // Prefer a single contact-scoped activity query (Supabase + built-in implement
  // it) over one listActivities call per deal — avoids N+1 on contacts with many
  // deals, and also surfaces contact-direct activity (e.g. inbound DMs) that has
  // no deal. Falls back to the per-deal fan-out for providers without it.
  const activities = (
    provider.listActivitiesByContact
      ? await provider.listActivitiesByContact(id)
      : (await Promise.all(deals.map((d) => provider.listActivities(d.id)))).flat()
  ).sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
  return { contact, deals, activities };
}

export interface InboxMessage {
  id: string;
  channel: string;
  direction: "inbound" | "outbound";
  body: string;
  at: string;
}

/** The contact's most relevant deal, shown inline so a rep has context without
 *  leaving the thread. Open deals win over closed; ties break on value. */
export interface InboxDeal {
  dealId: string;
  title: string;
  stage: string;
  stageType: Stage["type"];
  value: number;
  currency: string;
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
  /** The contact's primary deal, if they have one (contact-only DMs won't). */
  deal?: InboxDeal;
}

const INBOX_MESSAGE_KINDS = ["email", "sms", "call", "note"];

/**
 * Social DMs are logged as kind:"note" with a "[Platform]" prefix on the summary
 * (see lib/social/ingest). Pull the platform back out so the inbox shows the real
 * channel (WhatsApp, Instagram, …) and a clean message body without the tag.
 */
function parseInboxChannel(a: Activity): { channel: string; body: string } {
  if (a.kind === "note") {
    const m = a.summary.match(/^\[([A-Za-z]+)\]\s*([\s\S]*)$/);
    if (m) return { channel: m[1].toLowerCase(), body: m[2] };
  }
  return { channel: a.kind, body: a.summary };
}

function buildInboxThread(contact: Contact, acts: Activity[], deal?: InboxDeal): InboxThread | null {
  const msgs = acts.filter((a) => INBOX_MESSAGE_KINDS.includes(a.kind));
  if (msgs.length === 0) return null;
  const newestFirst = msgs.slice().sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
  const last = newestFirst[0];
  const lastParsed = parseInboxChannel(last);
  const messages: InboxMessage[] = newestFirst
    .slice()
    .reverse()
    .map((a) => {
      const p = parseInboxChannel(a);
      return { id: a.id, channel: p.channel, direction: a.direction ?? "outbound", body: p.body, at: a.occurredAt };
    });
  return {
    contactId: contact.id,
    contactName: contact.name,
    company: contact.company ?? "",
    channel: lastParsed.channel,
    lastAt: last.occurredAt,
    snippet: lastParsed.body,
    unread: last.direction === "inbound",
    messages,
    deal,
  };
}

/** Pick a contact's primary deal for inbox context: open deals first, then by
 *  value. Returns undefined for contacts with no deal (e.g. inbound DMs). */
export function pickInboxDeal(opps: Opportunity[], stages: Map<string, Stage>): InboxDeal | undefined {
  if (opps.length === 0) return undefined;
  const best = opps
    .slice()
    .sort((a, b) => {
      const aOpen = stages.get(a.stageId)?.type === "open" ? 1 : 0;
      const bOpen = stages.get(b.stageId)?.type === "open" ? 1 : 0;
      if (aOpen !== bOpen) return bOpen - aOpen;
      return b.value - a.value;
    })[0];
  const stage = stages.get(best.stageId);
  return {
    dealId: best.id,
    title: best.title,
    stage: stage?.label ?? "",
    stageType: stage?.type ?? "open",
    value: best.value,
    currency: best.currency,
  };
}

/**
 * Unified inbox across every channel — email, SMS, calls, and all social DMs.
 *
 * Built from recent activities grouped by contact (one query, not one per deal),
 * so it scales and naturally includes inbound social DMs that created a contact
 * but no deal yet. Every activity carries contactId, so deal-linked and
 * contact-only messages land in the same thread.
 */
export async function getInbox(): Promise<InboxThread[]> {
  const provider = (await resolveProvider());
  const [contacts, acts, opportunities, pipelines] = await Promise.all([
    provider.listContacts(),
    provider.listRecentActivities(500),
    provider.listOpportunities(),
    provider.listPipelines(),
  ]);
  const cById = new Map(contacts.map((c) => [c.id, c]));
  const stages = new Map(pipelines.flatMap((p) => p.stages).map((s) => [s.id, s]));
  const oppsByContact = new Map<string, Opportunity[]>();
  for (const o of opportunities) {
    const list = oppsByContact.get(o.contactId);
    if (list) list.push(o);
    else oppsByContact.set(o.contactId, [o]);
  }

  const byContact = new Map<string, Activity[]>();
  for (const a of acts) {
    if (!a.contactId || !INBOX_MESSAGE_KINDS.includes(a.kind)) continue;
    const list = byContact.get(a.contactId);
    if (list) list.push(a);
    else byContact.set(a.contactId, [a]);
  }

  const threads: InboxThread[] = [];
  for (const [contactId, list] of byContact) {
    const contact = cById.get(contactId);
    if (!contact) continue;
    const t = buildInboxThread(contact, list, pickInboxDeal(oppsByContact.get(contactId) ?? [], stages));
    if (t) threads.push(t);
  }
  return threads.sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1)).slice(0, 20);
}

export interface CalendarEvent {
  date: string;
  /** End instant for events with real duration (booked meetings). */
  end?: string;
  title: string;
  type: "close" | "task" | "meeting";
  dealId?: string;
}

export async function getCalendar(): Promise<{ events: CalendarEvent[] }> {
  const provider = (await resolveProvider());
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

  // Booked meetings from the native booking page — real commitments, so they
  // outrank derived events. Best-effort: without a DB there are simply none.
  const bookings = await import("@/lib/meetings/store")
    .then((m) => m.listBookings({ upcomingOnly: true, limit: 50 }))
    .catch(() => []);
  for (const b of bookings) {
    events.push({ date: b.startsAt, end: b.endsAt, title: `Meeting · ${b.meetingName} — ${b.inviteeName}`, type: "meeting", dealId: b.dealId ?? undefined });
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
  const provider = (await resolveProvider());
  const [pipelines, opps, org] = await Promise.all([provider.listPipelines(), provider.listOpportunities(), getOrgSettings()]);
  const pipeline = safePipeline(pipelines);
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
  /** Who's letting the most recoverable revenue slip (recall queue, per owner). */
  recallByOwner: { name: string; atRisk: number; recoverableValue: number }[];
  /** Org-wide recall ROI (recalled → re-engaged → won back). */
  recallOutcomes: RecallOutcomes;
  /** Recall outreach volume over the last 6 weeks. */
  recallTrend: { label: string; value: number }[];
}

const PALETTE = ["#5b8cff", "#34d399", "#fbbf24", "#f87171", "#a78bfa", "#22d3ee", "#fb923c", "#94a3b8"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export async function getReports(): Promise<Reports> {
  const provider = (await resolveProvider());
  const [pipelines, opps, users] = await Promise.all([
    cachedPipelines(),
    cachedOpportunities(),
    cachedUsers(),
  ]);
  const pipeline = safePipeline(pipelines);
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

  // Recall: revenue slipping per owner + org-wide recall ROI.
  const thresholds = recallThresholdsFor((await getOrgSettings()).industryId);
  const recallItems = buildRecallQueue(opps, pipelines, undefined, thresholds);
  const ownerByOpp = new Map(opps.map((o) => [o.id, o.ownerId]));
  const userName = new Map(users.map((u) => [u.id, u.name]));
  const recallOwners = recallByOwner(recallItems, (oppId) => ownerByOpp.get(oppId)).map((s) => ({
    name: s.ownerId === "unassigned" ? "Unassigned" : userName.get(s.ownerId) ?? "Unknown",
    atRisk: s.atRisk,
    recoverableValue: s.recoverableValue,
  }));
  const stagesById = new Map(pipelines.flatMap((p) => p.stages).map((s) => [s.id, s]));
  const [enrollments, touches] = await Promise.all([listEnrollments(undefined, 1000), listRecallTouches()]);
  const recallOutcomes = computeRecallOutcomes(enrollments, new Map(opps.map((o) => [o.id, o])), stagesById, metrics.currency, earliestTouchByDeal(touches));
  const recallTrend = touchesByWeek(touches);

  return { currency: metrics.currency, metrics, funnel, sources, monthlyWon, leaderboard, recallByOwner: recallOwners, recallOutcomes, recallTrend };
}
