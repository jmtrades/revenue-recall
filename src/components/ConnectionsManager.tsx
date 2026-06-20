"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CONNECTION_SPECS, type ProviderSpec } from "@/lib/connections/spec";

interface ConnView {
  provider: string;
  connected: boolean;
  setFields: string[];
}

/**
 * Self-serve connect UI. Each org enters their OWN credentials for social
 * channels and their data source; secrets are encrypted at rest server-side.
 * We never receive secret values back from the server — only which fields are
 * set — so a connected card shows status without ever re-displaying a token.
 */
export function ConnectionsManager({
  initial,
  encryptionAvailable,
  kind,
  oauthProviders = [],
}: {
  initial: ConnView[];
  encryptionAvailable: boolean;
  kind: "social" | "database" | "crm";
  /** Providers whose OAuth app is configured → show a "Connect with…" button. */
  oauthProviders?: string[];
}) {
  const specs = CONNECTION_SPECS.filter((s) => s.kind === kind);
  const byProvider = new Map(initial.map((c) => [c.provider, c]));
  const oauthSet = new Set(oauthProviders);
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {!encryptionAvailable && (
        <p className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
          Set <code className="text-fg">ENCRYPTION_KEY</code> to store connection secrets securely. Until then, connecting is disabled.
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {specs.map((spec) => (
          <ConnectionCard
            key={spec.provider}
            spec={spec}
            current={byProvider.get(spec.provider)}
            disabled={!encryptionAvailable}
            oauth={oauthSet.has(spec.provider)}
            open={open === spec.provider}
            onToggle={() => setOpen(open === spec.provider ? null : spec.provider)}
            onDone={() => setOpen(null)}
          />
        ))}
      </div>
    </div>
  );
}

function ConnectionCard({
  spec,
  current,
  disabled,
  oauth,
  open,
  onToggle,
  onDone,
}: {
  spec: ProviderSpec;
  current?: ConnView;
  disabled: boolean;
  oauth: boolean;
  open: boolean;
  onToggle: () => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const connected = Boolean(current?.connected);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: spec.provider, values }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setValues({});
      onDone();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    // Confirm before tearing down a live integration — disconnecting stops sending
    // (or receiving) through it until it's reconnected.
    if (!window.confirm(`Disconnect ${spec.label}? Revenue Recall will stop using it until you reconnect.`)) return;
    setBusy(true);
    try {
      await fetch("/api/connections", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: spec.provider }) });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-surface-2 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-fg">{spec.label}</span>
            {spec.gated && <span className="pill bg-surface-2 text-muted" title="Needs platform app approval">app review</span>}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted">{spec.blurb}</p>
        </div>
        <span className={`pill shrink-0 ${connected ? "bg-success/15 text-success" : "bg-surface-2 text-muted"}`}>{connected ? "Connected" : "Not connected"}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {oauth && (
          <a
            href={`/api/oauth/${spec.provider}/start`}
            className={`rounded-lg bg-brand-strong px-3 py-1.5 text-xs font-medium text-white transition hover:bg-brand-strong/90 ${disabled ? "pointer-events-none opacity-50" : ""}`}
          >
            {connected ? `Reconnect ${spec.label}` : `Connect with ${spec.label}`}
          </a>
        )}
        <button
          onClick={onToggle}
          disabled={disabled}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-fg transition hover:bg-surface disabled:opacity-50"
        >
          {open ? "Cancel" : oauth ? "Connect with keys" : connected ? "Update" : "Connect"}
        </button>
        {connected && (
          <button onClick={disconnect} disabled={busy} className="text-xs text-muted transition hover:text-danger disabled:opacity-50">
            Disconnect
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
          {spec.fields.map((f) => (
            <label key={f.key} className="block">
              <span className="text-xs text-muted">{f.label}</span>
              <input
                type={f.secret ? "password" : "text"}
                autoComplete="off"
                value={values[f.key] ?? ""}
                placeholder={f.placeholder}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-brand"
              />
              {f.help && <span className="mt-1 block text-[11px] leading-relaxed text-muted">{f.help}</span>}
            </label>
          ))}
          {error && <p className="text-xs text-danger">{error}</p>}
          <button onClick={save} disabled={busy} className="rounded-lg bg-brand-strong px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-strong/90 disabled:opacity-50">
            {busy ? "Saving…" : "Save connection"}
          </button>
        </div>
      )}
    </div>
  );
}
