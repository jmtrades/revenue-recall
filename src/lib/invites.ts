/**
 * Team invitations — shared, client-safe core. Pure helpers + types only, no
 * server/database imports, so client components (the invite form) and tests can
 * import this freely. Server-side DB operations live in `invites-server.ts`.
 */

export type InviteRole = "admin" | "manager" | "rep";
export const INVITE_ROLES: InviteRole[] = ["admin", "manager", "rep"];

export interface Invitation {
  id: string;
  email: string;
  role: InviteRole;
  status: "pending" | "accepted" | "revoked";
  createdAt: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Parse a free-text list (textarea, commas, semicolons, whitespace) into a
 *  clean, lowercased, de-duplicated, validated, capped set of emails. */
export function parseInviteEmails(raw: string, cap = 50): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tok of (raw ?? "").split(/[\s,;]+/)) {
    const e = tok.trim().toLowerCase();
    if (!e || !EMAIL_RE.test(e) || seen.has(e)) continue;
    seen.add(e);
    out.push(e);
    if (out.length >= cap) break;
  }
  return out;
}

/** Coerce arbitrary input to a valid invite role (defaults to the safest, rep). */
export function normalizeRole(r: unknown): InviteRole {
  return INVITE_ROLES.includes(r as InviteRole) ? (r as InviteRole) : "rep";
}

/** URL-safe random token (globalThis crypto — no node import, works everywhere). */
export function inviteToken(): string {
  return `${globalThis.crypto.randomUUID()}${globalThis.crypto.randomUUID()}`.replace(/-/g, "");
}

/**
 * Seat-cap check for inviting teammates. `occupied` = members + pending invites
 * that already hold a seat; `adding` = brand-new seats this batch would add;
 * `seatLimit` = the plan's seat entitlement (Infinity = unlimited). Returns how
 * many of `adding` fit, and whether the batch must be rejected.
 */
export function seatBudget(occupied: number, adding: number, seatLimit: number): { remaining: number; exceeded: boolean } {
  if (!Number.isFinite(seatLimit)) return { remaining: Infinity, exceeded: false };
  const remaining = Math.max(0, seatLimit - occupied);
  return { remaining, exceeded: adding > remaining };
}
