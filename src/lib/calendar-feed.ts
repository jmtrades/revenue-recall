import crypto from "node:crypto";

/**
 * Subscribable calendar feed (iCalendar). The org's upcoming deals/meetings flow
 * into Google/Outlook/Apple Calendar via a standard webcal/ICS subscribe URL —
 * one-way sync with zero OAuth or credentials, in any calendar app. The URL
 * carries an HMAC token (not a session) so calendar apps can poll it, but it
 * stays unguessable and org-scoped.
 */

// Fail closed in production: never sign the feed token with a public constant
// (that would let anyone read an org's calendar). Dev-only constant for local.
function secret(): string | null {
  const s = process.env.UNSUBSCRIBE_SECRET || process.env.INBOUND_TOKEN || process.env.CRON_SECRET;
  if (s) return s;
  return process.env.NODE_ENV === "production" ? null : "rr-calendar-dev";
}

export function calendarFeedToken(orgId: string): string | null {
  const s = secret();
  if (!s || !orgId) return null;
  return crypto.createHmac("sha256", s).update(`calfeed:${orgId}`).digest("hex").slice(0, 32);
}

export function verifyCalendarFeedToken(orgId: string, token: string | null | undefined): boolean {
  const expected = calendarFeedToken(orgId);
  if (!expected || !token) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Absolute feed URL for an org (null when no public base / no secret). */
export function calendarFeedUrl(orgId: string): string | null {
  const base = process.env.NEXT_PUBLIC_SITE_URL;
  const token = calendarFeedToken(orgId);
  if (!base || !orgId || !token) return null;
  return `${base.replace(/\/$/, "")}/api/calendar/feed?org=${encodeURIComponent(orgId)}&token=${token}`;
}

export interface FeedEvent {
  date: string;
  /** Optional end instant — emitted as DTEND so booked meetings span their real
   *  duration in the subscriber's calendar (derived events stay point events). */
  end?: string;
  title: string;
  dealId?: string;
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
// Returns "" for an unparseable date rather than throwing, so one bad event can
// never blow up the whole feed (the route returns a graceful calendar instead).
const stamp = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
};

/** Serialize events to a valid iCalendar document (CRLF line endings per RFC 5545). */
export function toIcs(events: FeedEvent[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Revenue Recall//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Revenue Recall",
  ];
  const now = stamp(new Date().toISOString());
  for (const e of events) {
    if (!e.date) continue;
    const start = stamp(e.date);
    if (!start) continue; // skip an unparseable date instead of emitting an invalid VEVENT
    const end = e.end ? stamp(e.end) : "";
    const uid = `${crypto.createHash("sha1").update(`${e.dealId ?? ""}|${e.date}|${e.title}`).digest("hex")}@recall-touch.com`;
    lines.push("BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${now}`, `DTSTART:${start}`);
    if (end) lines.push(`DTEND:${end}`);
    lines.push(`SUMMARY:${esc(e.title)}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
