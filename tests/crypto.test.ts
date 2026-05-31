import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encryptSecret, decryptSecret, encryptionAvailable, isEncrypted } from "@/lib/crypto";

const KEY = "test-encryption-key-at-least-16-chars-long";

describe("secret encryption (AES-256-GCM, at rest)", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = KEY;
  });
  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  it("reports availability based on ENCRYPTION_KEY", () => {
    expect(encryptionAvailable()).toBe(true);
    delete process.env.ENCRYPTION_KEY;
    expect(encryptionAvailable()).toBe(false);
    process.env.ENCRYPTION_KEY = "short";
    expect(encryptionAvailable()).toBe(false);
  });

  it("round-trips a secret", () => {
    const secret = "wa_token_abc123:very-secret";
    const enc = encryptSecret(secret);
    expect(isEncrypted(enc)).toBe(true);
    expect(enc).not.toContain(secret); // never stored in the clear
    expect(decryptSecret(enc)).toBe(secret);
  });

  it("produces different ciphertext each time (random salt+iv)", () => {
    const a = encryptSecret("same");
    const b = encryptSecret("same");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("same");
    expect(decryptSecret(b)).toBe("same");
  });

  it("returns null on tampering", () => {
    const enc = encryptSecret("payload");
    const tampered = enc.slice(0, -4) + (enc.slice(-4) === "AAAA" ? "BBBB" : "AAAA");
    expect(decryptSecret(tampered)).toBeNull();
  });

  it("returns null when the key changed (rotation invalidates old values)", () => {
    const enc = encryptSecret("payload");
    process.env.ENCRYPTION_KEY = "a-totally-different-key-16+chars-xx";
    expect(decryptSecret(enc)).toBeNull();
  });

  it("returns null for non-encrypted / malformed input", () => {
    expect(decryptSecret("plaintext")).toBeNull();
    expect(decryptSecret("")).toBeNull();
    expect(decryptSecret("rrenc1:not-base64-!!!")).toBeNull();
  });

  it("throws when encrypting without a key (callers must gate on availability)", () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => encryptSecret("x")).toThrow(/ENCRYPTION_KEY/);
  });

  it("handles unicode and long values", () => {
    const secret = "café—🔑—" + "x".repeat(5000);
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });
});
