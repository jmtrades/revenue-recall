import type {
  ActionPurpose,
  CanonicalEvent,
  RecoveryAction,
  RegistrantState,
  WebinarConfig,
  WebinarRegistrant,
  WebinarSession,
} from "@/lib/webinar/types";
import { saysBooked } from "@/lib/webinar/outcomes";
import { isHardOptOut } from "@/lib/agent/guardrails";

export interface MachineResult {
  registrant: WebinarRegistrant;
  ignored?: string;
  /** Opt-out applies to every session that shares this email/phone. */
  suppressIdentity?: boolean;
  /** One agentic reply, then silence. The escalation sequence is already cancelled. */
  reply?: { channel: "sms" | "email"; incoming: string };
  /** Send the fixed opt-out confirmation, which is not marketing. */
  optOutConfirm?: boolean;
}

interface StepSpec {
  id: string;
  channel: RecoveryAction["channel"];
  delayMs: number;
  purpose: ActionPurpose;
  voicemail?: boolean;
  liveOverride?: boolean;
}

const LIVE_LEAVE: StepSpec[] = [
  { id: "leave-call-1", channel: "call", delayMs: 0, purpose: "rejoin", voicemail: true, liveOverride: true },
  { id: "leave-sms-1", channel: "sms", delayMs: 45_000, purpose: "rejoin" },
  { id: "leave-call-2", channel: "call", delayMs: 3 * 60_000, purpose: "rejoin" },
  { id: "leave-call-3", channel: "call", delayMs: 10 * 60_000, purpose: "rejoin" },
  { id: "leave-email-1", channel: "email", delayMs: 12 * 60_000, purpose: "rejoin" },
  { id: "leave-call-4", channel: "call", delayMs: 25 * 60_000, purpose: "rejoin" },
];

const NOSHOW: StepSpec[] = [
  { id: "noshow-call-1", channel: "call", delayMs: 60_000, purpose: "replay" },
  { id: "noshow-sms-1", channel: "sms", delayMs: 5 * 60_000, purpose: "replay" },
  { id: "noshow-email-1", channel: "email", delayMs: 30 * 60_000, purpose: "replay" },
  { id: "noshow-call-2", channel: "call", delayMs: 4 * 3_600_000, purpose: "replay" },
  { id: "noshow-call-3", channel: "call", delayMs: 26 * 3_600_000, purpose: "replay" },
];

const FOLLOWUP: StepSpec[] = [
  { id: "post-email-1", channel: "email", delayMs: 15 * 60_000, purpose: "followup" },
  { id: "post-sms-1", channel: "sms", delayMs: 2 * 3_600_000, purpose: "followup" },
  { id: "post-call-1", channel: "call", delayMs: 20 * 3_600_000, purpose: "followup" },
];

const REPLAY_DROP: StepSpec[] = [
  { id: "replay-sms-1", channel: "sms", delayMs: 0, purpose: "replay" },
  { id: "replay-email-1", channel: "email", delayMs: 10 * 60_000, purpose: "replay" },
  { id: "replay-call-1", channel: "call", delayMs: 60 * 60_000, purpose: "replay" },
];

export function blankRegistrant(sessionId: string, id: string): WebinarRegistrant {
  return {
    id,
    sessionId,
    state: "registered",
    consent: { call: false, sms: false, email: true },
    doNotContact: false,
    phoneInvalid: false,
    present: false,
    joinCount: 0,
    leaveCount: 0,
    late: false,
    watchedReplay: false,
    replayCompleted: false,
    voicemailDropped: false,
    attempts: { call: 0, sms: 0, email: 0, voicemail: 0 },
    dayKey: "",
    day: { call: 0, sms: 0, email: 0 },
    actions: [],
    version: 0,
    recoveryActive: false,
  };
}

function genId(id: string, gen: number): string {
  return gen <= 1 ? id : `${id}#${gen}`;
}

function addSteps(reg: WebinarRegistrant, specs: StepSpec[], now: Date, gen = 1): void {
  for (const spec of specs) {
    const stepId = genId(spec.id, gen);
    if (reg.actions.some((a) => a.stepId === stepId)) continue;
    reg.actions.push({
      stepId,
      channel: spec.channel,
      purpose: spec.purpose,
      dueAt: new Date(now.getTime() + spec.delayMs).toISOString(),
      status: "pending",
      liveOverride: Boolean(spec.liveOverride),
      voicemail: Boolean(spec.voicemail),
    });
  }
}

