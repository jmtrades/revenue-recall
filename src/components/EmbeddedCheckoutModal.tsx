"use client";

import { useEffect, useRef } from "react";
// `/pure` so Stripe.js only loads when checkout actually opens — not eagerly on
// every page that imports this component. (Types come from the main entry.)
import { loadStripe } from "@stripe/stripe-js/pure";
import type { Stripe } from "@stripe/stripe-js";

// Publishable key is public + inlined at build. When absent, embedded checkout
// is unavailable and callers fall back to the hosted redirect — nothing breaks.
const PK = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
let stripePromise: Promise<Stripe | null> | null = null;
function getStripe(): Promise<Stripe | null> | null {
  if (!stripePromise && PK) stripePromise = loadStripe(PK);
  return stripePromise;
}

/** Whether on-domain embedded checkout can run (publishable key present). */
export function embeddedCheckoutAvailable(): boolean {
  return Boolean(PK);
}

export interface CheckoutRequest {
  endpoint: string; // "/api/billing/checkout" | "/api/billing/topup"
  body: Record<string, unknown>;
}

/**
 * Stripe Embedded Checkout in a modal — the payment runs on our own domain, so
 * the buyer never leaves the app. Reads the clientSecret from our API (with
 * embedded:true). Tears the instance down on close to avoid leaks.
 */
export function EmbeddedCheckoutModal({ request, onClose }: { request: CheckoutRequest | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!request) return;
    let checkout: { destroy: () => void } | null = null;
    let cancelled = false;
    (async () => {
      const stripe = await getStripe();
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
    })().catch(() => onClose());
    return () => {
      cancelled = true;
      try {
        checkout?.destroy();
      } catch {
        /* already torn down */
      }
    };
  }, [request, onClose]);

  if (!request) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="relative max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-border bg-surface p-4 shadow-[0_24px_80px_-20px_rgba(0,0,0,0.7)]" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-muted transition hover:text-fg">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
        <div ref={ref} className="min-h-[60vh]" />
      </div>
    </div>
  );
}
