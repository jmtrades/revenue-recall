import crypto from "node:crypto";
import { publicSiteUrl } from "@/lib/site";

/**
 * Per-booking "manage" (cancel) tokens. The confirmation email links a cancel
 * page for ONE booking; the URL carries an HMAC over the org+booking pair so a
 * prospect can cancel their own meeting with no account, while no one can guess
 * or tamper their way to cancelling someone else's. Distinct purpose tag from
 * the .ics token so the two links can't be substituted. Fail-closed in prod.
 */
function secret(): string | null {
  const s = process.env.UNSUBSCRIBE_SECRET || process.env.INBOUND_TOKEN || process.env.CRON_SECRET;
  if (s) return s;
  return process.env.NODE_ENV === "production" ? null : "rr-booking-manage-dev";
}

export function bookingManageToken(orgId: string, bookingId: string): string | null {
  const s = secret();
  if (!s || !orgId || !bookingId) return null;
  return crypto.createHmac("sha256", s).update(`bookingmanage:${orgId}:${bookingId}`).digest("hex").slice(0, 32);
}

export function verifyBookingManageToken(orgId: string, bookingId: string, token: string | null | undefined): boolean {
  const expected = bookingManageToken(orgId, bookingId);
  if (!expected || !token) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Absolute cancel URL for one booking (null without a public base / secret). */
export function bookingCancelUrl(orgId: string, bookingId: string): string | null {
  const base = publicSiteUrl();
  const token = bookingManageToken(orgId, bookingId);
  if (!base || !token) return null;
  return `${base.replace(/\/$/, "")}/api/bookings/cancel?org=${encodeURIComponent(orgId)}&id=${encodeURIComponent(bookingId)}&t=${token}`;
}
