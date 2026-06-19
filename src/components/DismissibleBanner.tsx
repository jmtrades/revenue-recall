"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * A banner bar the user can dismiss for the session (sessionStorage). Used only
 * for the SOFT, non-urgent nudges (finish-setup hints, free-plan upsell) so they
 * stop eating vertical space on every screen once acknowledged. Urgent/safety
 * banners (payment failed, sending paused) are intentionally NOT dismissible and
 * don't use this. A new/different message re-appears (the id is content-keyed).
 */
export function DismissibleBanner({ id, className = "", children }: { id: string; className?: string; children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      if (sessionStorage.getItem(`rr:banner:${id}`)) setHidden(true);
    } catch {
      /* private mode / no storage — banner just stays visible */
    }
  }, [id]);

  if (hidden) return null;
  return (
    <div className={`flex items-center gap-3 px-4 py-2 text-sm sm:px-8 ${className}`}>
      {children}
      <button
        onClick={() => {
          try {
            sessionStorage.setItem(`rr:banner:${id}`, "1");
          } catch {
            /* ignore */
          }
          setHidden(true);
        }}
        aria-label="Dismiss for now"
        className="ml-1 shrink-0 rounded px-1 opacity-60 transition hover:opacity-100"
      >
        ✕
      </button>
    </div>
  );
}
