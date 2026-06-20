"use client";

import { useState } from "react";

interface HealthResult {
  configured: boolean;
  ok?: boolean;
  model?: string;
  ms?: number;
  note?: string;
  error?: string;
}

/** Verify the live AI connection (ANTHROPIC_API_KEY) with one tiny real call —
 *  the AI counterpart to the comms "Send a test" check. */
export function AiHealthCheck() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<HealthResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/ai/health", { method: "POST" });
      const data = (await res.json()) as HealthResult;
      if (!res.ok && res.status !== 502) throw new Error(data.error ?? "Check failed");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="text-sm font-medium text-fg">Test the AI connection</p>
      <p className="mt-0.5 text-xs text-muted">Runs one tiny live completion to confirm your key works. Without a key, drafting uses templates.</p>
      <button
        onClick={check}
        disabled={busy}
        className="mt-2 rounded-lg bg-brand-strong px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong/90 disabled:opacity-50"
      >
        {busy ? "Checking…" : "Test AI"}
      </button>
      {result && (
        <p className={`mt-2 text-sm ${result.configured === false ? "text-muted" : result.ok ? "text-success" : "text-danger"}`}>
          {result.configured === false
            ? result.note
            : result.ok
              ? `Connected — ${result.model} responded in ${result.ms}ms.`
              : `Failed (${result.model}): ${result.error ?? "unknown error"}`}
        </p>
      )}
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  );
}
