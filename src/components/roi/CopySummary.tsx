"use client";

import { useState } from "react";

export function CopySummary({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-fg transition-colors hover:bg-surface-2"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        } catch {
          setCopied(false);
        }
      }}
    >
      {copied ? "Copied" : "Copy email"}
    </button>
  );
}
