import { placeCall, sendEmail, sendSms, type SendResult } from "@/lib/comms";
import { signCallMeta } from "@/lib/calls/meta-sig";
import { draftReply } from "@/lib/ai/reply";
import { sendAlert } from "@/lib/alert";
import { logError, logInfo, errMessage } from "@/lib/log";
import { getOrgOverride } from "@/lib/supabase/org-context";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { webinarArmed, webinarConfig } from "@/lib/webinar/config";
import { gateAction } from "@/lib/webinar/compliance";
import { callContext, callOpener, emailContent, optOutConfirmation, smsBody, voicemailScript } from "@/lib/webinar/copy";
import { applyEvent, applySessionEnded, blankRegistrant, type MachineResult } from "@/lib/webinar/machine";
import { classifyCallOutcome, hashKey } from "@/lib/webinar/outcomes";
import {
  claimEvent,
  findRegistrant,
  forgetEvent,
  getRegistrant,
  getSession,
  listByIdentity,
  listDue,
  listSession,
  saveRegistrant,
  upsertSession,
  webinarCounts,
} from "@/lib/webinar/store";
import { leadTimezone, localDay, normalizeEmail, phoneDigits } from "@/lib/webinar/time";
import { sweepPresence } from "@/lib/webinar/presence";
import { demioReportToEvents } from "@/lib/webinar/normalize";
import type { CallClass, CanonicalEvent, RecoveryAction, WebinarConfig, WebinarRegistrant, WebinarSession } from "@/lib/webinar/types";

export interface DispatchRecord {
  stepId: string;
  channel: string;
  status: "sent" | "skipped" | "failed" | "deferred";
  detail?: string;
  latencyMs?: number;
}

export interface IngestResult {
  duplicate?: boolean;
  ignored?: string;
  registrantId?: string;
  state?: string;
  dispatched: DispatchRecord[];
  /** Wall clock from event receipt to the moment the live-leave call is initiated. */
  latencyMs?: number;
}

export interface WebinarPorts {
  now(): Date;
  placeCall(input: { to: string; opener: string; voicemail?: string; context: string; meta: Record<string, string> }): Promise<{ ok: boolean; id?: string; detail?: string }>;
  sendSms(input: { to: string; body: string }): Promise<{ ok: boolean; id?: string; detail?: string }>;
  sendEmail(input: { to: string; subject: string; body: string }): Promise<{ ok: boolean; id?: string; detail?: string }>;
  reply(input: { channel: "sms" | "email"; name: string; incoming: string; title: string }): Promise<{ body: string; subject?: string }>;
  alert(event: string, detail: Record<string, unknown>): Promise<void>;
}

let portsOverride: WebinarPorts | null = null;

/** Tests inject transports here. Production leaves this unset. */
export function __setWebinarPortsForTests(next: WebinarPorts | null): void {
  portsOverride = next;
}

function mapSend(r: SendResult): { ok: boolean; id?: string; detail?: string } {
  // "logged" means no provider is connected — the touch never left the process.
  if (r.status === "failed" || r.status === "logged") {
    return { ok: false, id: r.id, detail: r.status === "logged" ? "provider_not_configured" : r.detail };
  }
  return { ok: true, id: r.id };
}

function defaultPorts(): WebinarPorts {
  return {
    now: () => new Date(),
    async placeCall(input) {
      const r = await placeCall(input.to, {
        opener: input.opener,
        voicemail: input.voicemail,
        context: input.context,
        meta: signCallMeta(input.meta),
      });
      return mapSend(r);
    },
    async sendSms(input) {
      return mapSend(await sendSms(input.to, input.body));
    },
    async sendEmail(input) {
      return mapSend(await sendEmail(input.to, input.subject, input.body));
    },
    async reply(input) {
      const drafted = await draftReply({
        channel: input.channel,
        contactName: input.name || "there",
        dealTitle: input.title,
        incoming: input.incoming,
      });
      return { body: drafted.body, subject: drafted.subject };
    },
    alert: (event, detail) => sendAlert(event, detail),
  };
}

function activePorts(): WebinarPorts {
  return portsOverride ?? defaultPorts();
}

const tails = new Map<string, Promise<unknown>>();

