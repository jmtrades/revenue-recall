/**
 * Canonical public marketing-site origin.
 *
 * Used for metadata that must be absolute — `metadataBase`, canonical URLs, the
 * sitemap, robots, and the Open Graph / Twitter card image — so social previews
 * and search engines always resolve to the real domain. Centralised here so the
 * value can never drift between these surfaces again.
 *
 * Override with NEXT_PUBLIC_SITE_URL (e.g. a preview deployment); the fallback
 * is production. The trailing slash is stripped so `${SITE_URL}/path` is clean.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.recall-touch.com").replace(/\/+$/, "");
