"use client";

import { useEffect, useState } from "react";

const SEEN_KEY = "rr_exit_intent_seen";

export function ExitIntent() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(SEEN_KEY)) return;

    function trigger() {
      if (sessionStorage.getItem(SEEN_KEY)) return;
      sessionStorage.setItem(SEEN_KEY, "1");
      setOpen(true);
      cleanup();
    }
    function onMouseOut(e: MouseEvent) {
      // Cursor leaving the viewport toward the top (tab/close/address bar).
      if (e.clientY <= 0 && !e.relatedTarget) trigger();
    }
    function cleanup() {
      document.removeEventListener("mouseout", onMouseOut);
    }

    // Arm only after a short dwell so it doesn't fire on immediate bounces.
    const armed = window.setTimeout(() => {
      document.addEventListener("mouseout", onMouseOut);
    }, 6000);

    return () => {
      window.clearTimeout(armed);
      cleanup();
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "exit-intent" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong.");
        setStatus("error");
        return;
      }
      setStatus("done");
    } catch {
      setError("Network error. Try again.");
      setStatus("error");
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-fade-up"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Before you go"
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-border bg-surface p-7 ring-glow"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="absolute right-4 top-4 text-muted transition hover:text-white"
        >
          ✕
        </button>

        {status === "done" ? (
          <div className="text-center">
            <div className="text-2xl">✓</div>
            <h2 className="mt-2 text-xl font-semibold text-white">You&apos;re on the list.</h2>
            <p className="mt-2 text-sm text-muted">
              We&apos;ll be in touch. Ready now? You can start free in two minutes.
            </p>
            <a
              href="/signup"
              className="mt-5 inline-block rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand/90"
            >
              Start free — no card
            </a>
          </div>
        ) : (
          <>
            <span className="pill border border-border bg-surface/60 text-muted">Before you go</span>
            <h2 className="mt-3 text-xl font-semibold text-white">
              See how much revenue you&apos;re leaving on the table.
            </h2>
            <p className="mt-2 text-sm text-muted">
              Drop your email and we&apos;ll send the 2-minute teardown of how Revenue Recall
              surfaces the deals quietly going cold in your pipeline.
            </p>
            <form onSubmit={submit} className="mt-5 space-y-3">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Work email"
                autoComplete="email"
                className="w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-sm text-white outline-none focus:border-brand"
              />
              {status === "error" && (
                <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>
              )}
              <button
                type="submit"
                disabled={status === "loading"}
                className="w-full rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand/90 disabled:opacity-50"
              >
                {status === "loading" ? "Sending…" : "Send me the teardown"}
              </button>
            </form>
            <p className="mt-3 text-center text-[11px] text-muted">No spam. Unsubscribe anytime.</p>
          </>
        )}
      </div>
    </div>
  );
}
