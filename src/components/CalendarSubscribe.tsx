"use client";

import { useState } from "react";

/**
 * "Subscribe in your calendar" control. Reveals the org's private .ics feed URL
 * with one-click copy plus deep links into Google and Apple Calendar (webcal://).
 * The URL carries an unguessable HMAC token, so anyone who has it can read the
 * feed — we surface it deliberately, behind a click, and label it as private.
 */
export function CalendarSubscribe({ feedUrl }: { feedUrl: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // webcal:// makes calendar apps treat it as a live subscription (auto-refresh)
  // rather than a one-time import.
  const webcal = feedUrl.replace(/^https?:\/\//, "webcal://");
  const google = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;

  function copy() {
    navigator.clipboard?.writeText(feedUrl).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => undefined,
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm text-fg transition hover:border-brand/50"
        aria-expanded={open}
      >
        Subscribe in your calendar
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-border bg-surface p-4 shadow-lg">
          <p className="text-sm text-fg">Add upcoming deals & follow-ups to your calendar.</p>
          <p className="mt-1 text-xs text-muted">
            One-way sync, refreshes automatically. This is a private link — anyone with it can see your feed.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={google}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand/90"
            >
              Google Calendar
            </a>
            <a
              href={webcal}
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-fg transition hover:border-brand/50"
            >
              Apple / Outlook
            </a>
            <button
              onClick={copy}
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition hover:text-fg"
            >
              {copied ? "Copied!" : "Copy URL"}
            </button>
          </div>
          <p className="mt-3 break-all rounded-lg bg-surface-2 p-2 text-[11px] text-muted">{feedUrl}</p>
        </div>
      )}
    </div>
  );
}
