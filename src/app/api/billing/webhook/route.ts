import { NextResponse } from "next/server";
import { verifyStripeSignature, planForPrice } from "@/lib/billing/stripe";
import { saveSubscriptionForOrg, saveSubscriptionForCustomer, orgIdForCustomer, type SubStatus } from "@/lib/billing/store";
import { sendPaymentFailedEmail, sendCancellationEmail } from "@/lib/billing/lifecycle";
import { isPlanId } from "@/lib/billing/plans";
import { addUsageCredits } from "@/lib/ai/usage";
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

  let event: { id?: string; type?: string; data?: { object?: Record<string, unknown> } };
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
        // One-time usage top-up → credit units for the current month, not a
        // plan change. The unit decides which pool: AI messages (source
        // "topup") or talk minutes (source "voice_topup" — the meters filter
        // by source so the pools never bleed into each other). Idempotent on
        // the session id (webhook retries are safe).
        if (obj.mode === "payment" && meta.kind === "topup") {
          const topupOrg = (obj.client_reference_id as string) || (meta.org_id as string);
          const actions = Number(meta.topup_actions);
          if (topupOrg && Number.isFinite(actions) && actions > 0) {
            const source = meta.topup_unit === "minutes" ? "voice_topup" : "topup";
            await addUsageCredits({ orgId: topupOrg, actions, source, ref: obj.id as string });
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
            // No trials: a completed checkout charges immediately and is active.
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
        const items = (obj.items as { data?: { price?: { id?: string }; quantity?: number; current_period_end?: number }[] })?.data ?? [];
        const first = items[0];
        const plan = planForPrice(first?.price?.id);
        // In Stripe API 2025-03-31+, current_period_end moved from the
        // subscription top level onto the items — read both so "renews on" and
        // the period are never silently blank on a newer API version.
        const periodEnd = iso(obj.current_period_end ?? first?.current_period_end);
        if (customer) {
          await saveSubscriptionForCustomer(customer, {
            ...(plan ? { plan } : {}),
            // Keep seats in sync when a customer changes quantity in the portal.
            ...(typeof first?.quantity === "number" ? { seats: first.quantity } : {}),
            status: mapStatus(String(obj.status)),
            currentPeriodEnd: periodEnd,
          }, (obj.metadata as Record<string, string> | undefined)?.org_id);
        }
        break;
      }
      case "customer.subscription.deleted": {
        const customer = obj.customer as string;
        if (customer) {
          await saveSubscriptionForCustomer(customer, { plan: "free", status: "canceled" });
          // Win-back: a graceful goodbye that cites what the AI rep actually
          // recovered for them — the most persuasive reactivation argument we
          // have. Best-effort and deduped on the event id, same as dunning.
          const orgId = await orgIdForCustomer(customer).catch(() => null);
          if (orgId) await sendCancellationEmail(orgId, event.id).catch(() => {});
        }
        break;
      }
      case "invoice.payment_failed": {
        const customer = obj.customer as string;
        if (customer) {
          await saveSubscriptionForCustomer(customer, { status: "past_due" });
          // Dunning: tell the customer before access lapses. Best-effort — an
          // email problem must never 5xx the webhook (that's reserved for DB
          // writes, where a Stripe retry helps). Deduped on the event id.
          const orgId = await orgIdForCustomer(customer).catch(() => null);
          if (orgId) await sendPaymentFailedEmail(orgId, event.id).catch(() => {});
        }
        break;
      }
      case "customer.subscription.trial_will_end": {
        // The product no longer offers trials, so this only fires for
        // subscriptions created before trials were removed. Acknowledge and
        // ignore — the trial simply converts (or cancels) on Stripe's side.
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
    // Return 5xx so Stripe RETRIES (its backoff over ~3 days is the safety net).
    // A handler error here usually means a failed DB write — swallowing it with a
    // 200 would permanently strand a paying customer on `free`, because the
    // webhook is the ONLY path that grants a plan (there's no reconcile job).
    // Every handler is idempotent (top-ups keyed on the Stripe session id;
    // subscription writes upsert by org/customer), so a retry can't double-apply.
    logError("billing.webhook.handler_failed", { type: event.type, error: errMessage(err) });
    return NextResponse.json({ error: "handler failed; will retry" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
