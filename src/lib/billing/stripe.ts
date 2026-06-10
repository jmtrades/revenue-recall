import crypto from "node:crypto";
import { getPlan, type PlanId } from "@/lib/billing/plans";
import { getTopupPack } from "@/lib/billing/topups";
import { catalogForPlan, catalogForTopup } from "@/lib/billing/catalog";

/**
 * Stripe integration over the REST API (no SDK dependency — same fetch pattern
 * as the comms layer). Everything here is inert until you set STRIPE_SECRET_KEY
 * and the per-plan price ids, so the app ships honest: billing is real the
 * moment you add keys, and clearly "not configured" until then.
 */

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

export function billingConfigured(): boolean {
  return Boolean(env("STRIPE_SECRET_KEY"));
}

/**
 * Publishable key for client-side Stripe.js (embedded on-domain checkout).
 * Read at RUNTIME from STRIPE_PUBLISHABLE_KEY (no rebuild needed), with the
 * build-time NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY accepted as a fallback. The
 * client fetches it from /api/billing/config, so embedded checkout switches on
 * the moment you set the key — no redeploy-cache gotcha.
 */
export function publishableKey(): string | undefined {
  return env("STRIPE_PUBLISHABLE_KEY") ?? env("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
}

export type BillingCycle = "monthly" | "annual";

const MONTHLY_PRICE: Record<Exclude<PlanId, "free">, string> = {
  growth: "STRIPE_PRICE_GROWTH",
  team: "STRIPE_PRICE_TEAM",
  scale: "STRIPE_PRICE_SCALE",
};
const ANNUAL_PRICE: Record<Exclude<PlanId, "free">, string> = {
  growth: "STRIPE_PRICE_GROWTH_ANNUAL",
  team: "STRIPE_PRICE_TEAM_ANNUAL",
  scale: "STRIPE_PRICE_SCALE_ANNUAL",
};

/**
 * Stripe price id for a plan + cycle, if wired via env. Annual falls back to the
 * monthly price when no annual price is configured, so the annual toggle still
 * checks out (at the monthly rate) rather than dead-ending.
 */
export function priceId(plan: PlanId, cycle: BillingCycle = "monthly"): string | undefined {
  if (plan === "free") return undefined;
  if (cycle === "annual") return env(ANNUAL_PRICE[plan]) ?? env(MONTHLY_PRICE[plan]);
  return env(MONTHLY_PRICE[plan]);
}

/** Reverse a Stripe price id back to a plan (for webhook reconciliation). Checks
 *  both monthly and annual price ids. */
export function planForPrice(price: string | undefined): PlanId | undefined {
  if (!price) return undefined;
  for (const plan of ["growth", "team", "scale"] as const) {
    if (price === env(MONTHLY_PRICE[plan]) || price === env(ANNUAL_PRICE[plan])) return plan;
  }
  return undefined;
}

export async function stripePost(path: string, form: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env("STRIPE_SECRET_KEY")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(form).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = json.error as { message?: string } | undefined;
    throw new Error(err?.message ?? `Stripe ${res.status}`);
  }
  return json;
}

