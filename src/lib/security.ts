import crypto from "crypto";

/**
 * Constant-time string comparison. Both sides are hashed to a fixed-length
 * digest first, so the comparison never branches on (or leaks) the secret's
 * length and can't throw on mismatched byte lengths.
 */
export function safeEqual(a: string, b: string): boolean {
  const ah = crypto.createHash("sha256").update(a).digest();
  const bh = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ah, bh);
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
