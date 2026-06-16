/**
 * Referral growth loop. A workspace shares its signup link; when a workspace it
 * refers becomes a PAYING customer, both sides get a usage-credit reward (bonus
 * AI messages — not cash, so it's low-risk and reuses the existing top-up credit
 * pool). The referral "code" is simply the referrer's org uuid.
 *
 * This module is PURE (safe to import anywhere, incl. middleware/client). The
 * side effects live elsewhere: middleware captures `?ref` into a cookie,
 * provision.ts attributes it on first org creation, and the billing webhook
 * grants the reward (referrals-server.ts) on first paid activation.
 */
import { publicSiteUrl } from "@/lib/site";

/** Cookie that carries a captured referral code from the signup link through to
 *  first provision. httpOnly + lax so it survives the OAuth round-trip. */
export const REFERRAL_COOKIE = "rr_ref";

/** ~60 days to convert a click into a signup. */
export const REFERRAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Validate a raw `?ref`/cookie value as a real org uuid (normalized), else null.
 *  Bounded so a junk value can never reach a query. Pure + tested. */
export function parseReferralCode(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  return UUID_RE.test(v) ? v : null;
}

/** A referral is attributable only when it's a real code AND not the workspace
 *  referring itself. Pure + tested. */
export function isAttributableReferral(refCode: string | null | undefined, newOrgId: string): boolean {
  const ref = parseReferralCode(refCode);
  return ref !== null && ref !== newOrgId.trim().toLowerCase();
}

/** The shareable signup link for an org. Pure + tested. */
export function referralLink(orgId: string, base?: string): string {
  const root = (base ?? publicSiteUrl() ?? "").replace(/\/$/, "");
  return `${root}/signup?ref=${encodeURIComponent(orgId)}`;
}

function envInt(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;
}

/** Bonus AI messages granted on a successful referral (env-tunable). Conservative
 *  defaults: a real thank-you whose AI cost is cents — far under the value of the
 *  paid subscription it unlocked, so every referral clears margin. Pure + tested. */
export function referralReward(): { referrer: number; referee: number } {
  return {
    referrer: envInt("REFERRAL_REWARD_REFERRER", 2000),
    referee: envInt("REFERRAL_REWARD_REFEREE", 1000),
  };
}