function cancelPending(reg: WebinarRegistrant, pred?: (a: RecoveryAction) => boolean): void {
  for (const a of reg.actions) {
    if (a.status === "pending" && (!pred || pred(a))) {
      a.status = "cancelled";
      a.detail = a.detail ?? "cancelled";
    }
  }
}

function accelerate(reg: WebinarRegistrant, channel: RecoveryAction["channel"], now: Date): void {
  const pending = reg.actions
    .filter((a) => a.status === "pending" && a.channel === channel)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  if (pending[0]) pending[0].dueAt = now.toISOString();
}

function stamp(reg: WebinarRegistrant, iso: string): void {
  if (!reg.lastEventAt || iso > reg.lastEventAt) reg.lastEventAt = iso;
}

function stale(reg: WebinarRegistrant, event: CanonicalEvent): boolean {
  if (!reg.lastEventAt) return false;
  if (event.type.startsWith("outcome.") || event.type === "registrant.registered" || event.type === "session.upsert") return false;
  return event.occurredAt < reg.lastEventAt;
}

function absorbProfile(reg: WebinarRegistrant, event: CanonicalEvent): void {
  const p = event.registrant;
  if (!p) return;
  if (p.email) reg.email = p.email.trim().toLowerCase();
  if (p.phone) reg.phone = p.phone.trim();
  if (p.name) reg.name = p.name.trim();
  if (p.timezone) reg.timezone = p.timezone;
  if (p.contactId) reg.contactId = p.contactId;
  if (p.id) reg.providerRegistrantId = p.id;
  if (p.rejoinUrl) reg.rejoinUrl = p.rejoinUrl;
  if (p.consent?.call) reg.consent.call = true;
  if (p.consent?.sms) reg.consent.sms = true;
  if (p.consent?.email === false) reg.consent.email = false;
  if (p.email && p.consent?.email !== false) reg.consent.email = true;
  if (p.doNotContact) reg.doNotContact = true;
}

function reminderSteps(session: WebinarSession, now: Date): StepSpec[] {
  const specs: StepSpec[] = [];
  if (session.startsAt) {
    const start = new Date(session.startsAt).getTime();
    const add = (id: string, channel: StepSpec["channel"], at: number) => {
      if (at > now.getTime() + 5_000) specs.push({ id, channel, delayMs: at - now.getTime(), purpose: "reminder" });
    };
    add("rem-24h-email", "email", start - 24 * 3_600_000);
    add("rem-1h-sms", "sms", start - 3_600_000);
    add("rem-10m-sms", "sms", start - 600_000);
  }
  if (session.phase === "live") specs.push({ id: "rem-live-sms", channel: "sms", delayMs: 0, purpose: "reminder" });
  return specs;
}

function nearOffer(session: WebinarSession, event: CanonicalEvent, cfg: WebinarConfig): boolean {
  if (event.nearOffer) return true;
  if (!session.offerAt) return false;
  const delta = Math.abs(new Date(event.occurredAt).getTime() - new Date(session.offerAt).getTime());
  return delta <= cfg.offerWindowSec * 1000;
}

function liveRoom(session: WebinarSession): boolean {
  return session.phase === "live";
}

function optOut(reg: WebinarRegistrant, nowIso: string): MachineResult {
  cancelPending(reg);
  reg.state = "opted_out";
  reg.doNotContact = true;
  reg.present = false;
  reg.recoveryActive = false;
  reg.cancelledReason = "opt_out";
  stamp(reg, nowIso);
  return { registrant: reg, suppressIdentity: true, optOutConfirm: true };
}

function booked(reg: WebinarRegistrant, nowIso: string): MachineResult {
  cancelPending(reg);
  reg.state = "booked";
  reg.present = false;
  reg.recoveryActive = false;
  reg.cancelledReason = "booked";
  stamp(reg, nowIso);
  return { registrant: reg };
}

function stopForReply(reg: WebinarRegistrant, channel: "sms" | "email", incoming: string, nowIso: string): MachineResult {
  cancelPending(reg);
  reg.state = "follow_up";
  reg.recoveryActive = false;
  reg.cancelledReason = "replied";
  stamp(reg, nowIso);
  return { registrant: reg, reply: { channel, incoming } };
}

