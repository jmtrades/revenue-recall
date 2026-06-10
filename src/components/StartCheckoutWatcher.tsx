"use client";

import { useEffect, useState } from "react";
import { EmbeddedCheckoutModal, type CheckoutRequest } from "@/components/EmbeddedCheckoutModal";

const PAID_PLANS = new Set(["growth", "team"]);

function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}
function clearCookie(name: string): void {
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
}

/**
 * After a paid signup + onboarding, the user lands here on the dashboard — open
 * checkout for the plan they picked automatically, so "Get started" on the
 * pricing page becomes one continuous flow (sign up → pay → live) instead of
 * making them hunt for it in Settings. Fires once, then clears the cookie.
 * Renders nothing until/unless it has a plan to start.
 */
export function StartCheckoutWatcher({ eligible = true }: { eligible?: boolean }) {
  const [checkout, setCheckout] = useState<CheckoutRequest | null>(null);
  useEffect(() => {
    // Consume both the current cookie and the legacy trial-era name, so a stale
    // intent never lingers — but only open checkout for someone without an
    // active subscription (never re-prompt a paying customer).
    const plan = readCookie("rr_plan") ?? readCookie("rr_trial_plan");
    if (plan) {
      clearCookie("rr_plan");
      clearCookie("rr_trial_plan");
    }
    if (!(eligible && plan && PAID_PLANS.has(plan))) return;
    // Only auto-open checkout when billing is actually live. Otherwise a brand-new
    // owner whose Stripe isn't configured yet would be greeted by a checkout
    // error on their very first dashboard load — fail closed and stay silent;
    // they can upgrade from Settings → Billing once it's switched on.
    let cancelled = false;
    fetch("/api/billing/config")
      .then((r) => r.json())
      .then((cfg) => {
        if (!cancelled && cfg?.configured) setCheckout({ endpoint: "/api/billing/checkout", body: { plan } });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [eligible]);
  return <EmbeddedCheckoutModal request={checkout} onClose={() => setCheckout(null)} />;
}
