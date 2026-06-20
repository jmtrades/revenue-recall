"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import Link from "next/link";
import { requestPasswordReset, updatePassword, type AuthState } from "@/app/(auth)/actions";

const input =
  "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-fg outline-none transition-colors placeholder:text-muted/70 focus:border-brand";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="cta inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-strong px-3 py-2.5 text-sm font-semibold text-white hover:bg-brand-strong/90 disabled:opacity-60"
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

/** Forgot-password (mode="request") and set-new-password (mode="update") forms. */
export function ResetForm({ mode }: { mode: "request" | "update" }) {
  const action = mode === "request" ? requestPasswordReset : updatePassword;
  const [state, formAction] = useFormState<AuthState, FormData>(action, {});
  const [showPw, setShowPw] = useState(false);

  if (state?.message) {
    return (
      <div className="mt-6 rounded-xl border border-success/30 bg-success/[0.06] p-5 text-center">
        <p className="font-display text-base font-semibold tracking-tight text-fg">Check your email</p>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">{state.message}</p>
        <Link href="/login" className="cta mt-5 inline-flex items-center rounded-full border border-border px-5 py-2 text-sm font-semibold text-fg transition-colors hover:bg-surface-2">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-6 space-y-3">
      {mode === "request" ? (
        <input name="email" type="email" aria-label="Work email" className={input} placeholder="Work email" autoComplete="email" autoFocus required />
      ) : (
        <div className="relative">
          <input
            name="password"
            type={showPw ? "text" : "password"}
            aria-label="New password"
            className={`${input} pr-16`}
            placeholder="New password"
            autoComplete="new-password"
            minLength={8}
            autoFocus
            required
          />
          <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-xs text-muted hover:text-fg">
            {showPw ? "Hide" : "Show"}
          </button>
        </div>
      )}
      {mode === "update" && <p className="-mt-1 text-[11px] text-muted">At least 8 characters.</p>}

      {state?.error && (
        <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs leading-relaxed text-danger">{state.error}</p>
      )}

      <Submit label={mode === "request" ? "Send reset link" : "Set new password"} />

      {mode === "request" && (
        <p className="pt-1 text-center text-sm text-muted">
          Remembered it?{" "}
          <Link href="/login" className="font-medium text-brand hover:underline">Sign in</Link>
        </p>
      )}
    </form>
  );
}
