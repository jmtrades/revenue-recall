import crypto from "node:crypto";
import type { PlanId } from "@/lib/billing/plans";

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

/** Stripe price id for a plan, if one has been wired via env. */
export function priceId(plan: PlanId): string | undefined {
  if (plan === "growth") return env("STRIPE_PRICE_GROWTH");
  if (plan === "team") return env("STRIPE_PRICE_TEAM");
  if (plan === "scale") return env("STRIPE_PRICE_SCALE");
  return undefined;
}

/** Reverse a Stripe price id back to a plan (for webhook reconciliation). */
export function planForPrice(price: string | undefined): PlanId | undefined {
  if (!price) return undefined;
  if (price === env("STRIPE_PRICE_GROWTH")) return "growth";
  if (price === env("STRIPE_PRICE_TEAM")) return "team";
  if (price === env("STRIPE_PRICE_SCALE")) return "scale";
  return undefined;
}

async function stripePost(path: string, form: Record<string, string>): Promise<Record<string, unknown>> {
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

export interface CheckoutInput {
  plan: PlanId;
  orgId: string;
  seats: number;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
}

/** Create a Checkout session and return its hosted URL. */
export async function createCheckoutSession(input: CheckoutInput): Promise<string> {
  const price = priceId(input.plan);
  if (!price) throw new Error(`No Stripe price configured for the ${input.plan} plan.`);
  const form: Record<string, string> = {
    mode: "subscription",
    "line_items[0][price]": price,
    "line_items[0][quantity]": String(Math.max(1, input.seats)),
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.orgId,
    "metadata[plan]": input.plan,
    "subscription_data[metadata][org_id]": input.orgId,
    allow_promotion_codes: "true",
  };
  if (input.customerEmail) form.customer_email = input.customerEmail;
  const session = await stripePost("checkout/sessions", form);
  const url = session.url as string | undefined;
  if (!url) throw new Error("Stripe did not return a checkout URL.");
  return url;
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
  const parts = Object.fromEntries(
    header.split(",").map((kv) => {
      const [k, ...rest] = kv.split("=");
      return [k.trim(), rest.join("=")];
    }),
  );
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(t));
  if (!Number.isFinite(age) || age > toleranceSec) return false;

  const expected = crypto.createHmac("sha256", secret).update(`${t}.${rawBody}`, "utf8").digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
