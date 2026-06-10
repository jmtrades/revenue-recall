import { NextResponse } from "next/server";
import { publishableKey, billingConfigured } from "@/lib/billing/stripe";
import { enforcementOn } from "@/lib/billing/enforce";

export const dynamic = "force-dynamic";

/**
 * Public client config for billing. The publishable key is designed to be
 * public (it ships in client JS normally), so this is safe to expose. Serving
 * it at runtime means embedded checkout works the instant the key is set — no
 * NEXT_PUBLIC build-time inlining, no redeploy-cache surprises.
 *
 * `enforce` reflects BILLING_ENFORCE: when false, every user has full, unmetered
 * usage (calls + everything); when true, live AI/usage is gated to paid plans.
 */
export async function GET() {
  // `configured` lets the client avoid opening checkout (and showing an error)
  // when Stripe isn't wired up yet — e.g. the post-signup auto-checkout.
  return NextResponse.json({ publishable: publishableKey() ?? null, configured: billingConfigured(), enforce: enforcementOn() });
}
