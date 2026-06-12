/**
 * "Call me tomorrow at 3" → an actual instant. When a prospect replies that
 * they're busy and names a time, the platform shouldn't drop a generic
 * "call them back" task a human may or may not see — it should book the dial.
 * This parses the times real people text (at 3 / around 4:30pm / tomorrow
 * morning / Monday / in 2 hours) into a UTC instant in the PROSPECT's own
 * timezone (from their area code, via local-time.ts), so "3pm" means THEIR
 * 3pm. Conservative by design: no recognizable time → null, and anything
 * parsing more than two weeks out is treated as a misparse. Times outside
 * the 8am–9pm courtesy window aren't clamped here — the execution layer
 * (runCallRetries) already holds dials until the window opens.
 */

const DAY_MS = 86_400_000;
export const MAX_CALLBACK_DAYS = 14;

/** The wall-clock parts of `date` in `tz` (UTC when no tz). */
function partsInZone(date: Date, tz?: string): { y: number; mo: number; d: number; h: number; mi: number; weekday: number } {
  if (!tz) return { y: date.getUTCFullYear(), mo: date.getUTCMonth(), d: date.getUTCDate(), h: date.getUTCHours(), mi: date.getUTCMinutes(), weekday: date.getUTCDay() };
  try {
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false });
    const p: Record<string, string> = {};
    for (const part of fmt.formatToParts(date)) p[part.type] = part.value;
    const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
    return { y: Number(p.year), mo: Number(p.month) - 1, d: Number(p.day), h: Number(p.hour) % 24, mi: Number(p.minute), weekday };
  } catch {
    return partsInZone(date); // bad tz → UTC fallback
  }
}

/** The UTC instant whose wall clock in `tz` reads y-mo-d h:mi. Two-pass offset
 *  correction handles DST transitions well enough for scheduling purposes. */
function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, tz?: string): Date {
  if (!tz) return new Date(Date.UTC(y, mo, d, h, mi));
  let guess = Date.UTC(y, mo, d, h, mi);
  for (let i = 0; i < 2; i++) {
    const w = partsInZone(new Date(guess), tz);
    const wallAsUtc = Date.UTC(w.y, w.mo, w.d, w.h, w.mi);
    guess += Date.UTC(y, mo, d, h, mi) - wallAsUtc;
  }
  return new Date(guess);
}

const DAYPART_HOUR: Record<string, number> = { morning: 9, afternoon: 14, evening: 18, night: 18, tonight: 19 };
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** Bare-hour convention for business texting: "at 3" means 3pm, "at 9" means
 *  9am, "at 12" means noon. Explicit am/pm always wins. */
function to24h(hour: number, meridiem: string | undefined, daypart: string | undefined): number {
  if (meridiem) {
    const pm = meridiem.startsWith("p");
    if (hour === 12) return pm ? 12 : 0;
    return pm ? hour + 12 : hour;
  }
  if (daypart && daypart !== "morning" && hour >= 1 && hour <= 11) return hour + 12; // "3 in the afternoon"
  if (hour >= 1 && hour <= 7) return hour + 12;
  return hour; // 8–12 read as morning/noon
}

/**
 * Parse a requested callback time out of a prospect's message. `tz` is the
 * prospect's IANA zone (pass `timezoneForPhone(phone) ?? org timezone`);
 * omitted → UTC. Returns the UTC instant, or null when no time is named.
 */
export function parseCallbackTime(text: string, now: Date = new Date(), tz?: string): Date | null {
  const t = (text ?? "").toLowerCase().replace(/\s+/g, " ");
  if (!t.trim()) return null;
  const result = parse(t, now, tz);
  if (!result) return null;
  if (result.getTime() <= now.getTime()) return null;
  if (result.getTime() - now.getTime() > MAX_CALLBACK_DAYS * DAY_MS) return null; // misparse guard
  return result;
}

