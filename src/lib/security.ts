import crypto from "crypto";

/** Constant-time string comparison that won't leak length via early return. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    // Still run a comparison to keep timing uniform, then fail.
    crypto.timingSafeEqual(ab, ab);
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * Authorize a webhook/admin request against a shared secret. Accepts the secret
 * via `Authorization: Bearer <token>` (preferred) or a `?token=` query param
 * (for providers that can't set headers). Returns false when no secret is set.
 */
export function authorizeSecret(req: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (bearer && safeEqual(bearer, secret)) return true;
  const qp = new URL(req.url).searchParams.get("token") ?? "";
  return Boolean(qp) && safeEqual(qp, secret);
}
