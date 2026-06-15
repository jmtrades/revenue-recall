/**
 * Canonical public marketing-site origin.
 *
 * Used for metadata that must be absolute — `metadataBase`, canonical URLs, the
 * sitemap, robots, the OG/Twitter card image — AND for every server-generated
 * link in transactional email (invites, password reset, digests, unsubscribe,
 * booking, tracked links). Centralised so the value can never drift.
 *
 * Hardening: a localhost/empty `NEXT_PUBLIC_SITE_URL` is a common misconfig that
 * silently ships broken links to real customers. In production we REFUSE such a
 * value and fall back to the real domain; in dev we honour whatever's set so
 * local previews work. Override with a real https URL for preview deployments.
 */
const PROD_DEFAULT = "https://www.recall-touch.com";

function isLocalish(u: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?/i.test(u) || !/^https?:\/\//i.test(u);
}

function resolveSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const inProd = process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
  // No value, or a localhost value in production → use the real domain so emailed
  // links / canonical metadata are never broken for customers.
  if (!raw || (inProd && isLocalish(raw))) return PROD_DEFAULT;
  return raw.replace(/\/+$/, "");
}

export const SITE_URL = resolveSiteUrl();

/**
 * Call-time public origin for TRANSACTIONAL links (invite/reset/digest/booking/
 * unsubscribe/tracked-link emails). Resolved per call (not frozen at import) so
 * it reflects the current env, and returns "" when nothing is configured — so
 * callers SKIP building a link rather than emailing a guessed domain. Unlike the
 * metadata `SITE_URL`, the empty case is intentional. In production it refuses a
 * localhost value (the common misconfig) and uses the real domain instead.
 */
export function publicSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return "";
  const inProd = process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
  if (inProd && isLocalish(raw)) return PROD_DEFAULT;
  return raw.replace(/\/+$/, "");
}

