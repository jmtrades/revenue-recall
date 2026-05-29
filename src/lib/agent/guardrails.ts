import { detectIntent } from "@/lib/ai/intent";
import type { Activity, Contact, Opportunity } from "@/lib/crm/types";

/**
 * Guardrails that make fully-autonomous outbound (no human in the loop) safe and
 * non-spammy — the difference between an AI SDR a company will actually turn on
 * and one that gets the domain blacklisted. All pure and tested; the agent calls
 * these before drafting or sending.
 */

const OUTBOUND_KINDS = new Set(["email", "sms", "call"]);

// A HARD opt-out means never contact again (legal/ethical: unsubscribe, "stop",
// do-not-contact). A soft "not interested / not now" is NOT this — those deals
// are winnable and we re-engage after a cooldown. This is the whole point of
// Revenue Recall: a no today isn't a no forever.
const HARD_OPT_OUT =
  /\b(unsubscribe|opt[\s-]?out|please remove|remove me|take me off( your list)?|do(?:n'?t| not)( ever)? (contact|call|text|email|message)( me)?|stop (calling|texting|messaging|emailing|contacting)|lose my number|never contact me)\b/i;

// Standard carrier opt-out keywords: a one-word reply like "STOP" or "UNSUBSCRIBE"
// must opt them out (TCPA/CTIA), even though it doesn't match the phrase patterns above.
const STANDALONE_OPT_OUT = /^\s*(stop|stopall|unsubscribe|cancel|end|quit|opt[\s-]?out|remove)\s*[.!]?\s*$/i;

/** True only for an explicit, permanent opt-out (or outright hostility). */
export function isHardOptOut(text: string): boolean {
  return STANDALONE_OPT_OUT.test(text) || HARD_OPT_OUT.test(text) || detectIntent(text) === "hostile";
}

/** Don't contact someone who explicitly opted out or is flagged do-not-contact.
 *  A soft decline does NOT count here — it's handled by a re-engagement cooldown. */
export function hasOptedOut(contact: Contact | undefined, opp: Opportunity | undefined, activities: Activity[]): boolean {
  const a = contact?.attributes;
  if (a) {
    if (a.doNotContact === true || a.do_not_contact === true || a.optedOut === true) return true;
    if (String(a.status ?? "").toLowerCase().includes("do not contact")) return true;
  }
  if (opp?.tags?.some((t) => /do[\s-]?not[\s-]?contact|unsubscrib|opt[\s-]?out/i.test(t))) return true;
  // Only a HARD opt-out on a prior inbound permanently suppresses.
  return activities.some((act) => act.direction === "inbound" && isHardOptOut(act.summary));
}

/** Most recent soft-decline inbound time (a "no for now" we should re-engage later). */
export function lastSoftDeclineAt(activities: Activity[]): number | null {
  let latest: number | null = null;
  for (const act of activities) {
    if (act.direction !== "inbound" || isHardOptOut(act.summary)) continue;
    if (detectIntent(act.summary) === "decline") {
      const t = new Date(act.occurredAt).getTime();
      if (latest === null || t > latest) latest = t;
    }
  }
  return latest;
}

/** Days to wait after a soft decline before re-engaging (default 30). 0 = re-engage freely. */
export function declineCooldownDays(): number {
  const n = Number(process.env.AGENT_DECLINE_COOLDOWN_DAYS);
  return Number.isFinite(n) && n >= 0 ? n : 30;
}

/** Avoid re-touching a deal we already reached out to within the cooldown window. */
export function inCooldown(activities: Activity[], days: number, now: number = Date.now()): boolean {
  if (days <= 0) return false;
  const cutoff = now - days * 86_400_000;
  return activities.some((act) => act.direction === "outbound" && OUTBOUND_KINDS.has(act.kind) && new Date(act.occurredAt).getTime() >= cutoff);
}

/** True when we're inside a configured quiet-hours window (UTC) and should hold sends. */
export function quietHoursNow(now: Date = new Date()): boolean {
  const start = Number(process.env.AGENT_QUIET_START_UTC);
  const end = Number(process.env.AGENT_QUIET_END_UTC);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start === end) return false;
  const h = now.getUTCHours();
  return start < end ? h >= start && h < end : h >= start || h < end; // supports windows that wrap midnight
}

/** Max autonomous sends per run (0/unset = unlimited). */
export function dailySendCap(): number {
  const n = Number(process.env.AGENT_DAILY_SEND_CAP);
  return Number.isFinite(n) && n > 0 ? n : Infinity;
}

/** Days to wait before re-touching the same deal (default 3). */
export function cooldownDays(): number {
  const n = Number(process.env.AGENT_COOLDOWN_DAYS);
  return Number.isFinite(n) && n >= 0 ? n : 3;
}

/** Current guardrail configuration, for showing operators what's in effect. */
export function guardrailConfig(): { cooldownDays: number; declineCooldownDays: number; dailyCap: number | null; quietHours: string | null } {
  const cap = dailySendCap();
  const start = Number(process.env.AGENT_QUIET_START_UTC);
  const end = Number(process.env.AGENT_QUIET_END_UTC);
  const quiet = Number.isInteger(start) && Number.isInteger(end) && start !== end ? `${start}:00–${end}:00 UTC` : null;
  return {
    cooldownDays: cooldownDays(),
    declineCooldownDays: declineCooldownDays(),
    dailyCap: Number.isFinite(cap) ? cap : null,
    quietHours: quiet,
  };
}

export type SkipReason = "opted_out" | "recently_declined" | "recently_contacted" | "quiet_hours" | "daily_cap" | null;

/**
 * Single decision point: should the agent send to this target right now? Returns
 * a skip reason or null (clear to send). `autonomy` gates the volume rails;
 * opt-out always applies. A soft decline pauses re-engagement for a cooldown but
 * never blocks forever — winnable deals come back around.
 */
export function sendGate(opts: {
  contact: Contact | undefined;
  opp: Opportunity | undefined;
  activities: Activity[];
  autonomy: "auto" | "review";
  sentSoFar: number;
  now?: Date;
}): SkipReason {
  if (hasOptedOut(opts.contact, opts.opp, opts.activities)) return "opted_out";
  if (opts.autonomy !== "auto") return null; // review mode is human-gated; only opt-out blocks drafting
  const nowMs = opts.now?.getTime() ?? Date.now();
  // Soft decline → respect a longer re-engagement gap, then follow up again.
  const softDecline = lastSoftDeclineAt(opts.activities);
  const declineDays = declineCooldownDays();
  if (softDecline !== null && declineDays > 0 && nowMs - softDecline < declineDays * 86_400_000) return "recently_declined";
  if (inCooldown(opts.activities, cooldownDays(), nowMs)) return "recently_contacted";
  if (quietHoursNow(opts.now)) return "quiet_hours";
  if (opts.sentSoFar >= dailySendCap()) return "daily_cap";
  return null;
}
