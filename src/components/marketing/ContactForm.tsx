"use client";

import { useState } from "react";

export function ContactForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "contact" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        setStatus("error");
        return;
      }
      setStatus("done");
    } catch {
      setError("Network error. Try again.");
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <div className="rounded-2xl border border-success/40 bg-success/10 p-6 text-center">
        <div className="text-2xl">✓</div>
        <p className="mt-2 font-semibold text-white">Thanks — we&apos;ll be in touch.</p>
        <p className="mt-1 text-sm text-muted">In a hurry? Email us directly at sales@revenue-recall.app.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-border bg-surface p-6">
      <label className="block text-sm text-muted">Work email</label>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
        autoComplete="email"
        className="mt-1.5 w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-white outline-none focus:border-brand"
      />
      {status === "error" && (
        <p className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>
      )}
      <button
        type="submit"
        disabled={status === "loading"}
        className="mt-4 w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand/90 disabled:opacity-50"
      >
        {status === "loading" ? "Sending…" : "Request a callback"}
      </button>
      <p className="mt-3 text-center text-[11px] text-muted">We&apos;ll only use this to get back to you.</p>
    </form>
  );
}
