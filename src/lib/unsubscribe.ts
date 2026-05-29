import crypto from "node:crypto";

/**
 * One-click unsubscribe links. A signed (HMAC) per-contact token prevents
 * enumeration/forgery, so an unsubscribe URL can live in an email footer without
 * auth. The endpoint records an opt-out the guardrails honor, permanently
 * suppressing the contact — the gold-standard, frictionless CAN-SPAM mechanism.
 */

function secret(): string {
  return process.env.UNSUBSCRIBE_SECRET || process.env.INBOUND_TOKEN || process.env.CRON_SECRET || "rr-unsubscribe-dev";
}

export function unsubToken(contactId: string): string {
  return crypto.createHmac("sha256", secret()).update(contactId).digest("hex").slice(0, 32);
}

export function verifyUnsubToken(contactId: string, token: string | null | undefined): boolean {
  if (!contactId || !token) return false;
  const expected = Buffer.from(unsubToken(contactId));
  const got = Buffer.from(token);
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
}

/** Absolute unsubscribe URL for a contact, or null when no public base URL is set. */
export function unsubscribeUrl(contactId: string): string | null {
  const base = process.env.NEXT_PUBLIC_SITE_URL;
  if (!base || !contactId) return null;
  return `${base.replace(/\/$/, "")}/api/unsubscribe?c=${encodeURIComponent(contactId)}&t=${unsubToken(contactId)}`;
}
