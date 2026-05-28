import { NextResponse } from "next/server";
import { z } from "zod";
import { billingConfigured, createCheckoutSession } from "@/lib/billing/stripe";
import { getSubscription, saveSubscription } from "@/lib/billing/store";
import { isPlanId } from "@/lib/billing/plans";
import { getSessionUser } from "@/lib/auth";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { getSupabase } from "@/lib/supabase/client";
import { getActiveOrgId } from "@/lib/supabase/tenant";

export const dynamic = "force-dynamic";

const Body = z.object({ plan: z.string(), seats: z.number().int().positive().max(1000).optional() });

export async function POST(req: Request) {
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
    const url = await createCheckoutSession({
      plan: parsed.data.plan,
      orgId,
      seats: parsed.data.seats ?? sub.seats,
      customerEmail: user?.email,
      successUrl: `${origin}/settings?billing=success`,
      cancelUrl: `${origin}/settings?billing=cancelled`,
    });
    // Record intent so the webhook (or success redirect) can reconcile.
    await saveSubscription({ status: sub.status === "none" ? "trialing" : sub.status });
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Checkout failed" }, { status: 502 });
  }
}
