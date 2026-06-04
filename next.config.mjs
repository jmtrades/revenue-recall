/** @type {import('next').NextConfig} */

// Content Security Policy. Conservative on purpose: lock down the high-value
// directives (no plugins, no <base> hijack, only self can frame/post to us, force
// https) while allowing the inline script/style Next.js injects for hydration.
// connect-src stays broad (https/wss) so first-party APIs and Supabase realtime
// keep working; tighten to explicit origins once verified in a browser.
//
// 'unsafe-eval' is required in development: Next.js's react-refresh (Fast
// Refresh) runtime evaluates module code via eval, and without it client-side
// hydration silently fails — every button/form goes dead. It is NOT included in
// production builds, where the compiled bundles need no eval.
// Verified with `next build && next start`: prod serves script-src
// 'self' 'unsafe-inline' (no eval) and all interactive flows hydrate clean.
const isDev = process.env.NODE_ENV !== "production";
// Stripe needs js.stripe.com for its script and an iframe origin for embedded
// Checkout/Elements (so on-domain checkout renders); api.stripe.com is already
// covered by the broad connect-src below.
const STRIPE_SCRIPT = "https://js.stripe.com";
const STRIPE_FRAME = "https://js.stripe.com https://checkout.stripe.com https://hooks.stripe.com";
const scriptSrc = isDev
  ? `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${STRIPE_SCRIPT}`
  : `script-src 'self' 'unsafe-inline' ${STRIPE_SCRIPT}`;
const csp = [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.stripe.com",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "media-src 'self' blob:",
  `frame-src 'self' ${STRIPE_FRAME}`,
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Force HTTPS for two years incl. subdomains (HSTS).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Allow the mic for our own on-device voice (speech recognition in role-play);
  // keep camera and geolocation off.
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
];

// The hosted lead form (/f/*) is meant to be embedded on customers' own sites,
// so it must be framable cross-origin — the opposite of the app's SAMEORIGIN
// default. Drop X-Frame-Options (no portable "allow any" value) and widen CSP
// frame-ancestors to any site; the form still posts only to our own origin
// (form-action 'self'), so an embedding page can't redirect the submission.
const formHeaders = securityHeaders
  .filter((h) => h.key !== "X-Frame-Options")
  .map((h) => (h.key === "Content-Security-Policy" ? { key: h.key, value: csp.replace("frame-ancestors 'self'", "frame-ancestors *") } : h));

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      // The embeddable form is framable anywhere…
      { source: "/f/:path*", headers: formHeaders },
      // …every other route keeps the locked-down SAMEORIGIN defaults.
      { source: "/((?!f/).*)", headers: securityHeaders },
    ];
  },
};

export default nextConfig;