export async function stripeGet(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${env("STRIPE_SECRET_KEY")}` },
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = json.error as { message?: string } | undefined;
    throw new Error(err?.message ?? `Stripe ${res.status}`);
  }
  return json;
}

// Resolve a Stripe price id by its stable lookup_key (cached per server
// instance). This is what lets auto-provisioned prices work with zero pasted
// STRIPE_PRICE_* env vars — the operator env override always wins when set.
const priceIdCache = new Map<string, string>();
export async function priceIdByLookupKey(lookupKey: string): Promise<string | undefined> {
  if (priceIdCache.has(lookupKey)) return priceIdCache.get(lookupKey);
  if (!billingConfigured()) return undefined;
  try {
    const res = await stripeGet(`prices?lookup_keys[]=${encodeURIComponent(lookupKey)}&active=true&limit=1`);
    const id = ((res.data as { id?: string }[] | undefined)?.[0]?.id) ?? undefined;
    if (id) priceIdCache.set(lookupKey, id);
    return id;
  } catch {
    return undefined;
  }
}

/** Clear the lookup cache (after provisioning creates/updates prices). */
export function clearPriceCache(): void {
  priceIdCache.clear();
}

/** Price id for a plan+cycle: operator env override first, else the
 *  auto-provisioned price resolved by lookup_key. Annual falls back to monthly. */
export async function resolvePriceId(plan: PlanId, cycle: BillingCycle = "monthly"): Promise<string | undefined> {
  if (plan === "free") return undefined;
  const envId = priceId(plan, cycle);
  if (envId) return envId;
  const item = catalogForPlan(plan, cycle) ?? catalogForPlan(plan, "monthly");
  return item ? priceIdByLookupKey(item.lookupKey) : undefined;
}

/** Top-up price id: env override first, else auto-provisioned by lookup_key. */
export async function resolveTopupPriceId(packId: string): Promise<string | undefined> {
  const envId = topupPriceId(packId);
  if (envId) return envId;
  const item = catalogForTopup(packId);
  return item ? priceIdByLookupKey(item.lookupKey) : undefined;
}

export interface CheckoutInput {
  plan: PlanId;
  orgId: string;
  seats: number;
  cycle?: BillingCycle;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
  /** Embedded (on-domain) checkout: returns a clientSecret instead of a URL. */
  embedded?: boolean;
  /** Where Stripe returns the buyer after embedded checkout (use {CHECKOUT_SESSION_ID}). */
  returnUrl?: string;
}

export interface CheckoutResult {
  url?: string;
  clientSecret?: string;
}

/**
 * Stripe line-item quantity for a plan. Per-rep plans (Operator) bill
 * quantity = seats; flat plans (Autopilot, Scale) always bill quantity 1, so a
 * larger team can never inflate a flat price into seats × price.
 */
export function checkoutQuantity(plan: PlanId, seats: number): number {
  return getPlan(plan).perSeat ? Math.max(1, Math.floor(seats) || 1) : 1;
}

/** Create a Checkout session. Returns a hosted URL, or (embedded) a clientSecret
 *  so the payment runs on our own domain. */
export async function createCheckoutSession(input: CheckoutInput): Promise<CheckoutResult> {
  const price = await resolvePriceId(input.plan, input.cycle ?? "monthly");
  if (!price) throw new Error(`No Stripe price configured for the ${input.plan} plan.`);
  const form: Record<string, string> = {
    mode: "subscription",
    "line_items[0][price]": price,
    "line_items[0][quantity]": String(checkoutQuantity(input.plan, input.seats)),
    client_reference_id: input.orgId,
    "metadata[plan]": input.plan,
    "subscription_data[metadata][org_id]": input.orgId,
    allow_promotion_codes: "true",
  };
  if (input.embedded) {
    form.ui_mode = "embedded";
    form.return_url = input.returnUrl ?? input.successUrl;
  } else {
    form.success_url = input.successUrl;
    form.cancel_url = input.cancelUrl;
  }
  if (input.customerEmail) form.customer_email = input.customerEmail;
  const session = await stripePost("checkout/sessions", form);
  if (input.embedded) {
    const clientSecret = session.client_secret as string | undefined;
    if (!clientSecret) throw new Error("Stripe did not return a client secret.");
    return { clientSecret };
  }
  const url = session.url as string | undefined;
  if (!url) throw new Error("Stripe did not return a checkout URL.");
  return { url };
}

/** Stripe one-time price id for a top-up pack, if wired via env. */
export function topupPriceId(packId: string): string | undefined {
  const pack = getTopupPack(packId);
  return pack ? env(pack.priceEnv) : undefined;
}

/** Whether a top-up pack is purchasable (its Stripe price is configured). */
export function topupConfigured(packId: string): boolean {
  return Boolean(topupPriceId(packId));
}

export interface TopupCheckoutInput {
  packId: string;
  orgId: string;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
  embedded?: boolean;
  returnUrl?: string;
}

/** Create a one-time Checkout session for a usage top-up. Hosted URL, or
 *  (embedded) a clientSecret for on-domain payment. */
export async function createTopupCheckout(input: TopupCheckoutInput): Promise<CheckoutResult> {
  const pack = getTopupPack(input.packId);
  if (!pack) throw new Error("Unknown top-up pack.");
  const price = await resolveTopupPriceId(input.packId);
  if (!price) throw new Error(`No Stripe price configured for the ${pack.label} top-up.`);
  const form: Record<string, string> = {
    mode: "payment",
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
    client_reference_id: input.orgId,
    "metadata[kind]": "topup",
    "metadata[org_id]": input.orgId,
    "metadata[topup_actions]": String(pack.actions),
    "payment_intent_data[metadata][org_id]": input.orgId,
    allow_promotion_codes: "true",
  };
  if (input.embedded) {
    form.ui_mode = "embedded";
    form.return_url = input.returnUrl ?? input.successUrl;
  } else {
    form.success_url = input.successUrl;
    form.cancel_url = input.cancelUrl;
  }
  if (input.customerEmail) form.customer_email = input.customerEmail;
  const session = await stripePost("checkout/sessions", form);
  if (input.embedded) {
    const clientSecret = session.client_secret as string | undefined;
    if (!clientSecret) throw new Error("Stripe did not return a client secret.");
    return { clientSecret };
  }
  const url = session.url as string | undefined;
  if (!url) throw new Error("Stripe did not return a checkout URL.");
  return { url };
}

/** Create a customer-portal session so a customer can manage/cancel billing. */
export async function createPortalSession(customerId: string, returnUrl: string): Promise<string> {
  const session = await stripePost("billing_portal/sessions", { customer: customerId, return_url: returnUrl });
  const url = session.url as string | undefined;
  if (!url) throw new Error("Stripe did not return a portal URL.");
  return url;
}

/**
 * Verify a Stripe webhook signature. Stripe sends `Stripe-Signature: t=…,v1=…`
 * where the signed payload is `${t}.${rawBody}`, HMAC-SHA256 with the endpoint
 * secret. We also reject stale timestamps (default 5-minute tolerance).
 */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, toleranceSec = 300): boolean {
  if (!header) return false;
  // Parse `t=…,v1=…[,v1=…]`. During endpoint-secret rotation Stripe includes a
  // v1 signature for EACH active secret, so collect ALL v1s (a plain map would
  // keep only the last and reject a payload whose matching signature came first).
  let t: string | undefined;
  const v1s: string[] = [];
  for (const kv of header.split(",")) {
    const i = kv.indexOf("=");
    if (i < 0) continue;
    const k = kv.slice(0, i).trim();
    const v = kv.slice(i + 1);
    if (k === "t") t = v;
    else if (k === "v1") v1s.push(v);
  }
  if (!t || v1s.length === 0) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(t));
  if (!Number.isFinite(age) || age > toleranceSec) return false;

  const expected = Buffer.from(crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`, "utf8").digest("hex"));
  // Accept if ANY provided v1 matches (constant-time, length-checked).
  return v1s.some((v1) => {
    const b = Buffer.from(v1);
    return expected.length === b.length && crypto.timingSafeEqual(expected, b);
  });
}
