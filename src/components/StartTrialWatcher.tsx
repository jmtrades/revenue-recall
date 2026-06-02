"use client";

import { useEffect, useState } from "react";
import { EmbeddedCheckoutModal, type CheckoutRequest } from "@/components/EmbeddedCheckoutModal";

const TRIAL_PLANS = new Set(["growth", "team"]);

function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}
function clearCookie(name: string): void {
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
}

/**
 * After a paid signup + onboarding, the user lands here on the dashboard — open
 * their card-required trial checkout automatically, so "Start free trial" on the
 * pricing page becomes one continuous flow (sign up → connect card → trialing)
 * instead of making them hunt for it in Settings. Fires once, then clears the
 * cookie. Renders nothing until/unless it has a plan to start.
 */
export function StartTrialWatcher() {
  const [checkout, setCheckout] = useState<CheckoutRequest | null>(null);
  useEffect(() => {
    const plan = readCookie("rr_trial_plan");
    if (plan && TRIAL_PLANS.has(plan)) {
      clearCookie("rr_trial_plan");
      setCheckout({ endpoint: "/api/billing/checkout", body: { plan } });
    }
  }, []);
  return <EmbeddedCheckoutModal request={checkout} onClose={() => setCheckout(null)} />;
}
