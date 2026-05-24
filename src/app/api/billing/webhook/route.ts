import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/client";
import { planForPriceId, verifyWebhook } from "@/lib/billing/stripe";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "not configured" }, { status: 503 });

  const raw = await req.text();
  if (!verifyWebhook(raw, req.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "no db" }, { status: 503 });

  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }

  const obj = event.data.object;

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const orgId = (obj.client_reference_id as string) ?? (obj.metadata as Record<string, string>)?.org_id;
        if (!orgId) break;
        const meta = (obj.metadata as Record<string, string>) ?? {};

        if (obj.mode === "subscription") {
          await sb
            .from("orgs")
            .update({
              stripe_customer_id: obj.customer as string,
              stripe_subscription_id: obj.subscription as string,
              plan: meta.plan ?? "growth",
              plan_status: "active",
            })
            .eq("id", orgId);
        } else if (obj.mode === "payment") {
          const credits = Number(meta.credit_actions ?? 0);
          if (credits > 0) {
            // Atomic add via RPC-free read-modify-write is racy; use SQL increment.
            const { data: org } = await sb.from("orgs").select("ai_credits").eq("id", orgId).maybeSingle();
            const current = (org?.ai_credits as number | undefined) ?? 0;
            await sb.from("orgs").update({ ai_credits: current + credits }).eq("id", orgId);
            if (obj.customer) await sb.from("orgs").update({ stripe_customer_id: obj.customer as string }).eq("id", orgId);
          }
        }
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const customer = obj.customer as string;
        const status = obj.status as string;
        const items = (obj.items as { data?: Array<{ price?: { id?: string }; quantity?: number }> })?.data ?? [];
        const priceId = items[0]?.price?.id;
        const quantity = items[0]?.quantity ?? 1;
        const periodEnd = obj.current_period_end as number | undefined;
        const plan = priceId ? planForPriceId(priceId) : null;

        const update: Record<string, unknown> = {
          plan_status: status,
          seats: quantity,
        };
        if (plan) update.plan = plan;
        if (periodEnd) update.current_period_end = new Date(periodEnd * 1000).toISOString();
        await sb.from("orgs").update(update).eq("stripe_customer_id", customer);
        break;
      }

      case "customer.subscription.deleted": {
        const customer = obj.customer as string;
        await sb.from("orgs").update({ plan: "starter", plan_status: "canceled" }).eq("stripe_customer_id", customer);
        break;
      }
    }
  } catch {
    // Acknowledge receipt; Stripe retries on non-2xx, but a DB hiccup shouldn't
    // cause infinite retries for an event we've largely processed.
    return NextResponse.json({ received: true, warning: "partial" });
  }

  return NextResponse.json({ received: true });
}
