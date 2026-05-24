"use client";

import { useState } from "react";

async function go(path: string, body: Record<string, unknown>, onError: (m: string) => void) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data.url) {
    window.location.href = data.url as string;
    return;
  }
  onError(data.error ?? "Something went wrong.");
}

export function BillingActions() {
  const [annual, setAnnual] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  function run(key: string, path: string, body: Record<string, unknown>) {
    setBusy(key);
    setError("");
    go(path, body, (m) => {
      setError(m);
      setBusy(null);
    });
  }

  const cycle = annual ? "annual" : "monthly";

  return (
    <div className="mt-4 border-t border-border pt-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-white">Change plan</p>
        <button
          type="button"
          onClick={() => setAnnual((v) => !v)}
          className="text-xs text-brand hover:underline"
        >
          {annual ? "Billed annually (save 20%)" : "Billed monthly"} · switch
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run("growth", "/api/billing/checkout", { plan: "growth", cycle })}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand/90 disabled:opacity-50"
        >
          {busy === "growth" ? "…" : `Upgrade to Growth`}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run("scale", "/api/billing/checkout", { plan: "scale", cycle })}
          className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-white transition hover:bg-surface-2 disabled:opacity-50"
        >
          {busy === "scale" ? "…" : "Upgrade to Scale"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run("portal", "/api/billing/portal", {})}
          className="rounded-lg border border-border px-4 py-2 text-sm text-muted transition hover:bg-surface-2 hover:text-white disabled:opacity-50"
        >
          {busy === "portal" ? "…" : "Manage billing"}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run("credits", "/api/billing/credits", { pack: 1 })}
          className="rounded-lg border border-border px-4 py-2 text-sm text-muted transition hover:bg-surface-2 hover:text-white disabled:opacity-50"
        >
          {busy === "credits" ? "…" : "Buy AI credits"}
        </button>
      </div>
      {error && <p className="mt-3 text-xs text-danger">{error}</p>}
    </div>
  );
}
