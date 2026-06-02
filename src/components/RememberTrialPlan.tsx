"use client";

import { useEffect } from "react";

// Only the two self-serve paid plans start a trial; Scale is sales-assisted.
const TRIAL_PLANS = new Set(["growth", "team"]);

/**
 * Remembers which paid plan a visitor chose on the pricing page (?plan=…) by
 * dropping a short-lived cookie, so after they sign up and finish onboarding the
 * dashboard can auto-open their card-required trial checkout. A cookie (not a
 * query param) because it has to survive the multi-redirect auth flow — email
 * confirmation, OAuth callback, onboarding — without getting dropped.
 */
export function RememberTrialPlan({ plan }: { plan?: string }) {
  useEffect(() => {
    if (plan && TRIAL_PLANS.has(plan)) {
      document.cookie = `rr_trial_plan=${plan}; path=/; max-age=1800; samesite=lax`;
    }
  }, [plan]);
  return null;
}
