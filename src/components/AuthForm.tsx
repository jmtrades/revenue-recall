"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const input = "w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-white outline-none focus:border-brand";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    // Auth is wired at launch; for now we proceed into the product.
    router.push(mode === "signup" ? "/onboarding" : "/");
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-3">
      {mode === "signup" && <input className={input} placeholder="Full name" required />}
      <input className={input} type="email" placeholder="Work email" required />
      <input className={input} type="password" placeholder="Password" required />
      <button type="submit" disabled={busy} className="w-full rounded-lg bg-brand px-3 py-2.5 text-sm font-medium text-white transition hover:bg-brand/90 disabled:opacity-50">
        {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
      </button>
      <button type="button" onClick={() => router.push(mode === "signup" ? "/onboarding" : "/")} className="w-full rounded-lg border border-border px-3 py-2.5 text-sm text-white transition hover:bg-surface-2">
        Continue with Google
      </button>
      <p className="pt-1 text-center text-[11px] text-muted">Authentication connects to your provider at launch.</p>
    </form>
  );
}
