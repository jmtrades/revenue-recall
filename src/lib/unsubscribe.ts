import crypto from "node:crypto";
import { publicSiteUrl } from "@/lib/site";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";

/**
 * One-click unsubscribe links. A signed (HMAC) token prevents enumeration/forgery,
 * so an unsubscribe URL can live in an email footer without auth. The endpoint
 * records an opt-out the guardrails honor, permanently suppressing the contact —
 * the gold-standard, frictionless CAN-SPAM mechanism.
 *
 * Multi-tenant: the token (and URL) bind the OWNING org when it's known, so the
 * unsubscribe runs against the right tenant in a shared deployment instead of the
 * "first org". A legacy contact-only token (orgId omitted) is still accepted, so
 * links in already-sent emails keep working and single-org stays correct.
 */

function secret(): string {
  return process.env.UNSUBSCRIBE_SECRET || process.env.INBOUND_TOKEN || process.env.CRON_SECRET || "rr-unsubscribe-dev";
}

export function unsubToken(contactId: string, orgId?: string | null): string {
  const data = orgId ? `${orgId}:${contactId}` : contactId;
  return crypto.createHmac("sha256", secret()).update(data).digest("hex").slice(0, 32);
}

export function verifyUnsubToken(contactId: string, token: string | null | undefined, orgId?: string | null): boolean {
  if (!contactId || !token) return false;
  const expected = Buffer.from(unsubToken(contactId, orgId));
  const got = Buffer.from(token);
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
}

/** Absolute unsubscribe URL for a contact — org-bound when the active org is known
 *  (so it routes to the right tenant), else a legacy contact-only link. Null when
 *  no public base URL is set. */
export async function unsubscribeUrl(contactId: string): Promise<string | null> {
  const base = publicSiteUrl();
  if (!base || !contactId) return null;
  const orgId = await resolveActiveOrgId().catch(() => null);
  const q = `c=${encodeURIComponent(contactId)}${orgId ? `&org=${encodeURIComponent(orgId)}` : ""}&t=${unsubToken(contactId, orgId)}`;
  return `${base.replace(/\/$/, "")}/api/unsubscribe?${q}`;
}
