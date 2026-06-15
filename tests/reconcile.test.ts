import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { reconcileSubscriptions } from "@/lib/billing/reconcile";

// Re-landed from PR #310 (Stripe↔DB reconciliation). Without billing or a DB it
// must be a safe no-op (the cron calls it every tick on every deploy).
const SAVED = { ...process.env };
beforeEach(() => {
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
});
afterEach(() => { process.env = { ...SAVED }; });

describe("reconcileSubscriptions", () => {
  it("is a no-op when billing/Supabase aren't configured", async () => {
    const r = await reconcileSubscriptions();
    expect(r).toEqual({ checked: 0, repaired: 0, relinked: 0, errors: 0 });
  });
});
