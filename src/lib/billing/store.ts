import { isSupabaseConfigured, getSupabase } from "@/lib/supabase/client";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { getActiveOrgId } from "@/lib/supabase/tenant";
import { isPlanId, type PlanId } from "@/lib/billing/plans";

/**
 * Subscription state per org. Supabase-backed when configured, else a single
 * in-memory record so the billing UI is fully exercisable in the demo. Every
 * org starts on the free plan until a Stripe checkout completes.
 */

export type SubStatus = "none" | "trialing" | "active" | "past_due" | "canceled";

export interface Subscription {
  plan: PlanId;
  status: SubStatus;
  seats: number;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  currentPeriodEnd?: string;
  updatedAt: string;
}

export function freeSubscription(): Subscription {
  return { plan: "free", status: "none", seats: 1, updatedAt: new Date().toISOString() };
}

let memSub: Subscription | null = null;

async function orgId(): Promise<string | null> {
  return (await resolveActiveOrgId()) ?? (getSupabase() ? await getActiveOrgId(getSupabase()!) : null);
}

function mapRow(r: Record<string, unknown>): Subscription {
  return {
    plan: isPlanId(r.plan) ? r.plan : "free",
    status: (r.status as SubStatus) ?? "none",
    seats: Number(r.seats ?? 1),
    stripeCustomerId: (r.stripe_customer_id as string) ?? undefined,
    stripeSubscriptionId: (r.stripe_subscription_id as string) ?? undefined,
    currentPeriodEnd: (r.current_period_end as string) ?? undefined,
    updatedAt: (r.updated_at as string) ?? new Date().toISOString(),
  };
}

/** Current org's subscription (defaults to free when none on record). */
export async function getSubscription(): Promise<Subscription> {
  if (!isSupabaseConfigured()) return memSub ?? freeSubscription();
  const id = await orgId();
  if (!id) return freeSubscription();
  const { data } = await getSupabase()!.from("subscriptions").select("*").eq("org_id", id).maybeSingle();
  return data ? mapRow(data) : freeSubscription();
}

/** Upsert subscription state. Used by checkout completion and the webhook. */
export async function saveSubscription(patch: Partial<Subscription>): Promise<Subscription> {
  const current = await getSubscription();
  const next: Subscription = { ...current, ...patch, updatedAt: new Date().toISOString() };
  if (!isSupabaseConfigured()) {
    memSub = next;
    return next;
  }
  const id = await orgId();
  if (!id) return next;
  // The Supabase client RETURNS errors (it doesn't throw). If we don't inspect
  // and re-throw, a failed write looks successful — a paid plan silently never
  // gets granted. Throwing lets the billing webhook return non-200 so Stripe
  // retries. (Upsert is idempotent on org_id, so retries are safe.)
  const { error } = await getSupabase()!.from("subscriptions").upsert(
    {
      org_id: id,
      plan: next.plan,
      status: next.status,
      seats: next.seats,
      stripe_customer_id: next.stripeCustomerId ?? null,
      stripe_subscription_id: next.stripeSubscriptionId ?? null,
      current_period_end: next.currentPeriodEnd ?? null,
      updated_at: next.updatedAt,
    },
    { onConflict: "org_id" },
  );
  if (error) throw new Error(`subscription upsert failed: ${error.message}`);
  return next;
}

/** Upsert subscription state for a specific org id (used by the webhook, which
 * has no request session). Org id comes from the Checkout client_reference_id. */
export async function saveSubscriptionForOrg(id: string, patch: Partial<Subscription>): Promise<void> {
  if (!isSupabaseConfigured()) {
    memSub = { ...(memSub ?? freeSubscription()), ...patch, updatedAt: new Date().toISOString() };
    return;
  }
  const { error } = await getSupabase()!.from("subscriptions").upsert(
    {
      org_id: id,
      ...(patch.plan ? { plan: patch.plan } : {}),
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.seats !== undefined ? { seats: patch.seats } : {}),
      ...(patch.stripeCustomerId ? { stripe_customer_id: patch.stripeCustomerId } : {}),
      ...(patch.stripeSubscriptionId ? { stripe_subscription_id: patch.stripeSubscriptionId } : {}),
      ...(patch.currentPeriodEnd ? { current_period_end: patch.currentPeriodEnd } : {}),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "org_id" },
  );
  // Throw on a failed write so the webhook returns non-200 and Stripe retries —
  // never strand a paying customer on `free` because of a transient DB error.
  if (error) throw new Error(`subscription upsert failed (org ${id}): ${error.message}`);
}

/** The coarse subscription status for a specific org (webhook contexts have no
 *  session). Returns null when unknown / no DB — callers treat that as "not
 *  canceled" so a read hiccup never blocks a legitimate state change. */
export async function statusForOrg(orgId: string): Promise<SubStatus | null> {
  if (!isSupabaseConfigured() || !orgId) return null;
  const { data } = await getSupabase()!.from("subscriptions").select("status").eq("org_id", orgId).maybeSingle();
  return (data?.status as SubStatus | undefined) ?? null;
}

/** Find which org a Stripe customer belongs to (webhook → org resolution). */
export async function orgIdForCustomer(customerId: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await getSupabase()!.from("subscriptions").select("org_id").eq("stripe_customer_id", customerId).maybeSingle();
  return (data?.org_id as string | undefined) ?? null;
}

/** Apply a subscription change to a specific org by its Stripe customer id. */
export async function saveSubscriptionForCustomer(customerId: string, patch: Partial<Subscription>, fallbackOrgId?: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    memSub = { ...(memSub ?? freeSubscription()), ...patch, updatedAt: new Date().toISOString() };
    return;
  }
  const id = await orgIdForCustomer(customerId);
  if (!id) {
    // The customer→org mapping is written by checkout.session.completed, but
    // Stripe doesn't guarantee it arrives before subscription.created/updated.
    // When the subscription carries our org_id in metadata, upsert against it
    // (recording the customer id) so out-of-order delivery doesn't silently drop
    // the seats / period / status until the next event.
    if (fallbackOrgId) await saveSubscriptionForOrg(fallbackOrgId, { ...patch, stripeCustomerId: customerId });
    return;
  }
  const { error } = await getSupabase()!
    .from("subscriptions")
    .update({
      ...(patch.plan ? { plan: patch.plan } : {}),
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.seats !== undefined ? { seats: patch.seats } : {}),
      ...(patch.stripeSubscriptionId ? { stripe_subscription_id: patch.stripeSubscriptionId } : {}),
      ...(patch.currentPeriodEnd ? { current_period_end: patch.currentPeriodEnd } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("org_id", id);
  if (error) throw new Error(`subscription update failed (customer ${customerId}): ${error.message}`);
}
