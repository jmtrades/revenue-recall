import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { catalogDrift, ensureStripeCatalogCurrent, _resetHealBackstop } from "@/lib/billing/provision";
import { CATALOG } from "@/lib/billing/catalog";

/**
 * Self-healing Stripe catalog. The fetch mock plays a Stripe account whose
 * operator price still carries the OLD amount — the exact state production is
 * in after a reprice merges — and asserts the tick detects it, mints the new
 * price with transfer_lookup_key, and reports "healed".
 */

const SENTINEL = CATALOG.find((c) => c.lookupKey === "rr_operator_monthly")!;
const realFetch = global.fetch;
let stripeCalls: { url: string; method: string; body?: string }[] = [];

/** Stripe stub: every lookup returns a stale price for the sentinel, nothing
 *  for other keys; product search finds nothing; creates succeed. */
function stubStripe(staleAmount: number | null) {
  stripeCalls = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    stripeCalls.push({ url, method, body: typeof init?.body === "string" ? init.body : undefined });
    if (!url.startsWith("https://api.stripe.com/")) throw new Error(`unexpected fetch: ${url}`);
    const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
    if (url.includes("/prices?lookup_keys")) {
      const isSentinel = url.includes(encodeURIComponent(SENTINEL.lookupKey));
      return json({ data: isSentinel && staleAmount !== null ? [{ id: "price_old", unit_amount: staleAmount }] : [] });
    }
    if (url.includes("/products/search")) return json({ data: [] });
    if (url.endsWith("/products")) return json({ id: "prod_test" });
    if (url.endsWith("/prices")) return json({ id: "price_new" });
    return json({});
  });
}

beforeEach(() => {
  _resetHealBackstop();
  delete process.env.STRIPE_SECRET_KEY;
});
afterEach(() => {
  vi.unstubAllGlobals();
  global.fetch = realFetch;
  delete process.env.STRIPE_SECRET_KEY;
});

describe("self-healing Stripe catalog", () => {
  it("is inert without billing configured — no Stripe traffic at all", async () => {
    stubStripe(null);
    expect(await catalogDrift()).toBe(false);
    expect(await ensureStripeCatalogCurrent()).toBe("n/a");
    expect(stripeCalls.length).toBe(0);
  });

  it("reports current (one cheap read) when Stripe matches the catalog", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    stubStripe(SENTINEL.unitAmountCents);
    expect(await ensureStripeCatalogCurrent()).toBe("current");
    expect(stripeCalls.length).toBe(1); // the sentinel probe only
  });

  it("detects a reprice and heals: new price minted with transfer_lookup_key", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    stubStripe(29_900); // the pre-reprice amount production is sitting on
    expect(await ensureStripeCatalogCurrent()).toBe("healed");
    const creates = stripeCalls.filter((c) => c.method === "POST" && c.url.endsWith("/prices"));
    expect(creates.length).toBeGreaterThan(0);
    const sentinelCreate = creates.find((c) => c.body?.includes(`lookup_key=${SENTINEL.lookupKey}`));
    expect(sentinelCreate?.body).toContain(`unit_amount=${SENTINEL.unitAmountCents}`);
    expect(sentinelCreate?.body).toContain("transfer_lookup_key=true");
  });

  it("backstop: at most one heal attempt per window, even if drift persists", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    stubStripe(29_900);
    const t0 = Date.now();
    expect(await ensureStripeCatalogCurrent(t0)).toBe("healed");
    expect(await ensureStripeCatalogCurrent(t0 + 60_000)).toBe("skipped"); // an hour later: still inside the window
    expect(await ensureStripeCatalogCurrent(t0 + 7 * 60 * 60 * 1000)).toBe("healed"); // window elapsed → tries again
  });
});
