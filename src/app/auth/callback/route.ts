import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Only allow internal app paths (blocks //evil.com and absolute URLs). */
function safeNext(next: string | null): string {
  const s = next ?? "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/dashboard";
}

/** Exchanges an OAuth / email-confirmation code for a session, then redirects.
 *  On failure (expired or already-used link), sends the user back to /login with
 *  a friendly flag rather than silently bouncing through the dashboard. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=link", url.origin));
  }

  const sb = getServerSupabase();
  if (!sb) return NextResponse.redirect(new URL("/login?error=config", url.origin));

  const { error } = await sb.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/login?error=link", url.origin));
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
