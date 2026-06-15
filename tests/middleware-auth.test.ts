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
      "/api/calendar/feed",
      "/api/v1/leads",
      "/api/forms/submit",
      "/api/client-error",
      "/api/health",
    ]) {
      expect(isPublicRoute(p), `${p} must bypass the auth gate`).toBe(true);
    }
  });

  it("keeps auth screens, legal pages, and callbacks public", () => {
    for (const p of ["/", "/login", "/signup", "/reset", "/pricing", "/audit", "/status", "/privacy", "/terms", "/security", "/auth/callback", "/f/org_123", "/docs/api", "/api/social/whatsapp", "/api/oauth/x/callback"]) {
      expect(isPublicRoute(p), `${p} must be public`).toBe(true);
    }
  });

  it("keeps brand/SEO asset routes public (share-card scrapers can't log in)", () => {
    for (const p of [
      "/opengraph-image",
      "/pricing/opengraph-image",
      "/industries/real-estate/opengraph-image",
      "/apple-icon",
      "/icon",
      "/.well-known/security.txt",
      "/vendor/kokoro.web.js", // the landing voice demo loads this logged-out
    ]) {
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
      "/api/keys", // API-key management is session-gated (owner/admin)
      "/api/webhooks", // webhook config is session-gated (owner/admin)
      "/api/webhooks/test",
    ]) {
      expect(isPublicRoute(p), `${p} must require auth`).toBe(false);
    }
  });
});