function parse(t: string, now: Date, tz?: string): Date | null {
  // "in 30 minutes" / "in 2 hours" / "in an hour" — pure offsets, no zone math.
  const rel = t.match(/\bin (a couple of|a few|an?|\d{1,3}) (minutes?|mins?|hours?|hrs?)\b/);
  if (rel) {
    const n = rel[1] === "a couple of" ? 2 : rel[1] === "a few" ? 3 : rel[1] === "a" || rel[1] === "an" ? 1 : Number(rel[1]);
    const ms = /min/.test(rel[2]) ? n * 60_000 : n * 3_600_000;
    return new Date(now.getTime() + Math.max(ms, 5 * 60_000)); // never sooner than 5 min
  }

  const today = partsInZone(now, tz);
  // Clock time, with optional day context: "(tomorrow|monday) at 3(:30)(pm)".
  // A preposition lets a bare hour through ("at 3"); without one the meridiem
  // is required ("4pm works") so plain counts ("I have 3 kids") never parse.
  // "noon" is the one named clock time people actually text.
  const clock =
    t.match(/\b(?:at|around|about|after|by) (\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\b(?:\s*(?:in the )?(morning|afternoon|evening))?/) ??
    t.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)\b/) ??
    (/\bnoon\b/.test(t) ? ["", "12", "00", "pm", undefined] as unknown as RegExpMatchArray : null);
  const daypartWord = t.match(/\b(morning|afternoon|evening|tonight|night)\b/)?.[1];
  const tomorrow = /\btomorrow\b/.test(t);
  const weekdayWord = WEEKDAYS.find((w) => new RegExp(`\\b${w}\\b`).test(t));
  const nextWeek = /\bnext week\b/.test(t);

  // Resolve the day offset first (0 = today).
  let dayOffset: number | null = null;
  if (tomorrow) dayOffset = 1;
  else if (weekdayWord) {
    const target = WEEKDAYS.indexOf(weekdayWord);
    dayOffset = (target - today.weekday + 7) % 7 || 7; // "Monday" said on a Monday means next week
  } else if (nextWeek) dayOffset = ((1 - today.weekday + 7) % 7) || 7; // next Monday

  if (clock) {
    const hour = Number(clock[1]);
    const minute = clock[2] ? Number(clock[2]) : 0;
    if (hour >= 0 && hour <= 23 && minute <= 59) {
      const h24 = hour > 12 ? hour : to24h(hour, clock[3]?.replace(/\./g, ""), clock[4] ?? daypartWord);
      let when = zonedToUtc(today.y, today.mo, today.d + (dayOffset ?? 0), h24, minute, tz);
      // No explicit day and the time already passed → they mean the next one.
      if (dayOffset === null && when.getTime() <= now.getTime()) {
        when = zonedToUtc(today.y, today.mo, today.d + 1, h24, minute, tz);
      }
      return when;
    }
  }

  // Day context without a clock time: pick the conventional hour for the part
  // of day (10am when they only named a day).
  if (dayOffset !== null || daypartWord) {
    const hour = daypartWord ? DAYPART_HOUR[daypartWord] : 10;
    let offset = dayOffset ?? 0;
    let when = zonedToUtc(today.y, today.mo, today.d + offset, hour, 0, tz);
    // "this afternoon" already past → they can't mean today; roll forward.
    if (when.getTime() <= now.getTime()) {
      offset += 1;
      when = zonedToUtc(today.y, today.mo, today.d + offset, hour, 0, tz);
    }
    return when;
  }

  return null;
}

/** Short human label for confirmations and task summaries, in the same zone
 *  the time was parsed in ("tomorrow 3:00 PM" reads wrong in another zone).
 *  No/empty zone formats in UTC — matching what parseCallbackTime assumed —
 *  never the server's own clock. */
export function callbackLabel(when: Date, tz?: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz || "UTC", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(when);
  } catch {
    return when.toISOString();
  }
}
