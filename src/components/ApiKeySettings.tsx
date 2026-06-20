"use client";

import { useEffect, useState } from "react";

/**
 * Developer / API settings: manage the workspace Lead Capture API key and show
 * the endpoint + a ready-to-run snippet. The plaintext key is returned by the
 * server exactly once (on generate) — we surface it in a copyable box with a
 * "won't be shown again" warning; after that only the masked prefix is known.
 */
export function ApiKeySettings({ endpoint }: { endpoint: string }) {
  // Resolve a relative path (when NEXT_PUBLIC_SITE_URL isn't set) to an absolute
  // URL using the browser origin, so the copyable snippet is always runnable.
  const [url, setUrl] = useState(endpoint);
  const [masked, setMasked] = useState<string | null>(null);
  const [present, setPresent] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (endpoint.startsWith("/") && typeof window !== "undefined") setUrl(window.location.origin + endpoint);
  }, [endpoint]);

  useEffect(() => {
    fetch("/api/keys")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setPresent(Boolean(d.present));
        setMasked(d.masked ?? null);
      })
      .catch(() => undefined);
  }, []);

  function copy(label: string, text: string) {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(label);
        setTimeout(() => setCopied(null), 2000);
      },
      () => undefined,
    );
  }

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/keys", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't generate a key.");
      setRevealed(data.key);
      setPresent(true);
      setMasked(`${String(data.key).slice(0, 14)}••••••••`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't generate a key.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/keys", { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't revoke the key.");
      setPresent(false);
      setMasked(null);
      setRevealed(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't revoke the key.");
    } finally {
      setBusy(false);
    }
  }

  const sample = revealed ?? "rr_live_YOUR_KEY";
  const curl = `curl -X POST ${url} \\
  -H "Authorization: Bearer ${sample}" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Jane Doe","email":"jane@acme.com","company":"Acme","value":5000}'`;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted">
          Push leads straight into outreach from your website, Zapier, or your backend. Every captured lead becomes a
          contact and an open deal the autonomous engine immediately starts working.{" "}
          <a href="/docs/api" target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">Read the API docs →</a>
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
      )}

      {/* Key status / actions */}
      <div className="rounded-xl border border-border bg-surface-2/50 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-fg">Workspace API key</div>
            <div className="mt-1 font-mono text-xs text-muted">{present ? masked ?? "••••••••" : "No key yet"}</div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={generate}
              disabled={busy}
              className="rounded-lg bg-brand-strong px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-strong/90 disabled:opacity-50"
            >
              {present ? "Regenerate" : "Generate key"}
            </button>
            {present && (
              <button
                onClick={revoke}
                disabled={busy}
                className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition hover:text-danger disabled:opacity-50"
              >
                Revoke
              </button>
            )}
          </div>
        </div>

        {revealed && (
          <div className="mt-4 rounded-lg border border-warn/40 bg-warn/10 p-3">
            <p className="text-xs font-medium text-warn">Copy this now — it won&apos;t be shown again.</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded bg-surface px-2 py-1.5 font-mono text-xs text-fg">{revealed}</code>
              <button
                onClick={() => copy("key", revealed)}
                className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted transition hover:text-fg"
              >
                {copied === "key" ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        )}
        {present && !revealed && (
          <p className="mt-3 text-xs text-muted">Regenerating replaces the old key — any integration using it will stop working until updated.</p>
        )}
      </div>

      {/* Endpoint + snippet */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Endpoint</span>
          <button onClick={() => copy("endpoint", url)} className="text-xs text-brand hover:underline">
            {copied === "endpoint" ? "Copied!" : "Copy"}
          </button>
        </div>
        <code className="block break-all rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs text-fg">POST {url}</code>

        <div className="mb-1 mt-4 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Example</span>
          <button onClick={() => copy("curl", curl)} className="text-xs text-brand hover:underline">
            {copied === "curl" ? "Copied!" : "Copy"}
          </button>
        </div>
        <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-[11px] leading-relaxed text-fg">{curl}</pre>
        <p className="mt-2 text-xs text-muted">
          Required: <code className="text-fg">name</code> and either <code className="text-fg">email</code> or{" "}
          <code className="text-fg">phone</code>. Optional: <code className="text-fg">company</code>,{" "}
          <code className="text-fg">title</code>, <code className="text-fg">value</code>,{" "}
          <code className="text-fg">source</code>, <code className="text-fg">notes</code>,{" "}
          <code className="text-fg">sequenceId</code>.
        </p>
        <p className="mt-3 text-xs text-muted">
          Read your data back (same key): <code className="text-fg">GET /api/v1/leads</code> ·{" "}
          <code className="text-fg">GET /api/v1/deals</code> (supports <code className="text-fg">?limit=</code>).
        </p>
      </div>
    </div>
  );
}
