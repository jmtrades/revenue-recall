import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Public routes that never require a session.
const PUBLIC = new Set(["/", "/login", "/signup"]);

function isPublic(path: string): boolean {
  if (PUBLIC.has(path)) return true;
  return path.startsWith("/auth/"); // OAuth / email-confirm callback
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
  const authRequired = process.env.NEXT_PUBLIC_AUTH_REQUIRED === "true";

  // Signed-in users shouldn't sit on the auth screens.
  if (userId && (path === "/login" || path === "/signup")) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Gate app PAGES only when auth is required (keeps the public demo working).
  // API routes are never redirected to /login: machine callers (Stripe webhook,
  // cron, inbound email/SMS, unsubscribe) authenticate by their own secret, and
  // a 307 to an HTML login page would silently break them — most importantly the
  // billing webhook, which would leave paid subscriptions un-activated. Each API
  // route enforces its own auth and returns JSON 401 when needed.
  if (authRequired && !userId && !isPublic(path) && !path.startsWith("/api/")) {
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
