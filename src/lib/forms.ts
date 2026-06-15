import crypto from "node:crypto";
import { publicSiteUrl } from "@/lib/site";

/**
 * Hosted / embeddable lead-capture form tokens. The form posts with an HMAC
 * token (NOT the secret API key) that authorizes ONE thing — creating a lead for
 * a specific org — so it's safe to embed in public HTML. Unguessable and
 * org-scoped; mirrors the calendar-feed / unsubscribe token pattern.
 */

// Fail closed in production: never sign tokens with a public constant (that
// would let anyone forge a form URL and create leads for any org). A dev-only
// constant keeps local development working without configuring a secret.
function secret(): string | null {
  const s = process.env.UNSUBSCRIBE_SECRET || process.env.INBOUND_TOKEN || process.env.CRON_SECRET;
  if (s) return s;
  return process.env.NODE_ENV === "production" ? null : "rr-forms-dev";
}

export function formToken(orgId: string): string | null {
  const s = secret();
  if (!s || !orgId) return null;
  return crypto.createHmac("sha256", s).update(`form:${orgId}`).digest("hex").slice(0, 32);
}

export function verifyFormToken(orgId: string, token: string | null | undefined): boolean {
  const expected = formToken(orgId);
  if (!expected || !token) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function base(): string | null {
  const b = publicSiteUrl();
  return b ? b.replace(/\/$/, "") : null;
}

/** Public hosted-form URL for an org (null when no public base / no secret). */
export function hostedFormUrl(orgId: string): string | null {
  const b = base();
  const t = formToken(orgId);
  if (!b || !orgId || !t) return null;
  return `${b}/f/${encodeURIComponent(orgId)}?k=${t}`;
}

/** Copy-paste iframe embed snippet, or null when no public base is configured. */
export function formEmbedSnippet(orgId: string): string | null {
  const url = hostedFormUrl(orgId);
  if (!url) return null;
  return `<iframe src="${url}" title="Contact form" width="100%" height="520" style="border:0;max-width:480px" loading="lazy"></iframe>`;
}
