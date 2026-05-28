import { detectIntent } from "@/lib/ai/intent";
import type { Activity, Contact, Opportunity } from "@/lib/crm/types";

/**
 * Guardrails that make fully-autonomous outbound (no human in the loop) safe and
 * non-spammy — the difference between an AI SDR a company will actually turn on
 * and one that gets the domain blacklisted. All pure and tested; the agent calls
 * these before drafting or sending.
 */

const OUTBOUND_KINDS = new Set(["email", "sms", "call"]);

/** Don't contact someone who asked us to stop, or is flagged do-not-contact. */
export function hasOptedOut(contact: Contact | undefined, opp: Opportunity | undefined, activities: Activity[]): boolean {
  const a = contact?.attributes;
  if (a) {
    if (a.doNotContact === true || a.do_not_contact === true || a.optedOut === true) return true;
    if (String(a.status ?? "").toLowerCase().includes("do not contact")) return true;
  }
  if (opp?.tags?.some((t) => /do[\s-]?not[\s-]?contact|unsubscrib|opt[\s-]?out/i.test(t))) return true;
  // They told us no on a previous inbound.
  return activities.some((act) => act.direction === "inbound" && (detectIntent(act.summary) === "decline" || detectIntent(act.summary) === "hostile"));
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

export type SkipReason = "opted_out" | "recently_contacted" | "quiet_hours" | "daily_cap" | null;

/**
 * Single decision point: should the agent send to this target right now? Returns
 * a skip reason or null (clear to send). `autonomy` gates the volume rails;
 * opt-out always applies.
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
  if (inCooldown(opts.activities, cooldownDays(), opts.now?.getTime())) return "recently_contacted";
  if (quietHoursNow(opts.now)) return "quiet_hours";
  if (opts.sentSoFar >= dailySendCap()) return "daily_cap";
  return null;
}
