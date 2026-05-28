import Link from "next/link";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { Footer } from "@/components/marketing/Footer";
import { INDUSTRY_CATALOG } from "@/lib/industries/catalog";

export const metadata = {
  title: "Industries",
  description: "Revenue Recall is tuned for every industry — real estate, mortgage, insurance, SaaS, home services, healthcare, and any business that sells. Or describe yours and it adapts.",
};

export default function IndustriesIndex() {
  return (
    <div className="min-h-screen">
      <MarketingNav />

      <section className="hero-glow relative overflow-hidden border-b border-border">
        <div className="surface-grid absolute inset-0 opacity-30" />
        <div className="relative mx-auto max-w-3xl px-5 py-20 text-center">
          <span className="pill border border-border bg-surface/60 text-muted">Every industry</span>
          <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight text-white sm:text-5xl">
            Tuned to <span className="gradient-text">how you sell.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted">
            One engine, every industry. Terminology, pipeline, and AI voice adapt to your world — out of the box, in two
            minutes. Don&apos;t see yours? Just describe it and Revenue Recall builds itself around you.
          </p>
          <div className="mt-8">
            <Link href="/signup" className="rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand/90">
              Build my workspace free →
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {INDUSTRY_CATALOG.map((e) => (
            <Link
              key={e.slug}
              href={`/industries/${e.slug}`}
              className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-white transition hover:border-brand/40 hover:bg-surface-2/40"
            >
              {e.name}
            </Link>
          ))}
          <span className="flex items-center rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted">
            + your industry
          </span>
        </div>
      </section>

      <Footer />
    </div>
  );
}
