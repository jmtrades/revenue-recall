import { getSubscription } from "@/lib/billing/store";
import { billingConfigured, stripeGet } from "@/lib/billing/stripe";

/** A customer-facing invoice row (amounts in the currency's minor unit/cents). */
export interface Invoice {
  id: string;
  number?: string;
  amountPaid: number;
  currency: string;
  status: string;
  created: string;
  url?: string;
  pdf?: string;
}

interface StripeInvoice {
  id: string;
  number?: string | null;
  amount_paid?: number;
  currency?: string;
  status?: string;
  created?: number;
  hosted_invoice_url?: string | null;
  invoice_pdf?: string | null;
}

/** This org's recent Stripe invoices (newest first). Empty when billing isn't
 *  configured or the org has no Stripe customer yet. */
export async function listInvoices(limit = 12): Promise<Invoice[]> {
  if (!billingConfigured()) return [];
  const sub = await getSubscription();
  if (!sub.stripeCustomerId) return [];
  const res = await stripeGet(`invoices?customer=${encodeURIComponent(sub.stripeCustomerId)}&limit=${Math.min(Math.max(limit, 1), 100)}`);
  const data = (res.data as StripeInvoice[] | undefined) ?? [];
  return data.map((i) => ({
    id: i.id,
    number: i.number ?? undefined,
    amountPaid: typeof i.amount_paid === "number" ? i.amount_paid : 0,
    currency: (i.currency ?? "usd").toUpperCase(),
    status: i.status ?? "unknown",
    created: i.created ? new Date(i.created * 1000).toISOString() : "",
    url: i.hosted_invoice_url ?? undefined,
    pdf: i.invoice_pdf ?? undefined,
  }));
}