function lock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = tails.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn);
  tails.set(key, run.then(() => undefined, () => undefined));
  return run;
}

export async function resolveWebinarOrg(explicit?: string | null): Promise<string | null> {
  if (explicit) return explicit;
  const override = getOrgOverride();
  if (override) return override;
  if (process.env.DEFAULT_ORG_ID) return process.env.DEFAULT_ORG_ID;
  if (!isSupabaseConfigured()) return "local";
  return resolveActiveOrgId();
}

export function registrantKey(sessionId: string, hint: { email?: string; phone?: string; id?: string }): string {
  const email = normalizeEmail(hint.email);
  if (email) return `${sessionId}:e:${email}`;
  const phone = phoneDigits(hint.phone);
  if (phone) return `${sessionId}:p:${phone}`;
  if (hint.id) return `${sessionId}:id:${hint.id}`;
  return `${sessionId}:anon`;
}

async function commit(orgId: string, reg: WebinarRegistrant, expected: number, before: string): Promise<boolean> {
  if (JSON.stringify(reg) === before) return true;
  return saveRegistrant(orgId, reg, expected);
}

/**
 * Apply one canonical event and dispatch anything due immediately. The
 * live-leave call is placed before this returns — that is the latency path.
 */
export async function ingestWebinarEvent(orgId: string, event: CanonicalEvent, receivedAt = Date.now()): Promise<IngestResult> {
  const claimed = await claimEvent(orgId, event.dedupeKey);
  if (!claimed) return { duplicate: true, dispatched: [] };
  try {
    const hint = event.registrant;
    const lockKey = `${orgId}:${event.session.id}:${hint?.email ?? hint?.phone ?? hint?.id ?? event.dedupeKey}`;
    return await lock(lockKey, () => runEvent(orgId, event, receivedAt));
  } catch (err) {
    await forgetEvent(orgId, event.dedupeKey);
    logError("webinar.ingest_failed", { message: errMessage(err), dedupeKey: event.dedupeKey });
    throw err;
  }
}

async function runEvent(orgId: string, event: CanonicalEvent, receivedAt: number): Promise<IngestResult> {
  const p = activePorts();
  const now = p.now();
  const cfg = webinarConfig();
  const session = await upsertSession(orgId, event.session, event.provider);
  const full = (await getSession(orgId, session.id)) ?? session;

  if (event.type === "session.upsert") {
    if (full.phase !== "ended") return { dispatched: [] };
    const regs = await listSession(orgId, full.id);
    const dispatched: DispatchRecord[] = [];
    for (const row of regs) {
      dispatched.push(...(await lock(row.id, () => endOne(orgId, row.id, full, now, cfg, receivedAt))));
    }
    return { dispatched };
  }

  const hint = event.registrant ?? {};
  let transition: MachineResult | undefined;
  let reg: WebinarRegistrant | undefined;
  for (let attempt = 0; attempt < 3 && !reg; attempt++) {
    const existing = await findRegistrant(orgId, full.id, hint);
    const working = existing ?? blankRegistrant(full.id, registrantKey(full.id, hint));
    const expected = working.version;
    const before = JSON.stringify(working);
    const next = applyEvent(working, event, full, now, cfg);
    if (await commit(orgId, working, expected, before)) {
      reg = working;
      transition = next;
    }
  }
  if (!reg || !transition) return { ignored: "conflict", dispatched: [] };

  const dispatched = await dispatchDue(orgId, reg.id, now, cfg, receivedAt);
  if (transition.suppressIdentity && !event.dedupeKey.includes(":sib:")) await suppressSiblings(orgId, reg, now, cfg);
  if (transition.optOutConfirm) await sendOptOutConfirm(reg, p);
  else if (transition.reply) await sendReply(reg, full, transition.reply, p);

  const latencyMs = dispatched.find((d) => d.channel === "call" && d.latencyMs !== undefined)?.latencyMs;
  if (latencyMs !== undefined) logInfo("webinar.leave_to_call", { registrantId: reg.id, sessionId: full.id, latencyMs });
  const fresh = await getRegistrant(orgId, reg.id);
  return { ignored: transition.ignored, registrantId: reg.id, state: fresh?.state ?? reg.state, dispatched, latencyMs };
}

