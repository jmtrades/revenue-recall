import crypto from "node:crypto";
import { safeEqual } from "@/lib/safe-compare";

/**
 * HMAC-signed call meta. /api/calls/place attaches { orgId, contactId, dealId }
 * so the gateway's post-back can land the transcript on the right tenant — but
 * the gateway echoes meta verbatim and authenticates with ONE shared platform
 * token, so an unsigned meta.orgId would let any token-holder forge outcomes
 * onto any org's timeline. The signature binds the meta to this server at
 * place-time; /api/calls/log refuses an org-addressed post-back without it.
 */

function secret(): string | null {
  // Same convention as the OAuth state signer: operator-set server secrets,
  // fail CLOSED in production when neither exists, dev-constant otherwise.
  const real = process.env.ENCRYPTION_KEY || process.env.CRON_SECRET;
  if (real) return real;
  return process.env.NODE_ENV === "production" ? null : "rr-callmeta-dev";
}

function payload(meta: Record<string, string | undefined>): string {
  return `${meta.orgId ?? ""}|${meta.contactId ?? ""}|${meta.dealId ?? ""}`;
}

/** Attach the signature. Returns meta unchanged when no secret is available
 *  (prod misconfig) — verification then fails closed on the log side. */
export function signCallMeta(meta: Record<string, string>): Record<string, string> {
  const s = secret();
  if (!s) return meta;
  return { ...meta, sig: crypto.createHmac("sha256", s).update(payload(meta)).digest("hex").slice(0, 32) };
}

/** True only for a meta whose signature matches its identity fields. */
export function verifyCallMeta(meta: Record<string, string | undefined>): boolean {
  const s = secret();
  if (!s || !meta.sig) return false;
  const expected = crypto.createHmac("sha256", s).update(payload(meta)).digest("hex").slice(0, 32);
  return safeEqual(meta.sig, expected);
}
