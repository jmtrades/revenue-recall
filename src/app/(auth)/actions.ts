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
      const admin = getSupabase();
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
