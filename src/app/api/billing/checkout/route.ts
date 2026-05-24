import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabase } from "@/lib/supabase/client";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { createSubscriptionCheckout, priceIdFor, stripeConfigured } from "@/lib/billing/stripe";

export const dynamic = "force-dynamic";

const Body = z.object({
  plan: z.enum(["growth", "scale"]),
  cycle: z.enum(["monthly", "annual"]),
});

export async function POST(req: Request) {
  if (!stripeConfigured()) {
    return NextResponse.json({ error: "Billing is not configured yet." }, { status: 503 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "plan and cycle required" }, { status: 400 });

  const sb = getSupabase();
  const orgId = await resolveActiveOrgId();
  if (!sb || !orgId) return NextResponse.json({ error: "No active workspace." }, { status: 401 });

  const priceId = priceIdFor(parsed.data.plan, parsed.data.cycle);
  if (!priceId) return NextResponse.json({ error: "That plan isn't available yet." }, { status: 400 });

  const [{ data: org }, { count }] = await Promise.all([
    sb.from("orgs").select("stripe_customer_id").eq("id", orgId).maybeSingle(),
    sb.from("members").select("*", { count: "exact", head: true }).eq("org_id", orgId),
  ]);
  const quantity = Math.max(1, count ?? 1);
  const origin = new URL(req.url).origin;

  try {
    const session = await createSubscriptionCheckout({
      priceId,
      quantity,
      orgId,
      plan: parsed.data.plan,
      customerId: (org?.stripe_customer_id as string | undefined) ?? null,
      successUrl: `${origin}/settings?billing=success`,
      cancelUrl: `${origin}/settings?billing=cancelled`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Checkout failed." }, { status: 500 });
  }
}