async function endOne(orgId: string, id: string, session: WebinarSession, now: Date, cfg: WebinarConfig, receivedAt: number): Promise<DispatchRecord[]> {
  const fresh = await getRegistrant(orgId, id);
  if (!fresh) return [];
  const expected = fresh.version;
  const before = JSON.stringify(fresh);
  applySessionEnded(fresh, session, now);
  if (!(await commit(orgId, fresh, expected, before))) return [];
  return dispatchDue(orgId, fresh.id, now, cfg, receivedAt);
}

async function suppressSiblings(orgId: string, reg: WebinarRegistrant, now: Date, cfg: WebinarConfig): Promise<void> {
  const siblings = await listByIdentity(orgId, reg.email, reg.phone);
  for (const sib of siblings) {
    if (sib.id === reg.id || sib.state === "opted_out") continue;
    await lock(sib.id, async () => {
      const fresh = await getRegistrant(orgId, sib.id);
      if (!fresh || fresh.state === "opted_out") return;
      const session = (await getSession(orgId, fresh.sessionId)) ?? {
        id: fresh.sessionId,
        provider: "generic",
        title: "Webinar",
        phase: "ended" as const,
      };
      const expected = fresh.version;
      const before = JSON.stringify(fresh);
      applyEvent(
        fresh,
        {
          dedupeKey: `optout:sib:${fresh.id}`,
          provider: "webinar",
          type: "outcome.opt_out",
          occurredAt: now.toISOString(),
          session: { id: fresh.sessionId },
        },
        session,
        now,
        cfg,
      );
      await commit(orgId, fresh, expected, before);
    });
  }
}

async function sendOptOutConfirm(reg: WebinarRegistrant, p: WebinarPorts): Promise<void> {
  const body = optOutConfirmation();
  if (reg.phone) await p.sendSms({ to: reg.phone, body });
  else if (reg.email) await p.sendEmail({ to: reg.email, subject: "You're opted out", body });
}

async function sendReply(
  reg: WebinarRegistrant,
  session: WebinarSession,
  reply: { channel: "sms" | "email"; incoming: string },
  p: WebinarPorts,
): Promise<void> {
  const drafted = await p.reply({
    channel: reply.channel,
    name: reg.name ?? "there",
    incoming: reply.incoming,
    title: session.title,
  });
  if (reply.channel === "sms" && reg.phone) await p.sendSms({ to: reg.phone, body: drafted.body });
  if (reply.channel === "email" && reg.email) await p.sendEmail({ to: reg.email, subject: drafted.subject ?? `Re: ${session.title}`, body: drafted.body });
}

function rollDay(reg: WebinarRegistrant, session: WebinarSession | null, now: Date, cfg: WebinarConfig): void {
  const today = localDay(now, leadTimezone(reg, session ?? undefined, cfg));
  if (reg.dayKey !== today) {
    reg.dayKey = today;
    reg.day = { call: 0, sms: 0, email: 0 };
  }
}

function reclaim(reg: WebinarRegistrant, now: Date): void {
  for (const action of reg.actions) {
    if (action.status === "sending" && now.getTime() - new Date(action.dueAt).getTime() > 120_000) action.status = "pending";
  }
}

function pullForward(reg: WebinarRegistrant, channel: RecoveryAction["channel"], now: Date): void {
  const next = reg.actions
    .filter((a) => a.status === "pending" && a.channel === channel)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
  if (next) next.dueAt = now.toISOString();
}

