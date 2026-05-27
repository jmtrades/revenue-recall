"use server";

import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/comms";

async function sendWelcome(email: string, name: string): Promise<void> {
  const first = name?.split(" ")[0] || "there";
  try {
    await sendEmail(
      email,
      "Welcome to Revenue Recall",
      `Hi ${first},\n\nYour Revenue Recall workspace is ready. Three quick steps to value:\n\n1. Pick your industry and connect a CRM — or start fresh with the built-in one.\n2. Open the Revenue Recall queue to see the deals quietly going cold.\n3. Let the AI draft the outreach in your voice and close the loop.\n\nNeed a hand? Just reply to this email.\n\n— The Revenue Recall team`,
    );
  } catch {
    /* never block signup on a welcome email */
  }
}

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

  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });
  if (error) return { error: error.message };

  await sendWelcome(email, name);

  // If the project requires email confirmation, there's no session yet.
  if (!data.session) {
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
