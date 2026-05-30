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
const isDev = process.env.NODE_ENV !== "production";
const scriptSrc = isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' 'unsafe-inline'";
const csp = [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss:",
  "media-src 'self' blob:",
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

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