async function dispatchDue(orgId: string, registrantId: string, now: Date, cfg: WebinarConfig, receivedAt: number): Promise<DispatchRecord[]> {
  const p = activePorts();
  const out: DispatchRecord[] = [];
  for (let guard = 0; guard < 12; guard++) {
    const reg = await getRegistrant(orgId, registrantId);
    if (!reg) return out;
    const session = await getSession(orgId, reg.sessionId);
    const before = JSON.stringify(reg);
    reclaim(reg, now);
    rollDay(reg, session, now, cfg);
    const due = reg.actions
      .filter((a) => a.status === "pending" && new Date(a.dueAt).getTime() <= now.getTime())
      .sort((a, b) => Number(a.channel !== "call") - Number(b.channel !== "call") || a.dueAt.localeCompare(b.dueAt));
    const action = due[0];
    if (!action) {
      if (JSON.stringify(reg) !== before) {
        const expected = reg.version;
        await saveRegistrant(orgId, reg, expected);
      }
      return out;
    }

    const gate = gateAction(reg, action, session ?? undefined, now, cfg);
    if (!gate.ok) {
      if (gate.deferUntil) {
        action.dueAt = gate.deferUntil;
        action.detail = gate.reason;
        out.push({ stepId: action.stepId, channel: action.channel, status: "deferred", detail: gate.reason });
      } else {
        action.status = "skipped";
        action.detail = gate.reason;
        out.push({ stepId: action.stepId, channel: action.channel, status: "skipped", detail: gate.reason });
        if (action.channel === "call" && (gate.reason === "no_consent" || gate.reason === "no_destination" || gate.reason === "phone_invalid")) {
          const smsReady = reg.consent.sms && reg.actions.some((a) => a.status === "pending" && a.channel === "sms");
          pullForward(reg, smsReady ? "sms" : "email", now);
        }
      }
      if (!(await saveRegistrant(orgId, reg, reg.version))) continue;
      continue;
    }

    const expected = reg.version;
    action.status = "sending";
    if (!(await saveRegistrant(orgId, reg, expected))) continue;

    const liveCall = action.channel === "call" && action.liveOverride;
    const started = Date.now();
    let result = await deliver(reg, action, session, orgId, p);
    if (!result.ok && action.channel === "call") result = await deliver(reg, action, session, orgId, p);

    action.status = result.ok ? "sent" : "failed";
    action.detail = result.detail;
    action.providerId = result.id;
    action.sentAt = now.toISOString();
    if (result.ok) {
      reg.attempts[action.channel] += 1;
      reg.day[action.channel] += 1;
      if (action.purpose === "reminder" && reg.state === "registered") reg.state = "reminded";
    } else if (action.channel === "call") {
      pullForward(reg, "sms", now);
      await p.alert("webinar.provider_failed", { registrantId: reg.id, stepId: action.stepId, detail: result.detail ?? "call failed" });
    } else if (action.channel === "sms") {
      pullForward(reg, "email", now);
    }

    const record: DispatchRecord = {
      stepId: action.stepId,
      channel: action.channel,
      status: result.ok ? "sent" : "failed",
      detail: result.detail,
      latencyMs: liveCall ? Math.max(0, started - receivedAt) : undefined,
    };
    out.push(record);
    logInfo("webinar.dispatch", { registrantId: reg.id, stepId: action.stepId, channel: action.channel, status: record.status, latencyMs: record.latencyMs });
    if (!(await saveRegistrant(orgId, reg, reg.version))) continue;
  }
  return out;
}

async function deliver(
  reg: WebinarRegistrant,
  action: RecoveryAction,
  session: WebinarSession | null,
  orgId: string,
  p: WebinarPorts,
): Promise<{ ok: boolean; id?: string; detail?: string }> {
  try {
    if (action.channel === "call" && reg.phone) {
      const drop = action.voicemail && !reg.voicemailDropped;
      return await p.placeCall({
        to: reg.phone,
        opener: callOpener(reg, session ?? undefined, action.purpose),
        voicemail: drop ? voicemailScript(reg, session ?? undefined, action.purpose) : undefined,
        context: callContext(reg, session ?? undefined, action.purpose),
        meta: {
          orgId,
          contactId: reg.contactId ?? "",
          dealId: "",
          webinarSessionId: reg.sessionId,
          webinarRegistrantId: reg.id,
          webinarStepId: action.stepId,
        },
      });
    }
    if (action.channel === "sms" && reg.phone) return await p.sendSms({ to: reg.phone, body: smsBody(reg, session ?? undefined, action.purpose) });
    if (action.channel === "email" && reg.email) {
      const mail = emailContent(reg, session ?? undefined, action.purpose);
      return await p.sendEmail({ to: reg.email, subject: mail.subject, body: mail.body });
    }
    return { ok: false, detail: "no_destination" };
  } catch (err) {
    return { ok: false, detail: errMessage(err) };
  }
}

