import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isAuthRequired } from "@/lib/config";

// Public routes that never require a session.
const PUBLIC = new Set(["/", "/login", "/signup"]);

// Machine-to-machine API endpoints that authenticate by their OWN secret
// (Stripe signature, CRON_SECRET, INBOUND_TOKEN, UNSUBSCRIBE_SECRET) and must
// never be redirected to an HTML /login — a 307 there would silently break the
// caller. Most critically the billing webhook: gating it would leave paid
// subscriptions un-activated. Each of these enforces its own auth internally.
const PUBLIC_API = [
  "/api/billing/webhook",
  "/api/agent/cron",
  "/api/inbound/", // email + sms
  "/api/social/", // social webhooks (WhatsApp, Instagram, Messenger, Telegram, X) — each verifies its own signature/secret
  "/api/unsubscribe",
  "/api/health",
  "/api/meta",
];

function isPublic(path: string): boolean {
  if (PUBLIC.has(path)) return true;
  if (path.startsWith("/auth/")) return true; // OAuth / email-confirm callback
  // Social OAuth callback: the platform redirects here with no session; the
  // signed `state` authenticates the org binding. (The /start route stays gated.)
  if (path.startsWith("/api/oauth/") && path.endsWith("/callback")) return true;
  return PUBLIC_API.some((p) => (p.endsWith("/") ? path.startsWith(p) : path === p));
}

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // No Supabase configured → nothing to refresh or gate (demo / built-in store).
  if (!url || !key) return res;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });

  let userId: string | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    userId = null;
  }

  const path = req.nextUrl.pathname;
  // Supabase is configured here (we returned early above if not), so this
  // defaults to ON — every user gets their own gated, private workspace —
  // unless explicitly opted out with NEXT_PUBLIC_AUTH_REQUIRED=false.
  const authRequired = isAuthRequired();

  // Signed-in users shouldn't sit on the auth screens.
  if (userId && (path === "/login" || path === "/signup")) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Gate everything that isn't public when auth is required (keeps the public
  // demo working). isPublic() allowlists the auth screens + the secret-authed
  // machine endpoints, so the Stripe webhook/cron/inbound keep working while
  // user pages and user-facing API routes still require a session.
  if (authRequired && !userId && !isPublic(path)) {
    const to = new URL("/login", req.url);
    to.searchParams.set("next", path);
    return NextResponse.redirect(to);
  }

  return res;
}

export const config = {
  // Run on everything except static assets and the manifest/sitemap/robots.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
