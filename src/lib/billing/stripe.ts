import crypto from "crypto";
import { PLANS, type PlanId } from "@/lib/billing/plans";

const API = "https://api.stripe.com/v1";

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** Form-encode a nested params object the way Stripe's API expects. */
function encode(params: Record<string, unknown>, prefix = ""): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") {
      parts.push(encode(v as Record<string, unknown>, key));
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.filter(Boolean).join("&");
}

async function stripePost(path: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: encode(params),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const err = json.error as { message?: string } | undefined;
    throw new Error(err?.message ?? `Stripe error ${res.status}`);
  }
  return json;
}

export function priceIdFor(plan: PlanId, cycle: "monthly" | "annual"): string | null {
  const env = PLANS[plan].stripePriceEnv;
  if (!env) return null;
  return process.env[cycle === "monthly" ? env.monthly : env.annual] ?? null;
}

/** Reverse-map a Stripe price id back to our plan id (for webhooks). */
export function planForPriceId(priceId: string): PlanId | null {
  for (const plan of Object.values(PLANS)) {
    if (!plan.stripePriceEnv) continue;
    if (process.env[plan.stripePriceEnv.monthly] === priceId) return plan.id;
    if (process.env[plan.stripePriceEnv.annual] === priceId) return plan.id;
  }
  return null;
}

export function createSubscriptionCheckout(opts: {
  priceId: string;
  quantity: number;
  orgId: string;
  plan: PlanId;
  customerId?: string | null;
  successUrl: string;
  cancelUrl: string;
}): Promise<Record<string, unknown>> {
  return stripePost("/checkout/sessions", {
    mode: "subscription",
    "line_items[0][price]": opts.priceId,
    "line_items[0][quantity]": opts.quantity,
    client_reference_id: opts.orgId,
    customer: opts.customerId ?? undefined,
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    allow_promotion_codes: true,
    "metadata[org_id]": opts.orgId,
    "metadata[plan]": opts.plan,
    "subscription_data[metadata][org_id]": opts.orgId,
    "subscription_data[metadata][plan]": opts.plan,
  });
}

export function createCreditCheckout(opts: {
  actions: number;
  price: number;
  orgId: string;
  customerId?: string | null;
  successUrl: string;
  cancelUrl: string;
}): Promise<Record<string, unknown>> {
  return stripePost("/checkout/sessions", {
    mode: "payment",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][product_data][name]": `${opts.actions.toLocaleString()} AI action credits`,
    "line_items[0][price_data][unit_amount]": Math.round(opts.price * 100),
    "line_items[0][quantity]": 1,
    client_reference_id: opts.orgId,
    customer: opts.customerId ?? undefined,
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    "metadata[org_id]": opts.orgId,
    "metadata[credit_actions]": opts.actions,
  });
}

export function createPortalSession(customerId: string, returnUrl: string): Promise<Record<string, unknown>> {
  return stripePost("/billing_portal/sessions", { customer: customerId, return_url: returnUrl });
}

/** Verify a Stripe webhook signature (t=…,v1=…) without the SDK. */
export function verifyWebhook(payload: string, sigHeader: string | null, secret: string): boolean {
  if (!sigHeader) return false;
  const parts = Object.fromEntries(sigHeader.split(",").map((p) => p.split("=") as [string, string]));
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
  } catch {
    return false;
  }
}
