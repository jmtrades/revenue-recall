"use server";

import { redirect } from "next/navigation";
import { SITE_URL } from "@/lib/site";
import { headers } from "next/headers";
import { getServerSupabase } from "@/lib/supabase/server";
import { getSupabase } from "@/lib/supabase/client";
import { channelStatus } from "@/lib/comms";
import { distributedRateLimit } from "@/lib/ratelimit";
import { inviteOnlyEnabled } from "@/lib/config";
import { hasPendingInvite } from "@/lib/invites-server";
import { anyOrgExists } from "@/lib/supabase/provision";

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
  // Per-IP login throttle — defense-in-depth against password brute-force /
  // credential stuffing (don't rely solely on the upstream auth provider's caps).
  const ip = headers().get("x-forwarded-for")?.split(",")[0]?.trim() || headers().get("x-real-ip") || "unknown";
  if (!(await distributedRateLimit(`login:${ip}`, 10, 60_000)).ok) return { error: "Too many attempts. Please wait a minute and try again." };
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  redirect(safeNext(formData.get("next")));
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const sb = getServerSupabase();
  if (!sb) return { error: "Authentication is not configured." };
  // Per-IP signup throttle — bounds mass-signup abuse (important with the
  // confirm-on-create default below, which removes the email-send rate cap).
  const ip = headers().get("x-forwarded-for")?.split(",")[0]?.trim() || headers().get("x-real-ip") || "unknown";
  if (!(await distributedRateLimit(`signup:${ip}`, 10, 60_000)).ok) return { error: "Too many sign-up attempts. Please wait a minute and try again." };
  const name = String(formData.get("name") ?? "");
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: "Use at least 8 characters for your password." };

  // Invite-only (private) deployment: don't even create an auth account for an
  // uninvited self-signup — turn them away with a clear message. The first user
  // on a fresh deployment (no org yet) is allowed through to become the owner.
  // Provisioning enforces the same rule for Google OAuth; this is just the early,
  // friendly "you need an invite" feedback for the email/password form.
  if (inviteOnlyEnabled()) {
    const [invited, orgExists] = await Promise.all([hasPendingInvite(email), anyOrgExists()]);
    if (!invited && orgExists) {
      return { error: "Revenue Recall is invite-only. Ask your admin to send you an invite, then sign in." };
    }
  }

  // Frictionless onboarding by DEFAULT. Supabase AUTH emails (the confirmation
  // link) use Supabase's own SMTP — separate from the app's Resend — so on the
  // default SMTP they're rate-limited (~2-3/hr) and often undelivered, which
  // dead-ends every signup. So unless email verification is explicitly required,
  // we create the account already-confirmed via the service role and sign the
  // user straight in — onboarding never depends on Supabase email deliverability.
  // To require verification instead, set SIGNUP_REQUIRE_EMAIL_CONFIRM=true AND
  // configure custom SMTP in Supabase so the emails actually deliver.
  const admin = getSupabase();
  if (admin && process.env.SIGNUP_REQUIRE_EMAIL_CONFIRM !== "true") {
    const { error: createErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
    if (createErr && !/registered|already|exists/i.test(createErr.message)) return { error: createErr.message };
    const { error: signInErr } = await sb.auth.signInWithPassword({ email, password });
    if (signInErr) return { error: createErr ? "An account with this email already exists — try signing in." : signInErr.message };
    redirect("/onboarding"); // redirect() throws — keep outside any try
  }

  // Point the confirmation link (if the project requires one) back at our
  // callback so it completes the session and lands the user in onboarding,
  // rather than the project's default Site URL.
  const origin = headers().get("origin") || SITE_URL || "";
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
  // Per-IP throttle — bounds reset-email spam to any address.
  const ip = headers().get("x-forwarded-for")?.split(",")[0]?.trim() || headers().get("x-real-ip") || "unknown";
  if (!(await distributedRateLimit(`reset:${ip}`, 5, 60_000)).ok) return { message: "If an account exists for that email, we've sent a reset link. Check your inbox." };
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email address." };
  const origin = headers().get("origin") || SITE_URL || "";
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
