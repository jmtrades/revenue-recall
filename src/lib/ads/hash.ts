import { createHash } from "node:crypto";

/** SHA-256 hex, Meta's required normalization: trim, lowercase, digits-only phone. */
export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashEmail(email: string | null | undefined): string | undefined {
  const v = (email ?? "").trim().toLowerCase();
  if (!v || !v.includes("@")) return undefined;
  return sha256(v);
}

export function hashPhone(phone: string | null | undefined): string | undefined {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 8) return undefined;
  return sha256(digits);
}

export function hashName(name: string | null | undefined): { fn?: string; ln?: string } {
  const parts = (name ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!parts.length) return {};
  return {
    fn: sha256(parts[0]),
    ln: parts.length > 1 ? sha256(parts.slice(1).join(" ")) : undefined,
  };
}
