import { dayInZone, hourInZone, isValidTimeZone } from "@/lib/tz";
import { timezoneForPhone } from "@/lib/calls/local-time";
import type { WebinarConfig, WebinarRegistrant, WebinarSession } from "@/lib/webinar/types";

export function phoneDigits(phone: string | undefined | null): string {
  return (phone ?? "").replace(/\D/g, "");
}

export function normalizeEmail(email: string | undefined | null): string | undefined {
  const e = email?.trim().toLowerCase();
  return e || undefined;
}

/** Match +44… with 44… and a stored national number with the same tail. */
export function phonesMatch(a?: string | null, b?: string | null): boolean {
  const da = phoneDigits(a);
  const db = phoneDigits(b);
  if (!da || !db) return false;
  if (da === db) return true;
  if (da.length >= 10 && db.length >= 10 && (da.endsWith(db) || db.endsWith(da))) return true;
  return false;
}

export function leadTimezone(reg: Pick<WebinarRegistrant, "timezone" | "phone">, session: Pick<WebinarSession, "timezone"> | undefined, cfg: WebinarConfig): string {
  if (reg.timezone && isValidTimeZone(reg.timezone)) return reg.timezone;
  if (reg.phone) {
    const nanp = timezoneForPhone(reg.phone);
    if (nanp) return nanp;
    const d = phoneDigits(reg.phone);
    if (d.startsWith("44")) return "Europe/London";
  }
  if (session?.timezone && isValidTimeZone(session.timezone)) return session.timezone;
  return isValidTimeZone(cfg.defaultTimezone) ? cfg.defaultTimezone : "UTC";
}

/** Quiet window may wrap midnight (21 → 8). Equal hours disables the window. */
export function inQuietHours(now: Date, tz: string, start: number, end: number): boolean {
  if (start === end) return false;
  const h = hourInZone(now, tz);
  return start < end ? h >= start && h < end : h >= start || h < end;
}

export function isSunday(now: Date, tz: string): boolean {
  try {
    return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: tz }).format(now) === "Sun";
  } catch {
    return now.getUTCDay() === 0;
  }
}

export function channelBlockedByClock(
  now: Date,
  tz: string,
  cfg: WebinarConfig,
  channel: "call" | "sms" | "email",
): boolean {
  if (channel === "email" && !cfg.emailQuiet) return false;
  if (inQuietHours(now, tz, cfg.quietStartHour, cfg.quietEndHour)) return true;
  if (cfg.blockSunday && channel !== "email" && isSunday(now, tz)) return true;
  return false;
}

/** Next moment this channel is allowed. Steps 5 minutes so DST and Sunday both resolve. */
export function nextCallableAt(now: Date, tz: string, cfg: WebinarConfig, channel: "call" | "sms" | "email"): Date {
  if (!channelBlockedByClock(now, tz, cfg, channel)) return now;
  for (let i = 1; i <= 7 * 24 * 12; i++) {
    const t = new Date(now.getTime() + i * 5 * 60_000);
    if (!channelBlockedByClock(t, tz, cfg, channel)) return t;
  }
  return new Date(now.getTime() + 24 * 3_600_000);
}

/** First open moment on a later local day — used when today's cap is spent. */
export function nextDayOpen(now: Date, tz: string, cfg: WebinarConfig, channel: "call" | "sms" | "email"): Date {
  const today = dayInZone(now, tz);
  for (let i = 1; i <= 8 * 24 * 12; i++) {
    const t = new Date(now.getTime() + i * 5 * 60_000);
    if (dayInZone(t, tz) === today) continue;
    if (!channelBlockedByClock(t, tz, cfg, channel)) return t;
  }
  return new Date(now.getTime() + 24 * 3_600_000);
}

export function localDay(now: Date, tz: string): string {
  return dayInZone(now, tz);
}
