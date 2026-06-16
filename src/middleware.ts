import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isAuthRequired } from "@/lib/config";
import { isPublicRoute, requiresSameOrigin, isSameOriginRequest } from "@/lib/route-access";
import { REFERRAL_COOKIE, REFERRAL_COOKIE_MAX_AGE, parseReferralCode } from "@/lib/referrals";

/** Remember a valid `?ref=<orgId>` from a shared signup link so the new workspace
 *  can be credited to its referrer at first provision. Additive + fail-open. */
function captureReferral(req: NextRequest, res: NextResponse): void {
  const code = parseReferralCode(req.nextUrl.searchParams.get("ref"));
  if (code && req.cookies.get(REFERRAL_COOKIE)?.value !== code) {
    res.cookies.set(REFERRAL_COOKIE, code, { maxAge: REFERRAL_COOKIE_MAX_AGE, httpOnly: true, sameSite: "lax", path: "/" });
  }
}

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });

  // CSRF defense-in-depth, applied first so it holds in every mode: a session-
  // cookie-authed /api mutation must be same-origin. Machine webhooks (Stripe/
  // Twilio/cron/inbound/API-key v1/HMAC form posts) are exempt — they're
  // cross-origin by design and carry their own signature/secret auth.
  if (requiresSameOrigin(req.method, req.nextUrl.pathname)) {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
    if (!isSameOriginRequest(req.headers.get("origin"), req.headers.get("referer"), host)) {
      return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
    }
  }

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
  // Supabase is configured here (we returned early above if not), so this is
  // always ON — every user gets their own gated, private workspace. It can't be
  // disabled while a database is connected, so a stray env flag can't silently
  // drop the deploy back to a shared, open workspace.
  const authRequired = isAuthRequired();

  // Signed-in users shouldn't sit on the auth screens.
  if (userId && (path === "/login" || path === "/signup")) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Gate everything that isn't public when auth is required (keeps the public
  // demo working). isPublic() allowlists the auth screens + the secret-authed
  // machine endpoints, so the Stripe webhook/cron/inbound keep working while
  // user pages and user-facing API routes still require a session.
  if (authRequired && !userId && !isPublicRoute(path)) {
    const to = new URL("/login", req.url);
    to.searchParams.set("next", path);
    return NextResponse.redirect(to);
  }

  captureReferral(req, res);
  return res;
}

export const config = {
  // Run on everything except static assets and the manifest/sitemap/robots.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
