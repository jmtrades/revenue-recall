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

  let event: { id?: string; type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }

  // Idempotency: record the event id first; a duplicate delivery (Stripe retries)
  // short-circuits so we never double-apply credits or plan changes.
  if (event.id) {
    const { error: dupErr } = await sb.from("stripe_events").insert({ id: event.id });
    if (dupErr) {
      if (dupErr.code === "23505") return NextResponse.json({ received: true, duplicate: true });
      // If we can't record it, fail so Stripe retries rather than risk a silent drop.
      return NextResponse.json({ error: "dedupe failed" }, { status: 500 });
    }
  }

  const obj = event.data.object;
  const meta = (obj.metadata as Record<string, string>) ?? {};

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const orgId = (obj.client_reference_id as string) ?? meta.org_id;
        if (!orgId) break;

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
            await sb.rpc("increment_ai_credits", { p_org: orgId, p_amount: credits });
            if (obj.customer) await sb.from("orgs").update({ stripe_customer_id: obj.customer as string }).eq("id", orgId);
          }
        }
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const customer = obj.customer as string;
        const status = obj.status as string;
        const items = (obj.items as { data?: Array<{ price?: { id?: string }; quantity?: number; current_period_end?: number }> })?.data ?? [];
        const item = items[0];
        const priceId = item?.price?.id;
        const quantity = item?.quantity ?? 1;
        // current_period_end moved onto the item in recent API versions; fall back to the object.
        const periodEnd = item?.current_period_end ?? (obj.current_period_end as number | undefined);
        const plan = priceId ? planForPriceId(priceId) : null;

        const update: Record<string, unknown> = { plan_status: status, seats: quantity };
        if (plan) update.plan = plan;
        if (periodEnd) update.current_period_end = new Date(periodEnd * 1000).toISOString();

        // Prefer the org id we stamped on the subscription metadata; the
        // customer link may not exist yet if this event arrives before checkout.
        if (meta.org_id) {
          update.stripe_customer_id = customer;
          await sb.from("orgs").update(update).eq("id", meta.org_id);
        } else {
          await sb.from("orgs").update(update).eq("stripe_customer_id", customer);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const customer = obj.customer as string;
        if (meta.org_id) {
          await sb.from("orgs").update({ plan: "starter", plan_status: "canceled" }).eq("id", meta.org_id);
        } else {
          await sb.from("orgs").update({ plan: "starter", plan_status: "canceled" }).eq("stripe_customer_id", customer);
        }
        break;
      }
    }
  } catch {
    return NextResponse.json({ received: true, warning: "partial" });
  }

  return NextResponse.json({ received: true });
}
