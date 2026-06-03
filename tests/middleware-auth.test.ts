import { describe, expect, it } from "vitest";
import { isPublicRoute } from "@/lib/route-access";

/**
 * Locks the REAL middleware auth-gate allowlist (imported, not a copy — a copy
 * drifts and gives false assurance). Machine endpoints (secret-authed) and
 * legal/auth pages must bypass the login gate; tenant-data routes and user pages
 * must require a session. A regression here either leaks data or breaks a
 * machine webhook (e.g. un-activated paid subs).
 */
describe("middleware auth-gate allowlist (real isPublicRoute)", () => {
  it("lets secret-authed machine endpoints through (no login redirect)", () => {
    for (const p of [
      "/api/billing/webhook",
      "/api/billing/setup",
      "/api/billing/config",
      "/api/agent/cron",
      "/api/inbound/email",
      "/api/inbound/sms",
      "/api/calls/log",
      "/api/unsubscribe",
      "/api/health",
    ]) {
      expect(isPublicRoute(p), `${p} must bypass the auth gate`).toBe(true);
    }
  });

  it("keeps auth screens, legal pages, and callbacks public", () => {
    for (const p of ["/", "/login", "/signup", "/reset", "/privacy", "/terms", "/security", "/auth/callback", "/api/social/whatsapp", "/api/oauth/x/callback"]) {
      expect(isPublicRoute(p), `${p} must be public`).toBe(true);
    }
  });

  it("gates tenant-data + user-facing routes (incl. /api/meta and OAuth start)", () => {
    for (const p of [
      "/dashboard",
      "/settings",
      "/recall",
      "/reset/update", // needs the recovery session
      "/api/meta", // returns tenant data — must NOT be public (PII-leak fix)
      "/api/ai/draft",
      "/api/contacts",
      "/api/messages/send",
      "/api/billing/checkout",
      "/api/voice/select",
      "/api/calls/diagnostics",
      "/api/oauth/x/start",
    ]) {
      expect(isPublicRoute(p), `${p} must require auth`).toBe(false);
    }
  });
});
