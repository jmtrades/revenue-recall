import crypto from "node:crypto";

/**
 * Constant-time string equality with no length side-channel. HMAC both sides
 * with an ephemeral per-call key, then timingSafeEqual the fixed-length digests —
 * so neither the contents nor the length of the secret leak via timing. Use for
 * comparing bearer tokens / shared secrets on request paths.
 */
export function safeEqual(a: string, b: string): boolean {
  const key = crypto.randomBytes(32);
  const ad = crypto.createHmac("sha256", key).update(a).digest();
  const bd = crypto.createHmac("sha256", key).update(b).digest();
  return crypto.timingSafeEqual(ad, bd);
}
