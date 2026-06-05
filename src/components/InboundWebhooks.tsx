"use client";

import { useState } from "react";

/**
 * The org's per-tenant inbound webhook URLs (email / SMS / bounce). Each carries
 * an org-scoped HMAC token so a provider that POSTs here lands the message on
 * THIS workspace — the multi-tenant routing that replaces the single-org default.
 * Surfaced behind copy buttons so an operator can paste each into their provider.
 */
export interface InboundUrl {
  label: string;
  hint: string;
  url: string;
}

export function InboundWebhooks({ urls }: { urls: InboundUrl[] }) {
  if (urls.length === 0) {
    return (
      <p className="text-sm text-muted">
        Set <code className="text-fg">NEXT_PUBLIC_SITE_URL</code> and an inbound secret (
        <code className="text-fg">INBOUND_SIGNING_SECRET</code>) to generate your inbound webhook URLs.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {urls.map((u) => (
        <CopyRow key={u.label} {...u} />
      ))}
    </div>
  );
}

function CopyRow({ label, hint, url }: InboundUrl) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard?.writeText(url).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => undefined,
    );
  }
  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-fg">{label}</div>
          <div className="text-xs text-muted">{hint}</div>
        </div>
        <button
          onClick={copy}
          className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition hover:text-fg"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <p className="mt-2 break-all rounded bg-surface p-2 text-[11px] text-muted">{url}</p>
    </div>
  );
}
