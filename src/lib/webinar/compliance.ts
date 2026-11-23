import { inQuietHours, isSunday, channelBlockedByClock, leadTimezone, localDay, nextCallableAt, nextDayOpen } from "@/lib/webinar/time";
import type { RecoveryAction, WebinarConfig, WebinarRegistrant, WebinarSession } from "@/lib/webinar/types";

export type Gate =
  | { ok: true }
  | { ok: false; reason: string; deferUntil?: string };

/**
 * Whether this recovery step may go out right now. Opt-out, DNC, missing
 * consent, and missing destination are hard skips. Quiet hours, Sunday, and
 * the daily cap defer to the next legal window instead of dropping the lead.
 * A live-room leave call can bypass the clock (they were just on the webinar)
 * but never consent, DNC, or the attempt caps.
 */
export function gateAction(
  reg: WebinarRegistrant,
  action: RecoveryAction,
  session: WebinarSession | undefined,
  now: Date,
  cfg: WebinarConfig,
): Gate {
  if (reg.state === "opted_out" || reg.doNotContact) return { ok: false, reason: "opted_out" };
  if (reg.state === "booked") return { ok: false, reason: "booked" };

  const channel = action.channel;
  if (channel === "call" && reg.phoneInvalid) return { ok: false, reason: "phone_invalid" };
  if ((channel === "call" || channel === "sms") && !reg.phone) return { ok: false, reason: "no_destination" };
  if (channel === "email" && !reg.email) return { ok: false, reason: "no_destination" };

  if (channel === "call" && cfg.requireCallConsent && !reg.consent.call) return { ok: false, reason: "no_consent" };
  if (channel === "sms" && cfg.requireSmsConsent && !reg.consent.sms) return { ok: false, reason: "no_consent" };

  const sessionCap = channel === "call" ? cfg.maxCallsPerSession : channel === "sms" ? cfg.maxSmsPerSession : cfg.maxEmailsPerSession;
  const sessionCount = channel === "call" ? reg.attempts.call : channel === "sms" ? reg.attempts.sms : reg.attempts.email;
  if (sessionCount >= sessionCap) return { ok: false, reason: "session_cap" };

  const tz = leadTimezone(reg, session, cfg);
  const today = localDay(now, tz);
  const day = reg.dayKey === today ? reg.day : { call: 0, sms: 0, email: 0 };
  const dayCount = channel === "call" ? day.call : channel === "sms" ? day.sms : day.email;
  const dayCap = channel === "call" ? cfg.maxCallsPerDay : channel === "sms" ? cfg.maxSmsPerDay : cfg.maxEmailsPerDay;
  if (dayCount >= dayCap) {
    return { ok: false, reason: "daily_cap", deferUntil: nextDayOpen(now, tz, cfg, channel).toISOString() };
  }

  const bypassClock = action.liveOverride && cfg.liveCallOverride && channel === "call";
  if (!bypassClock && channelBlockedByClock(now, tz, cfg, channel)) {
    const sundayOnly = cfg.blockSunday && channel !== "email" && isSunday(now, tz) && !inQuietHours(now, tz, cfg.quietStartHour, cfg.quietEndHour);
    return {
      ok: false,
      reason: sundayOnly ? "sunday" : "quiet_hours",
      deferUntil: nextCallableAt(now, tz, cfg, channel).toISOString(),
    };
  }

  return { ok: true };
}
