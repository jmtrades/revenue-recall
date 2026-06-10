import crypto from "node:crypto";

/**
 * Public booking-page tokens. The page at /book/[org] is reachable with no
 * session, so it carries an HMAC token (NOT the API key) that authorizes exactly
 * one thing — booking a meeting with a specific org. Unguessable + org-scoped;
 * mirrors the hosted-form / unsubscribe / calendar-feed token pattern.
 */

// Fail closed in production: never sign with a public constant (that would let
// anyone forge a booking URL for any org). A dev-only constant keeps local
// development working without a configured secret.
function secret(): string | null {
  const s = process.env.UNSUBSCRIBE_SECRET || process.env.INBOUND_TOKEN || process.env.CRON_SECRET;
  if (s) return s;
  return process.env.NODE_ENV === "production" ? null : "rr-booking-dev";
}

export function bookingToken(orgId: string): string | null {
  const s = secret();
  if (!s || !orgId) return null;
  return crypto.createHmac("sha256", s).update(`book:${orgId}`).digest("hex").slice(0, 32);
}

export function verifyBookingToken(orgId: string, token: string | null | undefined): boolean {
  const expected = bookingToken(orgId);
  if (!expected || !token) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function base(): string | null {
  const b = process.env.NEXT_PUBLIC_SITE_URL;
  return b ? b.replace(/\/$/, "") : null;
}

/** Public booking URL for an org (null without a public base / no secret). The
 *  optional meeting-type slug deep-links straight to that type. */
export function hostedBookingUrl(orgId: string, slug?: string): string | null {
  const b = base();
  const t = bookingToken(orgId);
  if (!b || !orgId || !t) return null;
  const q = slug ? `?k=${t}&t=${encodeURIComponent(slug)}` : `?k=${t}`;
  return `${b}/book/${encodeURIComponent(orgId)}${q}`;
}

/** Copy-paste iframe embed snippet, or null when no public base is configured. */
export function bookingEmbedSnippet(orgId: string): string | null {
  const url = hostedBookingUrl(orgId);
  if (!url) return null;
  return `<iframe src="${url}" title="Book a meeting" width="100%" height="640" style="border:0;max-width:520px" loading="lazy"></iframe>`;
}
