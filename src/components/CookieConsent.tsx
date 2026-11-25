"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isEuUkTimezone } from "@/lib/ads/region";

const KEY = "rr_cookie_consent";

function needsBanner(): boolean {
  try {
    if (localStorage.getItem(KEY)) return false;
    return isEuUkTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  } catch {
    return false;
  }
}

/**
 * Minimal, dependency-free cookie-consent banner. Essential cookies (auth/session)
 * always run; analytics are opt-in. The choice is remembered in localStorage so
 * it shows once. Rendered null on the server + first client paint, so there's no
 * hydration mismatch.
 */
export function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (needsBanner()) setShow(true);
  }, []);

  function decide(choice: "accepted" | "essential") {
    try {
      localStorage.setItem(KEY, choice);
    } catch {
      /* ignore */
    }
    setShow(false);
    window.dispatchEvent(new Event("rr-ads-consent"));
  }

  if (!show) return null;

  return (
    <div
      role="region"
      aria-label="Cookie notice"
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-2xl rounded-xl border border-border bg-surface/95 p-4 shadow-lg backdrop-blur sm:flex sm:items-center sm:gap-4"
    >
      <p className="text-sm text-muted">
        We use essential cookies to run the app. With your OK we also measure ad visits from the UK and EU. See our{" "}
        <Link href="/privacy" className="text-brand hover:underline">Privacy Policy</Link>.
      </p>
      <div className="mt-3 flex shrink-0 gap-2 sm:mt-0">
        <button onClick={() => decide("essential")} className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted transition hover:text-fg">
          Essential only
        </button>
        <button onClick={() => decide("accepted")} className="rounded-lg bg-brand-strong px-3 py-1.5 text-sm font-medium text-white transition hover:bg-brand-strong/90">
          Accept
        </button>
      </div>
    </div>
  );
}
