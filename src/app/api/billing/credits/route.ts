import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabase } from "@/lib/supabase/client";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { createCreditCheckout, stripeConfigured } from "@/lib/billing/stripe";
import { CREDIT_PACKS } from "@/lib/billing/plans";
import { limited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const Body = z.object({ pack: z.number().int().min(0).max(CREDIT_PACKS.length - 1) });

export async function POST(req: Request) {
  const rl = limited(req, "billing", 10, 60_000);
  if (rl) return rl;
  if (!stripeConfigured()) {
    return NextResponse.json({ error: "Billing is not configured yet." }, { status: 503 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid pack" }, { status: 400 });

  const sb = getSupabase();
  const orgId = await resolveActiveOrgId();
  if (!sb || !orgId) return NextResponse.json({ error: "No active workspace." }, { status: 401 });

  const pack = CREDIT_PACKS[parsed.data.pack];
  const { data: org } = await sb.from("orgs").select("stripe_customer_id").eq("id", orgId).maybeSingle();
  const origin = new URL(req.url).origin;

  try {
    const session = await createCreditCheckout({
      actions: pack.actions,
      price: pack.price,
      orgId,
      customerId: (org?.stripe_customer_id as string | undefined) ?? null,
      successUrl: `${origin}/settings?billing=credits`,
      cancelUrl: `${origin}/settings?billing=cancelled`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Checkout failed." }, { status: 500 });
  }
}
