"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getServerSupabase } from "@/lib/supabase/server";
import { getSupabase } from "@/lib/supabase/client";
import { channelStatus } from "@/lib/comms";

export interface AuthState {
  error?: string;
  message?: string;
}

function safeNext(next: FormDataEntryValue | null): string {
  const s = typeof next === "string" ? next : "";
  // Only allow internal app paths.
  return s.startsWith("/") && !s.startsWith("//") ? s : "/dashboard";
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const sb = getServerSupabase();
  if (!sb) return { error: "Authentication is not configured." };
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  redirect(safeNext(formData.get("next")));
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const sb = getServerSupabase();
  if (!sb) return { error: "Authentication is not configured." };
  const name = String(formData.get("name") ?? "");
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters for your password." };

  // Frictionless onboarding switch. Supabase AUTH emails (the confirmation link)
  // use Supabase's own SMTP — separate from the app's Resend setup — so on the
  // default SMTP they're rate-limited and often undelivered, dead-ending signup.
  // With SIGNUP_AUTOCONFIRM=true we create the account already-confirmed via the
  // service role and sign the user straight in, so onboarding never depends on
  // Supabase email deliverability. (Leave it unset to keep email confirmation.)
  const admin = getSupabase();
  if (process.env.SIGNUP_AUTOCONFIRM === "true" && admin) {
    const { error: createErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
    if (createErr && !/registered|already|exists/i.test(createErr.message)) return { error: createErr.message };
    const { error: signInErr } = await sb.auth.signInWithPassword({ email, password });
    if (signInErr) return { error: createErr ? "An account with this email already exists — try signing in." : signInErr.message };
    redirect("/onboarding"); // redirect() throws — keep outside any try
  }

  // Point the confirmation link (if the project requires one) back at our
  // callback so it completes the session and lands the user in onboarding,
  // rather than the project's default Site URL.
  const origin = headers().get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "";
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: { name },
      emailRedirectTo: origin ? `${origin}/auth/callback?next=/onboarding` : undefined,
    },
  });
  if (error) return { error: error.message };

  // If the project requires email confirmation, there's no session yet.
  if (!data.session) {
    // No way to deliver a confirmation email yet (no provider wired)? Then
    // confirm the account server-side with the service role and sign them
    // straight in, so signup never dead-ends. The moment a real email provider
    // is connected, Supabase's normal email confirmation takes over instead.
    const emailLive = channelStatus().email.live;
    if (!emailLive && data.user && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      let signedIn = false;
      if (admin) {
        try {
          await admin.auth.admin.updateUserById(data.user.id, { email_confirm: true });
          const { error: signInError } = await sb.auth.signInWithPassword({ email, password });
          signedIn = !signInError;
        } catch {
          signedIn = false;
        }
      }
      if (signedIn) redirect("/onboarding"); // redirect() throws — must be outside the try
    }
    return { message: "Check your email to confirm your account, then sign in." };
  }
  // Org is provisioned lazily on first authenticated request.
  redirect("/onboarding");
}

export async function signOut(): Promise<void> {
  const sb = getServerSupabase();
  if (sb) await sb.auth.signOut();
  redirect("/login");
}

/** Sign out of ALL devices (revoke every session for this user) — for a lost
 *  laptop or shared-login cleanup. */
export async function signOutEverywhere(): Promise<void> {
  const sb = getServerSupabase();
  if (sb) await sb.auth.signOut({ scope: "global" });
  redirect("/login");
}

/** Send a password-reset email. The link lands on /auth/callback (which
 *  establishes a short recovery session) → /reset/update to set a new password.
 *  Always reports success so we never reveal whether an account exists. */
export async function requestPasswordReset(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const sb = getServerSupabase();
  if (!sb) return { error: "Authentication is not configured." };
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email address." };
  const origin = headers().get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "";
  await sb.auth
    .resetPasswordForEmail(email, { redirectTo: origin ? `${origin}/auth/callback?next=/reset/update` : undefined })
    .catch(() => undefined); // don't leak existence / transport errors
  return { message: "If an account exists for that email, we've sent a reset link. Check your inbox." };
}

/** Set a new password for the user in the current (recovery) session. */
export async function updatePassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const sb = getServerSupabase();
  if (!sb) return { error: "Authentication is not configured." };
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters for your password." };
  // Requires an active session — the recovery link establishes one via the
  // callback. If it expired, Supabase returns an auth error we surface.
  const { error } = await sb.auth.updateUser({ password });
  if (error) return { error: "Your reset link has expired. Request a new one from the sign-in page." };
  redirect("/dashboard");
}
