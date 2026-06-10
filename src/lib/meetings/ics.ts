import crypto from "node:crypto";

/**
 * Per-booking "Add to calendar" tokens. The confirmation email links a tiny
 * public .ics download for ONE booking; the URL carries an HMAC over the
 * org+booking pair so it's unguessable, read-only, and reveals exactly one
 * event. Same fail-closed pattern as the other public tokens.
 */
function secret(): string | null {
  const s = process.env.UNSUBSCRIBE_SECRET || process.env.INBOUND_TOKEN || process.env.CRON_SECRET;
  if (s) return s;
  return process.env.NODE_ENV === "production" ? null : "rr-booking-ics-dev";
}

export function bookingIcsToken(orgId: string, bookingId: string): string | null {
  const s = secret();
  if (!s || !orgId || !bookingId) return null;
  return crypto.createHmac("sha256", s).update(`bookingics:${orgId}:${bookingId}`).digest("hex").slice(0, 32);
}

export function verifyBookingIcsToken(orgId: string, bookingId: string, token: string | null | undefined): boolean {
  const expected = bookingIcsToken(orgId, bookingId);
  if (!expected || !token) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Absolute .ics URL for one booking (null without a public base / secret). */
export function bookingIcsUrl(orgId: string, bookingId: string): string | null {
  const base = process.env.NEXT_PUBLIC_SITE_URL;
  const token = bookingIcsToken(orgId, bookingId);
  if (!base || !token) return null;
  return `${base.replace(/\/$/, "")}/api/bookings/ics?org=${encodeURIComponent(orgId)}&id=${encodeURIComponent(bookingId)}&t=${token}`;
}
