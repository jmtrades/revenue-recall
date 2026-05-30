"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { signIn, signUp, type AuthState } from "@/app/(auth)/actions";
import { getBrowserSupabase } from "@/lib/supabase/browser";

const input =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-fg outline-none transition-colors placeholder:text-muted/70 focus:border-brand";

function GoogleG() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 18.9 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.6 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C40.9 36.9 44 31 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function EyeIcon({ off }: { off?: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {off ? (
        <>
          <path d="M9.9 4.2A10.9 10.9 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19" />
          <path d="M6.6 6.6A18.6 18.6 0 0 0 2 12s3 8 10 8a10.9 10.9 0 0 0 5.4-1.4" />
          <path d="M14.1 14.1a3 3 0 1 1-4.2-4.2" />
          <path d="m2 2 20 20" />
        </>
      ) : (
        <>
          <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

// Turn raw Supabase auth errors into something a person understands.
function friendlyError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login")) return "That email or password doesn't match. Try again, or reset your password.";
  if (m.includes("already registered") || m.includes("already exists")) return "An account with this email already exists — try signing in instead.";
  if (m.includes("rate limit") || m.includes("too many")) return "Too many attempts. Give it a minute and try again.";
  if (m.includes("email not confirmed")) return "Please confirm your email first — check your inbox for the link.";
  if (m.includes("password")) return msg; // password rules are already clear
  return msg;
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="cta inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2.5 text-sm font-semibold text-white hover:bg-brand/90 disabled:opacity-60"
    >
      {pending && (
        <svg className="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" />
        </svg>
      )}
      {pending ? "Please wait…" : label}
    </button>
  );
}

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next?: string }) {
  const [state, formAction] = useFormState<AuthState, FormData>(mode === "signup" ? signUp : signIn, {});
  const [showPw, setShowPw] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  async function google() {
    setGoogleBusy(true);
    try {
      const sb = getBrowserSupabase();
      await sb.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next ?? "/dashboard")}` },
      });
    } catch {
      setGoogleBusy(false);
    }
  }

  // Email-confirmation success: show a focused confirmation panel, not a tiny note.
  if (state?.message) {
    return (
      <div className="mt-6 rounded-xl border border-success/30 bg-success/[0.06] p-5 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-success/15 text-success ring-1 ring-inset ring-success/25">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect width="20" height="16" x="2" y="4" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
          </svg>
        </span>
        <p className="mt-4 font-display text-base font-semibold tracking-tight text-fg">Check your email</p>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">{state.message}</p>
        <Link href="/login" className="cta mt-5 inline-flex items-center rounded-full border border-border px-5 py-2 text-sm font-semibold text-fg transition-colors hover:bg-surface-2">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-6 space-y-3">
      {mode === "signup" && <input name="name" className={input} placeholder="Full name" autoComplete="name" autoFocus required />}
      <input name="email" type="email" className={input} placeholder="Work email" autoComplete="email" autoFocus={mode === "login"} required />
      <div className="relative">
        <input
          name="password"
          type={showPw ? "text" : "password"}
          className={`${input} pr-10`}
          placeholder="Password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          required
          minLength={mode === "signup" ? 8 : undefined}
        />
        <button
          type="button"
          onClick={() => setShowPw((v) => !v)}
          aria-label={showPw ? "Hide password" : "Show password"}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted transition-colors hover:text-fg"
        >
          <EyeIcon off={showPw} />
        </button>
      </div>
      {next && <input type="hidden" name="next" value={next} />}

      {state?.error && (
        <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs leading-relaxed text-danger">{friendlyError(state.error)}</p>
      )}

      <Submit label={mode === "signup" ? "Create account" : "Sign in"} />

      <div className="flex items-center gap-3 py-1 text-[11px] uppercase tracking-wider text-muted/60">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      <button
        type="button"
        onClick={google}
        disabled={googleBusy}
        className="cta inline-flex w-full items-center justify-center gap-2.5 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm font-medium text-fg transition-colors hover:bg-surface-2 disabled:opacity-60"
      >
        <GoogleG />
        {googleBusy ? "Connecting…" : "Continue with Google"}
      </button>

      <p className="pt-1 text-center text-[11px] leading-relaxed text-muted">
        By continuing you agree to our{" "}
        <Link href="/terms" className="text-muted underline decoration-border underline-offset-2 hover:text-fg">Terms</Link>
        {" "}and{" "}
        <Link href="/privacy" className="text-muted underline decoration-border underline-offset-2 hover:text-fg">Privacy Policy</Link>.
      </p>
    </form>
  );
}
