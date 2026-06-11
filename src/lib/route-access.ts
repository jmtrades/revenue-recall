/**
 * The middleware auth-gate allowlist — the single source of truth for which
 * routes are reachable without a session. Lives in its own module (not inline in
 * middleware.ts) so tests can lock the REAL logic instead of a drifting copy: a
 * silent regression here either leaks tenant data (a route wrongly public) or
 * breaks a machine webhook (a self-authed route wrongly gated).
 */

// User-facing pages reachable logged-out. Legal pages MUST be here — they're
// linked from the marketing footer and the signup consent line, and a
// login-gated privacy policy is a compliance problem. (/reset/update is NOT
// here — it needs the short recovery session the email link establishes.)
export const PUBLIC_PAGES = new Set(["/", "/login", "/signup", "/reset", "/pricing", "/privacy", "/terms", "/security", "/status"]);

// Machine-to-machine API endpoints that authenticate by their OWN secret
// (Stripe signature, CRON_SECRET, INBOUND_TOKEN, COMMS_WEBHOOK_TOKEN,
// UNSUBSCRIBE_SECRET) and must never be redirected to an HTML /login — a 307
// there would silently break the caller. Each enforces its own auth internally.
// NOTE: /api/meta is deliberately NOT here — it returns tenant data and is
// gated (it's only used by the signed-in app).
export const PUBLIC_API = [
  "/api/billing/webhook",
  "/api/billing/setup", // operator setup — self-authed by ADMIN_TOKEN (Bearer)
  "/api/billing/config", // publishable key only (public by design)
  "/api/agent/cron",
  "/api/inbound/", // email + sms
  "/api/calls/log", // call-gateway posts finished-call transcripts — self-authed by COMMS_WEBHOOK_TOKEN (Bearer)
  "/api/social/", // social webhooks — each verifies its own signature/secret
  "/api/unsubscribe",
  "/api/calendar/feed", // subscribable .ics — self-authed by an HMAC feed token
  "/api/v1/", // public Lead Capture API — each route self-auths by API key
  "/api/forms/", // hosted/embeddable lead form submit — self-authed by an HMAC form token
  "/api/bookings/", // public booking submit — self-authed by an HMAC booking token
  "/api/t", // tracked-link redirect — self-authed by an HMAC click token
  "/api/health",
];

/** True when `path` is reachable without a session. */
export function isPublicRoute(path: string): boolean {
  if (PUBLIC_PAGES.has(path)) return true;
  // Brand/SEO assets served from extensionless metadata routes (the middleware
  // matcher only skips *.png/svg/… URLs). A login redirect here breaks every
  // social-share card scraper and the iOS home-screen icon fetch.
  if (path === "/opengraph-image" || path.endsWith("/opengraph-image")) return true;
  if (path === "/twitter-image" || path.endsWith("/twitter-image")) return true;
  if (path === "/apple-icon" || path === "/icon") return true;
  if (path.startsWith("/.well-known/")) return true; // security.txt & friends
  // Staged public assets (e.g. the on-device voice engine the logged-out
  // landing demo loads). The middleware matcher only skips image extensions,
  // so /public JS must be allowlisted here or it redirects to /login.
  if (path.startsWith("/vendor/")) return true;
  if (path.startsWith("/auth/")) return true; // OAuth / email-confirm callback
  if (path.startsWith("/f/")) return true; // hosted lead-capture form (token-authed page)
  if (path.startsWith("/book/")) return true; // hosted booking page (token-authed page)
  if (path === "/docs" || path.startsWith("/docs/")) return true; // public developer docs
  if (path === "/industries" || path.startsWith("/industries/")) return true; // public per-industry marketing pages
  // Social OAuth callback: the platform redirects here with no session; the
  // signed `state` authenticates the org binding. (The /start route stays gated.)
  if (path.startsWith("/api/oauth/") && path.endsWith("/callback")) return true;
  return PUBLIC_API.some((p) => (p.endsWith("/") ? path.startsWith(p) : path === p));
}
