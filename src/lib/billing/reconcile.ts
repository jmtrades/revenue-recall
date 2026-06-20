import { billingConfigured, planForPriceResolved, stripeGet } from "@/lib/billing/stripe";
import { saveSubscriptionForOrg, type SubStatus } from "@/lib/billing/store";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { logError, logInfo, errMessage } from "@/lib/log";
import type { PlanId } from "@/lib/billing/plans";

/**
 * Stripe ↔ DB reconciliation. The webhook is the fast path that grants/updates
 * plans, but webhook-only sync drifts eventually: an event lost past Stripe's
 * ~3-day retry window, a subscription created or fixed by hand in the Stripe
 * dashboard, or a transient bug that 200'd a write it didn't make — all leave a
 * paying customer on the wrong plan with nothing to repair it. This sweep runs
 * on the hourly platform tick and converges both directions:
 *
 *   pass 1 — every local row that claims a Stripe subscription is re-read from
 *            Stripe and corrected (status, plan, seats, period end; a deleted
 *            subscription downgrades to free/canceled);
 *   pass 2 — active subscriptions in Stripe whose metadata carries our org_id
 *            but that no local row knows about get (re)linked, which covers a
 *            lost checkout.session.completed.
 *
 * Bounded per run (oldest-updated rows first) so the tick stays cheap; every
 * repair is logged so drift is observable, not silent.
 */

export interface ReconcileResult {
  checked: number;
  repaired: number;
  relinked: number;
  errors: number;
}

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

interface StripeSubItem {
  price?: { id?: string };
  quantity?: number;
  current_period_end?: number;
}
interface StripeSub {
  id?: string;
  status?: string;
  customer?: string;
  current_period_end?: number;
  metadata?: Record<string, string>;
  items?: { data?: StripeSubItem[] };
}

interface LocalRow {
  org_id: string;
  plan: string;
  status: string;
  seats: number | null;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  current_period_end: string | null;
}

async function expectedFromStripe(sub: StripeSub): Promise<{ plan?: PlanId; status: SubStatus; seats?: number; currentPeriodEnd?: string }> {
  const first = sub.items?.data?.[0];
  return {
    plan: await planForPriceResolved(first?.price?.id),
    status: mapStatus(String(sub.status ?? "")),
    seats: typeof first?.quantity === "number" ? first.quantity : undefined,
    currentPeriodEnd: iso(sub.current_period_end ?? first?.current_period_end),
  };
}

function drifted(row: LocalRow, want: { plan?: PlanId; status: SubStatus; seats?: number; currentPeriodEnd?: string }): boolean {
  if (want.plan && want.plan !== row.plan) return true;
  if (want.status !== row.status) return true;
  if (want.seats !== undefined && want.seats !== Number(row.seats ?? 1)) return true;
  if (want.currentPeriodEnd && want.currentPeriodEnd !== (row.current_period_end ?? undefined)) return true;
  return false;
}

export async function reconcileSubscriptions(limit = 25): Promise<ReconcileResult> {
  const result: ReconcileResult = { checked: 0, repaired: 0, relinked: 0, errors: 0 };
  if (!billingConfigured() || !isSupabaseConfigured()) return result;
  const sb = getSupabase()!;

  // Pass 1: verify every local claim against Stripe, oldest-updated first.
  try {
    const { data, error } = await sb
      .from("subscriptions")
      .select("org_id, plan, status, seats, stripe_subscription_id, stripe_customer_id, current_period_end")
      .not("stripe_subscription_id", "is", null)
      .order("updated_at", { ascending: true })
      .limit(limit);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as LocalRow[]) {
      result.checked += 1;
      try {
        const sub = (await stripeGet(`subscriptions/${row.stripe_subscription_id}`).catch((e: unknown) => {
          // A subscription Stripe no longer knows is a canceled one.
          if (/no such subscription/i.test(errMessage(e))) return { status: "canceled" } as StripeSub;
          throw e;
        })) as StripeSub;
        const want = await expectedFromStripe(sub);
        if (!drifted(row, want)) continue;
        await saveSubscriptionForOrg(row.org_id, {
          ...(want.plan ? { plan: want.plan } : {}),
          ...(want.status === "canceled" ? { plan: "free" } : {}),
          status: want.status,
          ...(want.seats !== undefined ? { seats: want.seats } : {}),
          ...(want.currentPeriodEnd ? { currentPeriodEnd: want.currentPeriodEnd } : {}),
        });
        result.repaired += 1;
        logInfo("billing.reconcile.repaired", { orgId: row.org_id, from: { plan: row.plan, status: row.status }, to: want });
      } catch (e) {
        result.errors += 1;
        logError("billing.reconcile.row_failed", { orgId: row.org_id, error: errMessage(e) });
      }
    }
  } catch (e) {
    result.errors += 1;
    logError("billing.reconcile.scan_failed", { error: errMessage(e) });
  }

  // Pass 2: active Stripe subscriptions carrying our org metadata that the DB
  // doesn't know — the lost-checkout-webhook case. One page per tick is plenty;
  // anything missed converges on the next hour.
  try {
    const listed = (await stripeGet("subscriptions?status=active&limit=100")) as { data?: StripeSub[] };
    for (const sub of listed.data ?? []) {
      const orgId = sub.metadata?.org_id;
      if (!orgId || !sub.id) continue;
      const { data } = await sb.from("subscriptions").select("stripe_subscription_id").eq("org_id", orgId).maybeSingle();
      const known = (data as { stripe_subscription_id?: string | null } | null)?.stripe_subscription_id;
      if (known === sub.id) continue;
      const want = await expectedFromStripe(sub);
      await saveSubscriptionForOrg(orgId, {
        ...(want.plan ? { plan: want.plan } : {}),
        status: want.status,
        ...(want.seats !== undefined ? { seats: want.seats } : {}),
        ...(want.currentPeriodEnd ? { currentPeriodEnd: want.currentPeriodEnd } : {}),
        stripeCustomerId: sub.customer,
        stripeSubscriptionId: sub.id,
      });
      result.relinked += 1;
      logInfo("billing.reconcile.relinked", { orgId, subscription: sub.id });
    }
  } catch (e) {
    result.errors += 1;
    logError("billing.reconcile.list_failed", { error: errMessage(e) });
  }

  return result;
}
