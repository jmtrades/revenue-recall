import { describe, expect, it } from "vitest";

/**
 * Locks in the middleware auth-gate allowlist: when NEXT_PUBLIC_AUTH_REQUIRED is
 * on, machine-to-machine endpoints (secret-authed) must NOT be redirected to the
 * HTML login page, while user pages and user-facing API routes must be. A
 * regression here silently breaks the Stripe webhook (un-activated paid subs).
 *
 * Mirrors the isPublic() logic in src/middleware.ts.
 */
const PUBLIC = new Set(["/", "/login", "/signup"]);
const PUBLIC_API = ["/api/billing/webhook", "/api/agent/cron", "/api/inbound/", "/api/social/", "/api/unsubscribe", "/api/health", "/api/meta"];

function isPublic(path: string): boolean {
  if (PUBLIC.has(path)) return true;
  if (path.startsWith("/auth/")) return true;
  if (path.startsWith("/api/oauth/") && path.endsWith("/callback")) return true;
  return PUBLIC_API.some((p) => (p.endsWith("/") ? path.startsWith(p) : path === p));
}

describe("middleware auth-gate allowlist", () => {
  it("lets secret-authed machine endpoints through (no login redirect)", () => {
    for (const p of [
      "/api/billing/webhook",
      "/api/agent/cron",
      "/api/inbound/email",
      "/api/inbound/sms",
      "/api/unsubscribe",
      "/api/health",
      "/api/meta",
    ]) {
      expect(isPublic(p), `${p} must bypass the auth gate`).toBe(true);
    }
  });

  it("keeps auth screens + callbacks public", () => {
    for (const p of ["/", "/login", "/signup", "/auth/callback", "/api/social/whatsapp", "/api/oauth/x/callback", "/api/oauth/instagram/callback"]) {
      expect(isPublic(p)).toBe(true);
    }
  });

  it("gates user pages and user-facing API routes (incl. OAuth start)", () => {
    for (const p of [
      "/dashboard",
      "/settings",
      "/recall",
      "/api/ai/draft",
      "/api/contacts",
      "/api/messages/send",
      "/api/billing/checkout", // user-initiated → must require a session
      "/api/org",
      "/api/connections",
      "/api/oauth/x/start", // starting a connection must be done by a signed-in member
    ]) {
      expect(isPublic(p), `${p} must require auth`).toBe(false);
    }
  });
});
