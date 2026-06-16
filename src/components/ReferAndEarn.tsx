"use client";

import { useState } from "react";

/**
 * Share-and-earn card: a workspace's unique signup link. When a workspace they
 * refer upgrades to a paid plan, both sides are credited bonus AI messages
 * (handled server-side by the billing webhook). Pure presentation — the link is
 * built server-side from the org id.
 */
export function ReferAndEarn({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the field is selectable as a fallback */
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Share your link. When a business you refer upgrades to a paid plan,{" "}
        <span className="text-fg">you both get a generous bundle of bonus AI messages</span> — on us.
      </p>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={link}
          aria-label="Your referral link"
          onFocus={(e) => e.currentTarget.select()}
          className="w-full rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-sm text-fg outline-none focus:border-brand"
        />
        <button
          onClick={copy}
          className="shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand/90"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
