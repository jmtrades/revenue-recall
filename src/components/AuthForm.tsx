"use client";

import { useFormState, useFormStatus } from "react-dom";
import { signIn, signUp, type AuthState } from "@/app/(auth)/actions";
import { getBrowserSupabase } from "@/lib/supabase/browser";

const input = "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-white outline-none focus:border-brand";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="w-full rounded-lg bg-brand px-3 py-2.5 text-sm font-medium text-white transition hover:bg-brand/90 disabled:opacity-50">
      {pending ? "Please wait…" : label}
    </button>
  );
}

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next?: string }) {
  const [state, formAction] = useFormState<AuthState, FormData>(mode === "signup" ? signUp : signIn, {});

  async function google() {
    const sb = getBrowserSupabase();
    await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next ?? "/dashboard")}` },
    });
  }

  return (
    <form action={formAction} className="mt-6 space-y-3">
      {mode === "signup" && <input name="name" className={input} placeholder="Full name (optional)" autoComplete="name" />}
      <input name="email" type="email" className={input} placeholder="Work email" autoComplete="email" required />
      <input name="password" type="password" className={input} placeholder="Password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={mode === "signup" ? 8 : undefined} />
      {next && <input type="hidden" name="next" value={next} />}

      {state?.error && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{state.error}</p>}
      {state?.message && <p className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-xs text-success">{state.message}</p>}

      <Submit label={mode === "signup" ? "Create account" : "Sign in"} />
      <button type="button" onClick={google} className="w-full rounded-lg border border-border px-3 py-2.5 text-sm text-white transition hover:bg-surface-2">
        Continue with Google
      </button>
      <p className="pt-1 text-center text-[11px] text-muted">
        By continuing you agree to our{" "}
        <a href="/terms" className="text-brand hover:underline">Terms</a> and{" "}
        <a href="/privacy" className="text-brand hover:underline">Privacy Policy</a>.
      </p>
    </form>
  );
}
