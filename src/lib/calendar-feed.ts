import crypto from "node:crypto";

/**
 * Subscribable calendar feed (iCalendar). The org's upcoming deals/meetings flow
 * into Google/Outlook/Apple Calendar via a standard webcal/ICS subscribe URL —
 * one-way sync with zero OAuth or credentials, in any calendar app. The URL
 * carries an HMAC token (not a session) so calendar apps can poll it, but it
 * stays unguessable and org-scoped.
 */

function secret(): string {
  return process.env.UNSUBSCRIBE_SECRET || process.env.INBOUND_TOKEN || process.env.CRON_SECRET || "rr-calendar-dev";
}

export function calendarFeedToken(orgId: string): string {
  return crypto.createHmac("sha256", secret()).update(`calfeed:${orgId}`).digest("hex").slice(0, 32);
}

export function verifyCalendarFeedToken(orgId: string, token: string | null | undefined): boolean {
  if (!orgId || !token) return false;
  const a = Buffer.from(calendarFeedToken(orgId));
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Absolute feed URL for an org (null when no public base URL is configured). */
export function calendarFeedUrl(orgId: string): string | null {
  const base = process.env.NEXT_PUBLIC_SITE_URL;
  if (!base || !orgId) return null;
  return `${base.replace(/\/$/, "")}/api/calendar/feed?org=${encodeURIComponent(orgId)}&token=${calendarFeedToken(orgId)}`;
}

export interface FeedEvent {
  date: string;
  title: string;
  dealId?: string;
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

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
    const uid = `${crypto.createHash("sha1").update(`${e.dealId ?? ""}|${e.date}|${e.title}`).digest("hex")}@recall-touch.com`;
    lines.push("BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${now}`, `DTSTART:${start}`, `SUMMARY:${esc(e.title)}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