/** Drain recovery steps whose due time has arrived. Safe to run every minute. */
export async function tickWebinarRecovery(orgId?: string | null): Promise<{ orgId: string | null; processed: number; dispatched: number }> {
  const org = orgId ?? (await resolveWebinarOrg());
  if (!org) return { orgId: null, processed: 0, dispatched: 0 };
  const now = activePorts().now();
  const cfg = webinarConfig();
  const due = await listDue(org, now);
  let dispatched = 0;
  for (const row of due) {
    const records = await lock(row.id, () => dispatchDue(org, row.id, now, cfg, Date.now()));
    dispatched += records.filter((r) => r.status === "sent").length;
  }
  const missed = sweepPresence(org, now);
  const polled = await pollDemio(now).catch(() => [] as CanonicalEvent[]);
  for (const event of [...missed, ...polled]) {
    const result = await ingestWebinarEvent(org, event, Date.now());
    dispatched += result.dispatched.filter((r) => r.status === "sent").length;
  }
  return { orgId: org, processed: due.length + missed.length, dispatched };
}

/** Demio has no leave webhook. This reads the post-session participants report. */
async function pollDemio(now: Date): Promise<CanonicalEvent[]> {
  const key = (process.env.DEMIO_API_KEY ?? "").trim();
  const secret = (process.env.DEMIO_API_SECRET ?? "").trim();
  const ids = (process.env.DEMIO_DATE_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!key || !secret || ids.length === 0) return [];
  const out: CanonicalEvent[] = [];
  for (const id of ids) {
    try {
      const res = await fetch(`https://my.demio.com/api/v1/report/${encodeURIComponent(id)}/participants`, {
        headers: { "Api-Key": key, "Api-Secret": secret, Accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) continue;
      out.push(...demioReportToEvents(id, await res.json(), now));
    } catch {
      /* one date failing must not stall the tick */
    }
  }
  return out;
}

export async function onWebinarCallOutcome(input: {
  orgId: string;
  registrantId: string;
  stepId?: string;
  outcome?: string;
  durationSec?: number;
  optOut?: boolean;
}): Promise<IngestResult> {
  const reg = await getRegistrant(input.orgId, input.registrantId);
  if (!reg) return { ignored: "unknown_registrant", dispatched: [] };
  const klass: CallClass = input.optOut ? "opt_out" : classifyCallOutcome(input.outcome, input.durationSec);
  return ingestWebinarEvent(input.orgId, {
    dedupeKey: `call:${input.registrantId}:${input.stepId ?? "na"}:${klass}:${input.outcome ?? ""}`,
    provider: "call",
    type: klass === "opt_out" ? "outcome.opt_out" : "outcome.call",
    occurredAt: new Date().toISOString(),
    session: { id: reg.sessionId },
    registrant: { email: reg.email, phone: reg.phone, id: reg.providerRegistrantId },
    callOutcome: input.outcome,
    callClass: klass,
    durationSec: input.durationSec,
  });
}

/** Inbound SMS on the shared number. Any reply stops the sequence; STOP opts out. Never throws. */
export async function onWebinarInboundSms(orgId: string | null, from: string, body: string): Promise<void> {
  try {
    const org = orgId ?? (await resolveWebinarOrg());
    if (!org || !from || !body) return;
    const regs = await listByIdentity(org, undefined, from);
    const seen = new Set<string>();
    for (const reg of regs) {
      if (seen.has(reg.id) || reg.state === "opted_out" || reg.state === "booked") continue;
      seen.add(reg.id);
      await ingestWebinarEvent(org, {
        dedupeKey: `sms:${reg.id}:${hashKey([body])}:${Math.floor(Date.now() / 60_000)}`,
        provider: "sms",
        type: "outcome.sms",
        occurredAt: new Date().toISOString(),
        session: { id: reg.sessionId },
        registrant: { email: reg.email, phone: reg.phone },
        message: body,
      });
    }
  } catch (err) {
    logError("webinar.inbound_sms", { message: errMessage(err) });
  }
}

export async function webinarOverview(orgId: string) {
  return { armed: webinarArmed(), counts: await webinarCounts(orgId), limits: webinarConfig() };
}
