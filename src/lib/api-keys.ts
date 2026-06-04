import crypto from "node:crypto";

/**
 * Public API keys for the Lead Capture API. A key looks like
 * `rr_live_<48 hex chars>` — high-entropy, with a recognizable prefix. We store
 * only its SHA-256 hash (a DB dump can't be replayed as a key) plus a short,
 * non-secret display prefix so the user can identify the active key in the UI.
 * Resolution on the public endpoint is a single indexed lookup by the hash —
 * the secret has enough entropy that a direct hash-equality lookup is safe.
 */

export const API_KEY_PREFIX = "rr_live_";
const DISPLAY_CHARS = 6; // chars of the secret kept in the (non-secret) prefix

export interface GeneratedApiKey {
  /** The plaintext key — shown to the user exactly once, never stored. */
  key: string;
  /** SHA-256 hex of the key — what we persist and look up by. */
  hash: string;
  /** Non-secret display prefix, e.g. "rr_live_a1b2c3". */
  prefix: string;
}

export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key.trim()).digest("hex");
}

/** The non-secret, displayable prefix of a key (prefix + a few secret chars). */
export function keyPrefix(key: string): string {
  return key.slice(0, API_KEY_PREFIX.length + DISPLAY_CHARS);
}

export function generateApiKey(): GeneratedApiKey {
  const secret = crypto.randomBytes(24).toString("hex"); // 48 hex chars
  const key = `${API_KEY_PREFIX}${secret}`;
  return { key, hash: hashApiKey(key), prefix: keyPrefix(key) };
}

/** A masked rendering for the UI, e.g. "rr_live_a1b2c3••••••••". */
export function maskApiKey(prefix: string): string {
  return `${prefix}${"•".repeat(8)}`;
}

/** Cheap shape check before doing any DB work for a presented key. */
export function looksLikeApiKey(key: string | null | undefined): key is string {
  return typeof key === "string" && key.startsWith(API_KEY_PREFIX) && key.length >= API_KEY_PREFIX.length + 16;
}

/** Extract a bearer/x-api-key value from request headers. */
export function readApiKey(headers: Headers): string | null {
  const auth = headers.get("authorization");
  if (auth && /^bearer\s+/i.test(auth)) return auth.replace(/^bearer\s+/i, "").trim();
  return headers.get("x-api-key")?.trim() ?? null;
}
