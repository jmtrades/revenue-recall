"use client";

import { useEffect } from "react";

// Only the two self-serve paid plans check out in-app; Scale is sales-assisted.
const PAID_PLANS = new Set(["growth", "team"]);

/**
 * Remembers which paid plan a visitor chose on the pricing page (?plan=…) by
 * dropping a short-lived cookie, so after they sign up and finish onboarding the
 * dashboard can auto-open checkout for that plan. A cookie (not a query param)
 * because it has to survive the multi-redirect auth flow — email confirmation,
 * OAuth callback, onboarding — without getting dropped.
 */
export function RememberPlan({ plan }: { plan?: string }) {
  useEffect(() => {
    if (plan && PAID_PLANS.has(plan)) {
      document.cookie = `rr_plan=${plan}; path=/; max-age=1800; samesite=lax`;
    }
  }, [plan]);
  return null;
}
