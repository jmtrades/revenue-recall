import Link from "next/link";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { Footer } from "@/components/marketing/Footer";
import { PricingPlans } from "@/components/marketing/PricingPlans";
import { RoiCalculator } from "@/components/marketing/RoiCalculator";

export const metadata = {
  title: "Pricing",
  description: "Simple per-seat pricing that pays for itself with a single recovered deal. Start free, no credit card.",
};

export default function PricingPage() {
  return (
    <div className="min-h-screen">
      <MarketingNav />
      <section className="hero-glow relative overflow-hidden border-b border-border">
        <div className="surface-grid absolute inset-0 opacity-30" />
        <div className="relative mx-auto max-w-3xl px-5 py-20 text-center">
          <span className="pill border border-border bg-surface/60 text-muted">Pricing</span>
          <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight text-white sm:text-5xl">
            Priced to <span className="gradient-text">pay for itself.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted">
            One recovered deal usually covers a year of seats. Start free with no credit card, and only pay once
            Revenue Recall is winning back more than it costs.
          </p>
        </div>
      </section>

      <PricingPlans />
      <RoiCalculator />

      <section className="mx-auto max-w-6xl px-5 pb-24">
        <div className="hero-glow relative overflow-hidden rounded-3xl border border-border bg-surface px-8 py-16 text-center">
          <div className="surface-grid absolute inset-0 opacity-30" />
          <div className="relative">
            <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Try it free first.</h2>
            <p className="mx-auto mt-4 max-w-xl text-muted">
              Spin up your workspace in two minutes and see the recoverable revenue in your own pipeline before you pay a cent.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/signup" className="rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand/90">
                Start free
              </Link>
              <Link href="/contact" className="rounded-xl border border-border bg-surface/60 px-6 py-3 text-sm font-semibold text-white transition hover:bg-surface-2">
                Talk to sales
              </Link>
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
