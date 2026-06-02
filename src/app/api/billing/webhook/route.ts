import { NextResponse } from "next/server";
import { verifyStripeSignature, planForPrice } from "@/lib/billing/stripe";
import { saveSubscriptionForOrg, saveSubscriptionForCustomer, type SubStatus } from "@/lib/billing/store";
import { isPlanId } from "@/lib/billing/plans";
import { addUsageCredits } from "@/lib/ai/usage";
import { trialDays } from "@/lib/billing/stripe";
import { logError, errMessage } from "@/lib/log";

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
        const meta = (obj.metadata as Record<string, unknown>) ?? {};
        // One-time usage top-up → credit actions for the current month, not a
        // plan change. Idempotent on the session id (webhook retries are safe).
        if (obj.mode === "payment" && meta.kind === "topup") {
          const topupOrg = (obj.client_reference_id as string) || (meta.org_id as string);
          const actions = Number(meta.topup_actions);
          if (topupOrg && Number.isFinite(actions) && actions > 0) {
            await addUsageCredits({ orgId: topupOrg, actions, source: "topup", ref: obj.id as string });
          } else {
            // A customer paid but we can't credit it — never swallow this silently.
            logError("billing.topup.uncreditable", { session: obj.id as string, hasOrg: Boolean(topupOrg), actions: meta.topup_actions });
          }
          break;
        }
        const orgId = (obj.client_reference_id as string) || (meta.org_id as string);
        const metaPlan = meta.plan;
        if (orgId) {
          await saveSubscriptionForOrg(orgId, {
            plan: isPlanId(metaPlan) ? metaPlan : "growth",
            // Card-required trials start in "trialing"; the subscription.* and
            // invoice.payment_succeeded events flip it to "active" when the trial
            // converts. (Stripe also sends subscription.created right after.)
            status: trialDays() > 0 ? "trialing" : "active",
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
      case "invoice.payment_succeeded": {
        // A successful payment (including a retry after past_due) means the
        // subscription is in good standing — flip it back to active so a
        // customer who fixed their card isn't left locked out until the next
        // subscription.updated event. Only acts on subscription invoices.
        const customer = obj.customer as string;
        if (customer && obj.subscription) await saveSubscriptionForCustomer(customer, { status: "active" });
        break;
      }
      default:
        // Unhandled event types are acknowledged so Stripe stops retrying.
        break;
    }
  } catch (err) {
    // Swallow handler errors with a 200 so Stripe doesn't hammer retries on a
    // transient DB hiccup; the next event (or a manual sync) will reconcile.
    // Log it though — a silently-failing webhook leaves billing state stale.
    logError("billing.webhook.handler_failed", { error: errMessage(err) });
    return NextResponse.json({ received: true, handled: false });
  }

  return NextResponse.json({ received: true });
}
