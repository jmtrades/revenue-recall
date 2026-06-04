import crypto from "node:crypto";

/**
 * Hosted / embeddable lead-capture form tokens. The form posts with an HMAC
 * token (NOT the secret API key) that authorizes ONE thing — creating a lead for
 * a specific org — so it's safe to embed in public HTML. Unguessable and
 * org-scoped; mirrors the calendar-feed / unsubscribe token pattern.
 */

function secret(): string {
  return process.env.UNSUBSCRIBE_SECRET || process.env.INBOUND_TOKEN || process.env.CRON_SECRET || "rr-forms-dev";
}

export function formToken(orgId: string): string {
  return crypto.createHmac("sha256", secret()).update(`form:${orgId}`).digest("hex").slice(0, 32);
}

export function verifyFormToken(orgId: string, token: string | null | undefined): boolean {
  if (!orgId || !token) return false;
  const a = Buffer.from(formToken(orgId));
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function base(): string | null {
  const b = process.env.NEXT_PUBLIC_SITE_URL;
  return b ? b.replace(/\/$/, "") : null;
}

/** Public hosted-form URL for an org (null when no public base is configured). */
export function hostedFormUrl(orgId: string): string | null {
  const b = base();
  if (!b || !orgId) return null;
  return `${b}/f/${encodeURIComponent(orgId)}?k=${formToken(orgId)}`;
}

/** Copy-paste iframe embed snippet, or null when no public base is configured. */
export function formEmbedSnippet(orgId: string): string | null {
  const url = hostedFormUrl(orgId);
  if (!url) return null;
  return `<iframe src="${url}" title="Contact form" width="100%" height="520" style="border:0;max-width:480px" loading="lazy"></iframe>`;
}
