import { NextResponse } from "next/server";
import { z } from "zod";
import { billingConfigured, createCheckoutSession, trialDays } from "@/lib/billing/stripe";
import { getSubscription } from "@/lib/billing/store";
import { isPlanId } from "@/lib/billing/plans";
import { getSessionUser } from "@/lib/auth";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { getSupabase } from "@/lib/supabase/client";
import { getActiveOrgId } from "@/lib/supabase/tenant";
import { requireRole } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const Body = z.object({
  plan: z.string(),
  seats: z.number().int().positive().max(1000).optional(),
  cycle: z.enum(["monthly", "annual"]).optional(),
  embedded: z.boolean().optional(),
});

export async function POST(req: Request) {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  if (!billingConfigured()) {
    return NextResponse.json({ error: "Billing isn't configured. Set STRIPE_SECRET_KEY to enable checkout." }, { status: 503 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isPlanId(parsed.data.plan)) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const orgId = (await resolveActiveOrgId()) ?? (getSupabase() ? await getActiveOrgId(getSupabase()!) : null);
  if (!orgId) return NextResponse.json({ error: "No active org" }, { status: 400 });

  const [user, sub] = await Promise.all([getSessionUser(), getSubscription()]);
  const origin = new URL(req.url).origin;

  try {
    const result = await createCheckoutSession({
      plan: parsed.data.plan,
      orgId,
      seats: parsed.data.seats ?? sub.seats,
      cycle: parsed.data.cycle,
      customerEmail: user?.email,
      embedded: parsed.data.embedded,
      // Card-required free trial: a card is collected now; the trial (and the
      // "trialing" status) only begins once checkout completes, via the webhook —
      // never on intent alone, so there's no card-less trial.
      trialDays: trialDays(),
      successUrl: `${origin}/settings?billing=success`,
      cancelUrl: `${origin}/settings?billing=cancelled`,
      returnUrl: `${origin}/settings?billing=success&session_id={CHECKOUT_SESSION_ID}`,
    });
    await recordAudit("billing.checkout_started", parsed.data.plan);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Checkout failed" }, { status: 502 });
  }
}