function startRecovery(reg: WebinarRegistrant, state: RegistrantState, reason: string, specs: StepSpec[], now: Date, gen: number): void {
  reg.state = state;
  reg.present = false;
  reg.recoveryActive = true;
  reg.recoveryReason = reason;
  addSteps(reg, specs, now, gen);
}

/**
 * Pure transition. `reg` is mutated and also returned. Callers pass a clone
 * they own. Attendance events older than the newest one already applied are
 * ignored so a late webhook cannot undo a rejoin.
 */
export function applyEvent(
  reg: WebinarRegistrant,
  event: CanonicalEvent,
  session: WebinarSession,
  now: Date,
  cfg: WebinarConfig,
): MachineResult {
  if (reg.doNotContact && event.type !== "outcome.opt_out") {
    // A suppressed person can still be recorded as opted out, but nothing restarts outreach.
    if (event.type !== "registrant.registered") return { registrant: reg, ignored: "do_not_contact" };
  }

  if (reg.state === "opted_out" && event.type !== "outcome.opt_out") {
    absorbProfile(reg, event);
    return { registrant: reg, ignored: "opted_out" };
  }
  if (reg.state === "booked" && event.type !== "outcome.opt_out") {
    return { registrant: reg, ignored: "booked" };
  }
  if (stale(reg, event)) return { registrant: reg, ignored: "stale" };

  absorbProfile(reg, event);
  if (reg.doNotContact && event.type === "registrant.registered") return optOut(reg, event.occurredAt);

  switch (event.type) {
    case "registrant.registered": {
      if (!reg.actions.some((a) => a.stepId.startsWith("rem-"))) addSteps(reg, reminderSteps(session, now), now);
      if (reg.state === "registered" || reg.state === "reminded") reg.state = "registered";
      stamp(reg, event.occurredAt);
      return { registrant: reg };
    }
    case "attendance.joined": {
      if (session.startsAt) {
        const delta = new Date(event.occurredAt).getTime() - new Date(session.startsAt).getTime();
        if (delta > cfg.lateJoinAfterSec * 1000) reg.late = true;
      }
      cancelPending(reg);
      reg.present = true;
      reg.joinCount += 1;
      reg.state = "in_room";
      reg.recoveryActive = false;
      reg.cancelledReason = reg.leaveCount > 0 ? "rejoined" : undefined;
      stamp(reg, event.occurredAt);
      return { registrant: reg };
    }
    case "attendance.left": {
      if (session.phase === "scheduled") return { registrant: reg, ignored: "session_not_live" };
      if (!reg.present && reg.recoveryActive && (reg.state === "left" || reg.state === "pitch_drop")) {
        return { registrant: reg, ignored: "duplicate_leave" };
      }
      reg.leaveCount += 1;
      const replay = event.duringReplay || session.phase === "replay" || reg.state === "replay";
      const pitch = nearOffer(session, event, cfg);
      if (replay && !liveRoom(session)) {
        startRecovery(reg, pitch ? "pitch_drop" : "follow_up", pitch ? "replay_pitch" : "replay_drop", pitch ? LIVE_LEAVE.map((s) => ({ ...s, liveOverride: false, id: s.id.replace("leave-", "rpitch-") })) : REPLAY_DROP, now, reg.leaveCount);
      } else if (pitch) {
        startRecovery(reg, "pitch_drop", "pitch_drop", LIVE_LEAVE.map((s) => ({ ...s, id: s.id.replace("leave-", "pitch-") })), now, reg.leaveCount);
      } else {
        const specs = LIVE_LEAVE.map((s) => ({ ...s, liveOverride: liveRoom(session) && s.liveOverride }));
        startRecovery(reg, "left", "leave", specs, now, reg.leaveCount);
      }
      stamp(reg, event.occurredAt);
      return { registrant: reg };
    }
    case "attendance.replay_started": {
      cancelPending(reg, (a) => a.purpose === "rejoin" || a.purpose === "replay" || a.purpose === "reminder");
      reg.watchedReplay = true;
      reg.present = false;
      reg.state = "replay";
      reg.recoveryActive = false;
      reg.cancelledReason = "replay";
      stamp(reg, event.occurredAt);
      return { registrant: reg };
    }
    case "attendance.replay_completed": {
      reg.watchedReplay = true;
      reg.replayCompleted = true;
      reg.present = false;
      if (reg.state !== "booked" && reg.state !== "opted_out") {
        cancelPending(reg);
        reg.state = "follow_up";
        reg.recoveryActive = true;
        reg.recoveryReason = "replay_complete";
        addSteps(reg, FOLLOWUP.map((s) => ({ ...s, id: s.id.replace("post-", "replaypost-") })), now);
      }
      stamp(reg, event.occurredAt);
      return { registrant: reg };
    }
    case "outcome.call": {
      if (reg.state === "in_room" && !reg.recoveryActive) return { registrant: reg, ignored: "rejoined" };
      const klass = event.callClass ?? "no_answer";
      if (klass === "opt_out") return optOut(reg, event.occurredAt);
      if (klass === "booked") return booked(reg, event.occurredAt);
      if (klass === "failed") return { registrant: reg };
      if (klass === "wrong_number") {
        reg.phoneInvalid = true;
        // SMS uses the same number, so it stops with the calls. Email does not.
        cancelPending(reg, (a) => a.channel === "call" || a.channel === "sms");
        reg.state = "wrong_number";
        reg.recoveryActive = Boolean(reg.email);
        accelerate(reg, "email", now);
        if (!reg.actions.some((a) => a.channel === "email" && (a.status === "pending" || a.status === "sent"))) {
          addSteps(reg, [{ id: "wrong-email-1", channel: "email", delayMs: 0, purpose: "followup" }], now);
        }
        stamp(reg, event.occurredAt);
        return { registrant: reg };
      }
      if (klass === "voicemail") {
        reg.voicemailDropped = true;
        reg.attempts.voicemail += 1;
        accelerate(reg, "sms", now);
        stamp(reg, event.occurredAt);
        return { registrant: reg };
      }
      if (klass === "hangup") {
        cancelPending(reg, (a) => a.channel === "call");
        accelerate(reg, "sms", now);
        reg.state = "follow_up";
        reg.recoveryActive = false;
        reg.cancelledReason = "hangup";
        stamp(reg, event.occurredAt);
        return { registrant: reg };
      }
      if (klass === "connected") {
        cancelPending(reg, (a) => a.purpose === "rejoin" || a.purpose === "replay" || a.channel === "call");
        reg.state = "follow_up";
        reg.recoveryActive = true;
        reg.recoveryReason = "connected";
        addSteps(reg, FOLLOWUP.filter((s) => s.channel === "email"), now);
        stamp(reg, event.occurredAt);
        return { registrant: reg };
      }
      // no_answer | busy — keep the plan, pull SMS forward so they get the link now.
      accelerate(reg, "sms", now);
      stamp(reg, event.occurredAt);
      return { registrant: reg };
    }
    case "outcome.sms":
    case "outcome.email": {
      const channel = event.type === "outcome.sms" ? "sms" : "email";
      const text = event.message ?? "";
      if (!text.trim()) return { registrant: reg, ignored: "empty_reply" };
      if (isHardOptOut(text)) return optOut(reg, event.occurredAt);
      if (saysBooked(text)) return booked(reg, event.occurredAt);
      return stopForReply(reg, channel, text, event.occurredAt);
    }
    case "outcome.booked":
      return booked(reg, event.occurredAt);
    case "outcome.opt_out":
      return optOut(reg, event.occurredAt);
    default:
      return { registrant: reg };
  }
}

/** Webinar ended. People still marked present become attended; people who never joined become no-shows. */
export function applySessionEnded(reg: WebinarRegistrant, session: WebinarSession, now: Date): MachineResult {
  if (reg.state === "booked" || reg.state === "opted_out" || reg.doNotContact) return { registrant: reg, ignored: reg.state };
  if (reg.recoveryActive && (reg.state === "left" || reg.state === "pitch_drop" || reg.state === "no_show" || reg.state === "wrong_number")) {
    return { registrant: reg };
  }
  const at = session.endsAt ?? now.toISOString();
  if (reg.state === "in_room" || reg.present) {
    cancelPending(reg);
    reg.present = false;
    reg.state = "attended";
    reg.recoveryActive = true;
    reg.recoveryReason = "attended";
    addSteps(reg, FOLLOWUP, now);
    stamp(reg, at);
    return { registrant: reg };
  }
  if (reg.state === "registered" || reg.state === "reminded") {
    cancelPending(reg);
    reg.state = "no_show";
    reg.recoveryActive = true;
    reg.recoveryReason = "no_show";
    addSteps(reg, NOSHOW, now);
    stamp(reg, at);
    return { registrant: reg };
  }
  return { registrant: reg };
}
