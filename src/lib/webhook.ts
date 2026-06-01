import crypto from "node:crypto";

/**
 * Twilio request signature verification.
 *
 * Twilio signs each webhook with X-Twilio-Signature: an HMAC-SHA1 (base64) of
 * the full request URL concatenated with every POST param, sorted by key, using
 * your auth token as the key. Verifying it proves the request actually came from
 * Twilio and wasn't spoofed. See:
 * https://www.twilio.com/docs/usage/security#validating-requests
 */
export function computeTwilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);
  return crypto.createHmac("sha1", authToken).update(Buffer.from(data, "utf-8")).digest("base64");
}

export function verifyTwilioSignature(authToken: string, url: string, params: Record<string, string>, signature: string | null): boolean {
  if (!signature) return false;
  const expected = computeTwilioSignature(authToken, url, params);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  // Length check first — timingSafeEqual throws on length mismatch.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Verify a generic HMAC-SHA256 signature (hex) over the raw request body — for
 * inbound webhooks where you control the sender (e.g. an email-forwarding
 * bridge). The sender signs the exact bytes with a shared secret and sends the
 * digest as a header (optionally "sha256=" prefixed). Proves authenticity +
 * integrity, and is timing-safe.
 */
export function verifyHmacSignature(secret: string, rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(Buffer.from(rawBody, "utf-8")).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature.startsWith("sha256=") ? signature.slice(7) : signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
