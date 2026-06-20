"use client";

import { useState } from "react";

/** Verify a connected email/SMS provider by sending a one-off test message. */
export function TestSend() {
  const [channel, setChannel] = useState<"email" | "sms">("email");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ provider: string; status: string; detail?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!to.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, to: to.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Test send failed");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test send failed");
    } finally {
      setBusy(false);
    }
  }

  const input = "rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand";

  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="text-sm font-medium text-fg">Send a test</p>
      <p className="mt-0.5 text-xs text-muted">Confirm your provider delivers. With nothing connected it logs (status &ldquo;logged&rdquo;).</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select value={channel} onChange={(e) => setChannel(e.target.value as "email" | "sms")} className={`${input} w-24`}>
          <option value="email">Email</option>
          <option value="sms">SMS</option>
        </select>
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder={channel === "email" ? "you@example.com" : "+15551234567"}
          className={`${input} flex-1 min-w-[12rem]`}
        />
        <button onClick={send} disabled={busy || !to.trim()} className="rounded-lg bg-brand-strong px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong/90 disabled:opacity-50">
          {busy ? "Sending…" : "Send test"}
        </button>
      </div>
      {result && (
        <p className={`mt-2 text-sm ${result.status === "failed" ? "text-danger" : "text-success"}`}>
          {result.status === "failed" ? `Failed via ${result.provider}: ${result.detail ?? "unknown error"}` : `${result.status} via ${result.provider}.`}
        </p>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
