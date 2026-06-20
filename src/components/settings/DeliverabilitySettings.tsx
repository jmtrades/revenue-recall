"use client";

import { useState } from "react";
import type { DnsRecord, DomainAuthStatus } from "@/lib/deliverability";

/**
 * Settings → Deliverability. Shows the SPF/DKIM/DMARC DNS records to add for the
 * sending domain, and a live "Check" that verifies SPF + DMARC are in place.
 */
interface Props {
  domain: string | null;
  provider: string;
  records: DnsRecord[];
}

export function DeliverabilitySettings({ domain, provider, records }: Props) {
  const [copied, setCopied] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<DomainAuthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  function copy(id: string, text: string) {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(id);
        setTimeout(() => setCopied(null), 2000);
      },
      () => undefined,
    );
  }

  async function check() {
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/deliverability/check");
      const body = (await res.json().catch(() => ({}))) as { configured?: boolean; status?: DomainAuthStatus; error?: string };
      if (!res.ok || !body.configured || !body.status) {
        setError(body.error ?? "Couldn't check right now — try again in a moment.");
        return;
      }
      setStatus(body.status);
    } catch {
      setError("Couldn't reach the checker — check your connection.");
    } finally {
      setChecking(false);
    }
  }

  if (!domain) {
    return (
      <div className="card">
        <h2 className="font-semibold text-fg">Deliverability</h2>
        <p className="mt-2 text-sm text-muted">
          Set <code className="font-mono">EMAIL_FROM</code> to your sending address (e.g. <code className="font-mono">hi@yourdomain.com</code>) to see the SPF, DKIM, and DMARC records that get your outreach into the inbox instead of spam.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-fg">Authenticate {domain}</h2>
            <p className="mt-1 text-sm text-muted">
              Add these DNS records at your domain registrar so {provider !== "log" ? provider : "your provider"} is authorized to send as {domain}. Authenticated mail is the single biggest factor in landing in the inbox.
            </p>
          </div>
          <button onClick={check} disabled={checking} className="shrink-0 rounded-lg bg-brand-strong px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong/90 disabled:opacity-60">
            {checking ? "Checking…" : "Check domain"}
          </button>
        </div>

        {error && <p className="mt-3 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

        {status && (
          <div className="mt-4 flex flex-wrap gap-2">
            <AuthBadge label="SPF" ok={status.spf.ok} unavailable={status.unavailable} />
            <AuthBadge label="DMARC" ok={status.dmarc.ok} unavailable={status.unavailable} />
            <span className="pill bg-surface-2 text-muted">DKIM — verify in your provider dashboard</span>
            {status.unavailable && <span className="text-xs text-muted">Couldn&apos;t reach DNS just now — try again shortly.</span>}
          </div>
        )}
      </div>

      <div className="card">
        <div className="space-y-4">
          {records.map((r) => (
            <div key={r.label}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wide text-muted">
                  {r.label} · {r.kind} record · host <code className="font-mono text-fg">{r.host}</code>
                </span>
                <button onClick={() => copy(r.label, r.value)} className="text-xs text-brand hover:underline">
                  {copied === r.label ? "Copied!" : "Copy"}
                </button>
              </div>
              <code className="block break-all rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs text-fg">{r.value}</code>
              {r.note && <p className="mt-1 text-xs text-muted">{r.note}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AuthBadge({ label, ok, unavailable }: { label: string; ok: boolean; unavailable?: boolean }) {
  if (unavailable) return <span className="pill bg-surface-2 text-muted">{label} — couldn&apos;t check</span>;
  return <span className={`pill ${ok ? "bg-success/15 text-success" : "bg-warn/15 text-warn"}`}>{label} {ok ? "✓ found" : "✗ missing"}</span>;
}
