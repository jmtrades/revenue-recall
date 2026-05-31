import crypto from "node:crypto";

/**
 * Encrypt-at-rest for tenant secrets (social tokens, database connection
 * strings). AES-256-GCM with a key derived from ENCRYPTION_KEY, so a database
 * dump alone never exposes a customer's credentials.
 *
 * Format (single base64 string): scryptSalt(16) | iv(12) | authTag(16) | ciphertext.
 * The salt is stored with the payload so the key is re-derivable without a KDF
 * cache, and rotating ENCRYPTION_KEY invalidates old values cleanly (decrypt
 * fails → treated as "not set", surfaced in the UI as needs-reconnect).
 *
 * If ENCRYPTION_KEY is unset, encryption is unavailable — callers must check
 * encryptionAvailable() and gate the connect UI, rather than storing plaintext.
 */

const MAGIC = "rrenc1:"; // versioned prefix so we can evolve the scheme later
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;

export function encryptionAvailable(): boolean {
  const k = process.env.ENCRYPTION_KEY;
  return typeof k === "string" && k.length >= 16;
}

function deriveKey(salt: Buffer): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret || secret.length < 16) throw new Error("ENCRYPTION_KEY is not set (min 16 chars)");
  return crypto.scryptSync(secret, salt, 32);
}

/** Encrypt a UTF-8 string. Throws if ENCRYPTION_KEY is unavailable. */
export function encryptSecret(plaintext: string): string {
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const key = deriveKey(salt);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return MAGIC + Buffer.concat([salt, iv, tag, enc]).toString("base64");
}

/**
 * Decrypt a value produced by encryptSecret. Returns null on any failure (wrong
 * key after rotation, tampering, malformed input) so callers treat it as
 * "missing" and prompt a reconnect instead of crashing.
 */
export function decryptSecret(payload: string): string | null {
  try {
    if (!payload.startsWith(MAGIC)) return null;
    const buf = Buffer.from(payload.slice(MAGIC.length), "base64");
    if (buf.length < SALT_LEN + IV_LEN + TAG_LEN) return null;
    const salt = buf.subarray(0, SALT_LEN);
    const iv = buf.subarray(SALT_LEN, SALT_LEN + IV_LEN);
    const tag = buf.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
    const enc = buf.subarray(SALT_LEN + IV_LEN + TAG_LEN);
    const key = deriveKey(salt);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** True if a string looks like one of our encrypted payloads. */
export function isEncrypted(v: string): boolean {
  return typeof v === "string" && v.startsWith(MAGIC);
}
