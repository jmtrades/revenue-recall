"use client";

import { useEffect, useRef, useState } from "react";
// `/pure` so Stripe.js loads only when checkout opens. (Type from the main entry.)
import { loadStripe } from "@stripe/stripe-js/pure";
import type { Stripe } from "@stripe/stripe-js";

let stripePromise: Promise<Stripe | null> | null = null;
function getStripe(pk: string): Promise<Stripe | null> {
  if (!stripePromise) stripePromise = loadStripe(pk);
  return stripePromise;
}

export interface CheckoutRequest {
  endpoint: string; // "/api/billing/checkout" | "/api/billing/topup"
  body: Record<string, unknown>;
}

/**
 * Opens checkout. If a Stripe publishable key is configured (fetched at runtime
 * from /api/billing/config), payment runs EMBEDDED on our own domain — the buyer
 * never leaves the app. If not, it transparently falls back to hosted Stripe
 * Checkout (redirect). Callers just hand it a request; no config branching.
 */
export function EmbeddedCheckoutModal({ request, onClose }: { request: CheckoutRequest | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!request) return;
    setReady(false);
    setError(null);
    let checkout: { destroy: () => void } | null = null;
    let cancelled = false;

    (async () => {
      const cfg = await fetch("/api/billing/config").then((r) => r.json()).catch(() => ({}));
      const pk = cfg?.publishable as string | undefined;

      // No publishable key → hosted Checkout: get a URL and redirect.
      if (!pk) {
        const res = await fetch(request.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request.body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.url) throw new Error(data.error ?? "Couldn't start checkout");
        window.location.href = data.url as string;
        return;
      }

      // Embedded, on-domain checkout.
      const stripe = await getStripe(pk);
      if (!stripe || cancelled || !ref.current) return;
      const instance = await stripe.createEmbeddedCheckoutPage({
        fetchClientSecret: async () => {
          const res = await fetch(request.endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...request.body, embedded: true }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.clientSecret) throw new Error(data.error ?? "Couldn't start checkout");
          return data.clientSecret as string;
        },
      });
      if (cancelled) {
        instance.destroy();
        return;
      }
      checkout = instance;
      instance.mount(ref.current);
      setReady(true);
    })().catch((e) => setError(e instanceof Error ? e.message : "Couldn't start checkout"));

    return () => {
      cancelled = true;
      try {
        checkout?.destroy();
      } catch {
        /* already torn down */
      }
    };
  }, [request]);

  if (!request) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Checkout" className="relative max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-border bg-surface p-4 shadow-[0_24px_80px_-20px_rgba(0,0,0,0.7)]" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-muted transition hover:text-fg">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
        {error ? (
          <div className="grid min-h-[40vh] place-items-center p-6 text-center">
            <div>
              <p className="text-sm text-danger">{error}</p>
              <button onClick={onClose} className="mt-3 rounded-lg border border-border px-4 py-2 text-sm text-fg transition hover:bg-surface-2">Close</button>
            </div>
          </div>
        ) : (
          <>
            {!ready && (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
                <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.219-8.56" strokeLinecap="round" /></svg>
                Loading secure checkout…
              </div>
            )}
            <div ref={ref} className={ready ? "min-h-[55vh]" : ""} />
          </>
        )}
      </div>
    </div>
  );
}
