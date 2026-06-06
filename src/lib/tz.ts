/**
 * Timezone helpers — compute the local hour and local calendar day in an IANA
 * timezone, with a safe UTC fallback. Used so scheduled work (digests, quiet
 * hours) can reason in the recipient's local time instead of fixed UTC.
 */

/** Hour-of-day (0–23) in a given IANA timezone; falls back to UTC. */
export function hourInZone(now: Date, tz?: string): number {
  if (!tz) return now.getUTCHours();
  try {
    const h = parseInt(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tz }).format(now), 10);
    return Number.isFinite(h) ? h % 24 : now.getUTCHours(); // some impls render midnight as "24"
  } catch {
    return now.getUTCHours(); // bad/unknown tz → safe UTC fallback
  }
}

/** Calendar day (YYYY-MM-DD) in a given IANA timezone; falls back to the UTC day.
 *  Critical for once-per-LOCAL-day dedup: an org ahead of UTC must not get a
 *  second digest when the UTC date rolls over mid-local-day. */
export function dayInZone(now: Date, tz?: string): string {
  if (!tz) return now.toISOString().slice(0, 10);
  try {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** True when `tz` is a usable IANA zone (so we can validate user input / fall back). */
export function isValidTimeZone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
