import crypto from "node:crypto";

/**
 * Per-org inbound webhook routing (multi-tenant). In a shared deployment the
 * inbound email/SMS/bounce webhooks must route each message to the ORG that owns
 * the conversation — not silently fall back to the first org. Each org gets a
 * unique inbound URL carrying an HMAC token (org-scoped, unguessable); the route
 * verifies it and runs the handler inside runWithOrg(org). Mirrors the forms /
 * calendar-feed token pattern.
 *
 * Backward-compatible: when no `org` token is present the routes keep their
 * existing single-org behavior (the global INBOUND_SIGNING_SECRET / INBOUND_TOKEN
 * auth + first-org), so single-org deployments are unaffected.
 */

// Fail closed in production: never sign org-routing tokens with a public constant
// (that would let anyone route forged inbound into any org). Dev-only constant
// keeps local development working without configuring a secret.
function secret(): string | null {
  const s = process.env.INBOUND_SIGNING_SECRET || process.env.INBOUND_TOKEN || process.env.UNSUBSCRIBE_SECRET || process.env.CRON_SECRET;
  if (s) return s;
  return process.env.NODE_ENV === "production" ? null : "rr-inbound-dev";
}

export type InboundKind = "email" | "sms" | "bounce";

/** The org-scoped token embedded in that org's inbound webhook URLs. */
export function inboundOrgToken(orgId: string): string | null {
  const s = secret();
  if (!s || !orgId) return null;
  return crypto.createHmac("sha256", s).update(`inbound:${orgId}`).digest("hex").slice(0, 32);
}

/** Constant-time verify of an org's inbound token (false on any missing piece). */
export function verifyInboundOrgToken(orgId: string | null | undefined, token: string | null | undefined): boolean {
  if (!orgId || !token) return false;
  const expected = inboundOrgToken(orgId);
  if (!expected) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Per-org inbound webhook URL for a channel (null when no public base / no secret).
 *  This is what an operator configures in each org's email/SMS provider so the
 *  conversation lands on the right tenant. */
export function inboundWebhookUrl(kind: InboundKind, orgId: string): string | null {
  const base = process.env.NEXT_PUBLIC_SITE_URL;
  const token = inboundOrgToken(orgId);
  if (!base || !orgId || !token) return null;
  return `${base.replace(/\/$/, "")}/api/inbound/${kind}?org=${encodeURIComponent(orgId)}&t=${token}`;
}
