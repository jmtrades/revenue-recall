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
export const PUBLIC_PAGES = new Set(["/", "/login", "/signup", "/reset", "/pricing", "/audit", "/privacy", "/terms", "/security", "/status"]);

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
  "/api/client-error", // browser-error intake — rate-limited, schema-clamped, always 204 (errors on logged-out pages matter too)
  "/api/voice/preview", // public landing voice demo — fixed lines only, rate-limited, cached
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

// ---------------------------------------------------------------------------
// CSRF defense-in-depth. Supabase's session cookies are SameSite=Lax (which
// already blocks cross-site cookie POSTs), but we add an explicit same-origin
// assertion on top: a state-changing /api call authed by the session cookie
// must originate from our own site. The signature/secret-authed machine
// endpoints (Stripe & Twilio webhooks, the cron fan-out, inbound, the public
// API-key v1 routes, HMAC form/booking posts) are LEGITIMATELY cross-origin and
// carry their own auth — so they're exempt (they're exactly the isPublicRoute
// /api set). The two layers mean a browser CSRF can't ride a logged-in session
// even if a future cookie-policy change weakened SameSite.
// ---------------------------------------------------------------------------

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** True when a request must prove it's same-origin: a mutating method, an /api
 *  route, and NOT one of the self-authed machine endpoints. */
export function requiresSameOrigin(method: string, path: string): boolean {
  if (!MUTATING_METHODS.has(method.toUpperCase())) return false;
  if (!path.startsWith("/api/")) return false; // page Server Actions are CSRF-guarded by Next itself
  return !isPublicRoute(path);
}

function hostOf(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).host;
  } catch {
    return null;
  }
}

/** True when the request's Origin (or, failing that, Referer) host matches the
 *  serving host. Browsers always send Origin on non-GET fetch/XHR, so a real
 *  same-origin app call passes; a cross-site forge does not. A mutation with no
 *  Origin AND no Referer fails closed. */
export function isSameOriginRequest(origin: string | null, referer: string | null, host: string | null): boolean {
  if (!host) return false;
  const reqHost = hostOf(`https://${host}`) ?? host;
  const src = hostOf(origin) ?? hostOf(referer);
  return src !== null && src === reqHost;
}
