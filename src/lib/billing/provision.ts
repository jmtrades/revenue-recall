import { CATALOG, type CatalogPrice } from "@/lib/billing/catalog";
import { billingConfigured, stripePost, stripeGet, clearPriceCache } from "@/lib/billing/stripe";

/**
 * One-shot, idempotent Stripe catalog setup. Creates every plan price, annual
 * price, and top-up pack in the connected Stripe account — so the operator never
 * touches the Stripe dashboard. Re-running is safe: prices are keyed by a stable
 * `lookup_key` (reused if present) and products by `rr_product_key` metadata.
 */
export interface ProvisionResult {
  ok: boolean;
  created: string[];
  reused: string[];
  prices: Record<string, string>;
  error?: string;
}

async function findPriceIdByLookupKey(lookupKey: string): Promise<string | undefined> {
  const res = await stripeGet(`prices?lookup_keys[]=${encodeURIComponent(lookupKey)}&active=true&limit=1`);
  return (res.data as { id?: string }[] | undefined)?.[0]?.id ?? undefined;
}

async function findOrCreateProduct(item: CatalogPrice, cache: Map<string, string>): Promise<string> {
  const cached = cache.get(item.productKey);
  if (cached) return cached;
  let productId: string | undefined;
  try {
    const search = await stripeGet(`products/search?query=${encodeURIComponent(`metadata['rr_product_key']:'${item.productKey}'`)}&limit=1`);
    productId = (search.data as { id?: string }[] | undefined)?.[0]?.id ?? undefined;
  } catch {
    /* product search may be disabled on the account — fall through to create */
  }
  if (!productId) {
    const product = await stripePost("products", {
      name: item.productName,
      description: item.description,
      "metadata[rr_product_key]": item.productKey,
    });
    productId = product.id as string;
  }
  cache.set(item.productKey, productId);
  return productId;
}

export async function provisionStripeCatalog(): Promise<ProvisionResult> {
  if (!billingConfigured()) {
    return { ok: false, created: [], reused: [], prices: {}, error: "Set STRIPE_SECRET_KEY in your environment first." };
  }
  const created: string[] = [];
  const reused: string[] = [];
  const prices: Record<string, string> = {};
  const productCache = new Map<string, string>();
  try {
    for (const item of CATALOG) {
      const existing = await findPriceIdByLookupKey(item.lookupKey);
      if (existing) {
        reused.push(item.lookupKey);
        prices[item.lookupKey] = existing;
        continue;
      }
      const productId = await findOrCreateProduct(item, productCache);
      const form: Record<string, string> = {
        product: productId,
        currency: item.currency,
        unit_amount: String(item.unitAmountCents),
        lookup_key: item.lookupKey,
        transfer_lookup_key: "true",
        "metadata[rr_key]": item.lookupKey,
      };
      if (item.recurring) form["recurring[interval]"] = item.recurring.interval;
      const price = await stripePost("prices", form);
      created.push(item.lookupKey);
      prices[item.lookupKey] = price.id as string;
    }
    clearPriceCache(); // newly-created prices should resolve immediately
    return { ok: true, created, reused, prices };
  } catch (e) {
    return { ok: false, created, reused, prices, error: e instanceof Error ? e.message : "Provisioning failed" };
  }
}
