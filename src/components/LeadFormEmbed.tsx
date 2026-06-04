"use client";

import { useState } from "react";

/**
 * Developer-tab card for the hosted / embeddable lead form. Shows the public
 * form link (open/preview) and a copy-paste iframe embed. The URL carries a
 * write-only HMAC token — safe to put on any public site (it can only create a
 * lead, never read data).
 */
export function LeadFormEmbed({ formUrl, embed }: { formUrl: string; embed: string }) {
  const [copied, setCopied] = useState<string | null>(null);

  function copy(label: string, text: string) {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(label);
        setTimeout(() => setCopied(null), 2000);
      },
      () => undefined,
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Drop a contact form on any website — every submission becomes a lead the autonomous engine immediately works.
        No code beyond the snippet, and no API key exposed (the form uses a write-only token).
      </p>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Hosted form</span>
          <div className="flex gap-3">
            <a href={formUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-brand hover:underline">
              Open
            </a>
            <button onClick={() => copy("url", formUrl)} className="text-xs text-brand hover:underline">
              {copied === "url" ? "Copied!" : "Copy link"}
            </button>
          </div>
        </div>
        <code className="block break-all rounded-lg bg-surface-2 px-3 py-2 font-mono text-xs text-fg">{formUrl}</code>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Embed on your site</span>
          <button onClick={() => copy("embed", embed)} className="text-xs text-brand hover:underline">
            {copied === "embed" ? "Copied!" : "Copy"}
          </button>
        </div>
        <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-[11px] leading-relaxed text-fg">{embed}</pre>
      </div>
    </div>
  );
}
