import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Only allow internal app paths (blocks //evil.com and absolute URLs). */
function safeNext(next: string | null): string {
  const s = next ?? "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/dashboard";
}

/** Completes a sign-in from either flow, then redirects:
 *   - OAuth / PKCE: `?code=…`            → exchangeCodeForSession
 *   - email confirm / magic link: `?token_hash=…&type=…` → verifyOtp
 *  On a missing/expired/used link, sends the user back to /login with a friendly
 *  flag rather than silently bouncing through the dashboard. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(url.searchParams.get("next"));

  // The provider can bounce back here with an error instead of a code — e.g. the
  // Google provider isn't enabled in Supabase, or the user cancelled. Surface
  // that distinctly rather than mislabeling it as an expired link.
  const providerError = url.searchParams.get("error_description") || url.searchParams.get("error");
  if (providerError && !code && !tokenHash) {
    const cancelled = /access_denied|cancel/i.test(providerError);
    return NextResponse.redirect(new URL(`/login?error=${cancelled ? "cancelled" : "provider"}`, url.origin));
  }

  const sb = getServerSupabase();
  if (!sb) return NextResponse.redirect(new URL("/login?error=config", url.origin));

  let error = null;
  if (code) {
    ({ error } = await sb.auth.exchangeCodeForSession(code));
  } else if (tokenHash && type) {
    ({ error } = await sb.auth.verifyOtp({ type, token_hash: tokenHash }));
  } else {
    return NextResponse.redirect(new URL("/login?error=link", url.origin));
  }

  if (error) {
    return NextResponse.redirect(new URL("/login?error=link", url.origin));
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
