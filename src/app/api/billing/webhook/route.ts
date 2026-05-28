import { NextResponse } from "next/server";
import { verifyStripeSignature, planForPrice } from "@/lib/billing/stripe";
import { saveSubscriptionForOrg, saveSubscriptionForCustomer, type SubStatus } from "@/lib/billing/store";
import { isPlanId } from "@/lib/billing/plans";

export const dynamic = "force-dynamic";

/** Map Stripe subscription status to our coarse status. */
function mapStatus(s: string): SubStatus {
  if (s === "active") return "active";
  if (s === "trialing") return "trialing";
  if (s === "past_due" || s === "unpaid") return "past_due";
  if (s === "canceled" || s === "incomplete_expired") return "canceled";
  return "none";
}

function iso(unixSeconds: unknown): string | undefined {
  const n = Number(unixSeconds);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : undefined;
}

/**
 * Stripe webhook. Verifies the signature, then reconciles subscription state.
 * Returns 200 on anything it safely handled or chose to ignore, so Stripe
 * doesn't retry indefinitely; 400 only on a bad/forged signature.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });

  const raw = await req.text();
  if (!verifyStripeSignature(raw, req.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: { type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const obj = event.data?.object ?? {};
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const orgId = (obj.client_reference_id as string) || ((obj.metadata as Record<string, unknown>)?.org_id as string);
        const metaPlan = (obj.metadata as Record<string, unknown>)?.plan;
        if (orgId) {
          await saveSubscriptionForOrg(orgId, {
            plan: isPlanId(metaPlan) ? metaPlan : "growth",
            status: "active",
            stripeCustomerId: (obj.customer as string) ?? undefined,
            stripeSubscriptionId: (obj.subscription as string) ?? undefined,
          });
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const customer = obj.customer as string;
        const items = (obj.items as { data?: { price?: { id?: string } }[] })?.data ?? [];
        const plan = planForPrice(items[0]?.price?.id);
        if (customer) {
          await saveSubscriptionForCustomer(customer, {
            ...(plan ? { plan } : {}),
            status: mapStatus(String(obj.status)),
            currentPeriodEnd: iso(obj.current_period_end),
          });
        }
        break;
      }
      case "customer.subscription.deleted": {
        const customer = obj.customer as string;
        if (customer) await saveSubscriptionForCustomer(customer, { plan: "free", status: "canceled" });
        break;
      }
      case "invoice.payment_failed": {
        const customer = obj.customer as string;
        if (customer) await saveSubscriptionForCustomer(customer, { status: "past_due" });
        break;
      }
      default:
        // Unhandled event types are acknowledged so Stripe stops retrying.
        break;
    }
  } catch {
    // Swallow handler errors with a 200 so Stripe doesn't hammer retries on a
    // transient DB hiccup; the next event (or a manual sync) will reconcile.
    return NextResponse.json({ received: true, handled: false });
  }

  return NextResponse.json({ received: true });
}
