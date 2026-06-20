"use client";

import { useEffect, useState } from "react";

/**
 * Developer-tab card for the org's outbound webhook. Set an https endpoint to
 * receive signed events (lead.created today). The signing secret is shown once
 * on save; a "Send test" button posts a ping so the receiver can be verified.
 */
export function WebhookSettings() {
  const [url, setUrl] = useState("");
  const [configured, setConfigured] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/webhooks")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setConfigured(Boolean(d.configured));
        if (d.url) setUrl(d.url);
      })
      .catch(() => undefined);
  }, []);

  async function save() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/webhooks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't save the webhook.");
      setConfigured(true);
      setSecret(data.secret);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the webhook.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/webhooks/test", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Test failed.");
      setNote(data.delivered ? `Delivered (HTTP ${data.status ?? "200"}).` : "Sent, but your endpoint didn't return success.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/webhooks", { method: "DELETE" });
      if (!res.ok) throw new Error("Couldn't remove the webhook.");
      setConfigured(false);
      setSecret(null);
      setUrl("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove the webhook.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Get events pushed to your systems in real time. We POST signed JSON when things happen —{" "}
        <code className="text-fg">lead.created</code>, <code className="text-fg">message.received</code>,{" "}
        <code className="text-fg">deal.won</code>, and more.
      </p>

      {error && <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
      {note && <div className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">{note}</div>}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted">Endpoint URL</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://hooks.yourapp.com/revenue-recall"
            className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 font-mono text-xs text-fg outline-none focus:border-brand"
          />
        </div>
        <button
          onClick={save}
          disabled={busy || !url}
          className="rounded-lg bg-brand-strong px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-strong/90 disabled:opacity-50"
        >
          Save
        </button>
        {configured && (
          <>
            <button onClick={sendTest} disabled={busy} className="rounded-lg border border-border px-3 py-2 text-sm text-fg transition hover:border-brand/50 disabled:opacity-50">
              Send test
            </button>
            <button onClick={remove} disabled={busy} className="rounded-lg border border-border px-3 py-2 text-sm text-muted transition hover:text-danger disabled:opacity-50">
              Remove
            </button>
          </>
        )}
      </div>

      {secret && (
        <div className="rounded-lg border border-warn/40 bg-warn/10 p-3">
          <p className="text-xs font-medium text-warn">Signing secret — copy it now, it won&apos;t be shown again.</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-surface px-2 py-1.5 font-mono text-xs text-fg">{secret}</code>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(secret).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }, () => undefined);
              }}
              className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted transition hover:text-fg"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      )}

      <p className="text-xs text-muted">
        Verify each delivery: <code className="text-fg">X-RR-Signature: sha256=HMAC_SHA256(secret, rawBody)</code>. The
        event name is also in <code className="text-fg">X-RR-Event</code>.
      </p>
    </div>
  );
}
