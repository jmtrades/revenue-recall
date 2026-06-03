import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isAuthRequired } from "@/lib/config";
import { isPublicRoute } from "@/lib/route-access";

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

  return res;
}

export const config = {
  // Run on everything except static assets and the manifest/sitemap/robots.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
