import { isValidTimeZone } from "@/lib/tz";
import type { Availability, BookableSlot, BusyInterval, DayWindow, WeeklyWindows } from "@/lib/meetings/types";

/**
 * Booking slot engine. Turns a weekly availability schedule (expressed in the
 * org's local wall-clock time) into concrete, bookable UTC instants, honoring
 * minimum notice, a booking horizon, slot granularity, and existing bookings.
 *
 * The only timezone-sensitive operation is mapping a local wall-clock time to a
 * UTC instant; everything else is plain calendar arithmetic. We avoid pulling in
 * a date library by deriving the zone offset from `Intl.DateTimeFormat`.
 */

/** Offset (ms) to ADD to a UTC instant to get wall-clock time in `tz` at that instant. */
function tzOffsetMs(instant: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUTC - instant.getTime();
}

/**
 * The UTC instant for a wall-clock time (y, mo[1–12], d, h, mi) in `tz`. Derives
 * the zone offset at the candidate instant and corrects once for DST edges. With
 * no / invalid timezone the wall time is interpreted as UTC.
 */
export function zonedWallTimeToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): Date {
  if (!tz || !isValidTimeZone(tz)) return new Date(Date.UTC(y, mo - 1, d, h, mi));
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const off1 = tzOffsetMs(new Date(guess), tz);
  let utc = guess - off1;
  // Re-derive at the corrected instant: across a DST boundary the offset used for
  // the guess and the offset at the true instant can differ; settle on the latter.
  const off2 = tzOffsetMs(new Date(utc), tz);
  if (off2 !== off1) utc = guess - off2;
  return new Date(utc);
}

const HHMM = /^(\d{1,2}):(\d{2})$/;
/** Parse "HH:MM" → minutes from midnight, or null if malformed / out of range. */
function minutesOfDay(hhmm: string): number | null {
  const m = HHMM.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h < 0 || h > 23 || mi < 0 || mi > 59) return null;
  return h * 60 + mi;
}

/** Windows for a weekday, defensively normalized (drops malformed / inverted). */
function windowsForWeekday(weekly: WeeklyWindows, weekday: number): DayWindow[] {
  const raw = weekly[weekday];
  if (!Array.isArray(raw)) return [];
  return raw.filter((w) => {
    const s = minutesOfDay(w.start);
    const e = minutesOfDay(w.end);
    return s !== null && e !== null && e > s;
  });
}

export interface SlotOptions {
  durationMinutes: number;
  busy?: BusyInterval[];
  /** "Now" — injectable for deterministic tests. Defaults to the wall clock. */
  now?: Date;
  /** Safety cap on returned slots (avoids pathological configs). Default 500. */
  max?: number;
}

/**
 * Generate the bookable slots for an availability schedule. Slots are returned as
 * UTC ISO instants, sorted ascending, with any that fall inside the minimum
 * notice window, beyond the horizon, or overlapping a busy interval removed.
 */
export function generateSlots(avail: Availability, opts: SlotOptions): BookableSlot[] {
  const duration = Math.max(1, Math.round(opts.durationMinutes));
  const step = Math.max(1, Math.round(avail.slotMinutes || duration));
  const now = opts.now ?? new Date();
  const tz = avail.timezone || "";
  const earliest = now.getTime() + Math.max(0, avail.minNoticeMinutes) * 60_000;
  const horizonDays = Math.max(1, Math.min(90, avail.horizonDays || 14));
  const horizonEnd = now.getTime() + horizonDays * 86_400_000;
  const max = opts.max ?? 500;

  const busy = (opts.busy ?? [])
    .map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }))
    .filter((b) => Number.isFinite(b.start) && Number.isFinite(b.end));
  const overlapsBusy = (start: number, end: number) => busy.some((b) => start < b.end && end > b.start);

  // Start from the org-local calendar date of `now`, then advance the date by
  // plain arithmetic (DST-safe — the wall→UTC mapping handles offset shifts).
  const localToday = localDateParts(now, tz);
  let { y, m, d } = localToday;

  const out: BookableSlot[] = [];
  for (let day = 0; day <= horizonDays && out.length < max; day++) {
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    for (const w of windowsForWeekday(avail.weekly, weekday)) {
      const startMin = minutesOfDay(w.start)!;
      const endMin = minutesOfDay(w.end)!;
      for (let t = startMin; t + duration <= endMin && out.length < max; t += step) {
        const startUtc = zonedWallTimeToUtc(y, m, d, Math.floor(t / 60), t % 60, tz).getTime();
        const endUtc = startUtc + duration * 60_000;
        if (startUtc < earliest || startUtc > horizonEnd) continue;
        if (overlapsBusy(startUtc, endUtc)) continue;
        out.push({ start: new Date(startUtc).toISOString(), end: new Date(endUtc).toISOString() });
      }
    }
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    y = next.getUTCFullYear();
    m = next.getUTCMonth() + 1;
    d = next.getUTCDate();
  }

  // A slot can be produced more than once only at a DST "fall back" boundary;
  // dedupe by start and sort ascending so callers get a clean, ordered list.
  const seen = new Set<string>();
  return out
    .filter((s) => (seen.has(s.start) ? false : (seen.add(s.start), true)))
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** The local calendar date (y, m[1–12], d) of an instant in `tz` (UTC fallback). */
function localDateParts(instant: Date, tz: string): { y: number; m: number; d: number } {
  if (!tz || !isValidTimeZone(tz)) {
    return { y: instant.getUTCFullYear(), m: instant.getUTCMonth() + 1, d: instant.getUTCDate() };
  }
  const dtf = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const [yy, mm, dd] = dtf.format(instant).split("-").map(Number);
  return { y: yy, m: mm, d: dd };
}

/** A sensible default schedule for a new org: weekdays 9–5 in the given zone. */
export function defaultAvailability(timezone: string): Availability {
  const nineToFive: DayWindow[] = [{ start: "09:00", end: "17:00" }];
  return {
    timezone: timezone || "",
    weekly: { 1: nineToFive, 2: nineToFive, 3: nineToFive, 4: nineToFive, 5: nineToFive },
    slotMinutes: 30,
    minNoticeMinutes: 240,
    horizonDays: 14,
  };
}

/** True when a candidate start ISO is one of the currently bookable slots. */
export function isSlotAvailable(avail: Availability, opts: SlotOptions, startIso: string): boolean {
  const target = Date.parse(startIso);
  if (!Number.isFinite(target)) return false;
  return generateSlots(avail, opts).some((s) => Date.parse(s.start) === target);
}
