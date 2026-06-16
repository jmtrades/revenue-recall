import type { Metadata } from "next";
import Link from "next/link";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { Footer } from "@/components/marketing/Footer";
import { StickyCTA } from "@/components/marketing/StickyCTA";
import { PricingPlans } from "@/components/marketing/PricingPlans";
import { PLANS } from "@/components/marketing/pricing-data";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Motion";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

/**
 * Standalone pricing page. "[product] pricing" is one of the highest-intent
 * queries a buyer ever types, and ads/emails need a URL that lands directly on
 * plans — the landing page's /#pricing fragment can't be targeted, canonicalized,
 * or rich-resulted on its own.
 */

const DESCRIPTION =
  "Simple pricing for an autonomous AI sales force: free to start, $599/mo for a rep that does real rep volume — ~100 dials a day, $1,699/mo for the whole desk. No contracts, cancel anytime.";

export const metadata: Metadata = {
  title: "Pricing",
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/pricing` },
  openGraph: { title: "Revenue Recall pricing", description: DESCRIPTION, type: "website", url: `${SITE_URL}/pricing`, siteName: "Revenue Recall" },
  twitter: { card: "summary_large_image", title: "Revenue Recall pricing", description: DESCRIPTION },
};

// Honest billing FAQ — every answer mirrors actual product behavior (no card on
// Starter, graceful degrade at the cap, instant top-ups, no contracts).
const BILLING_FAQ = [
  { q: "Do I need a credit card to start?", a: "No. The Starter plan is free forever with no card — you get the built-in CRM, the Revenue Recall engine ranking your at-risk deals by recoverable dollars, and template-AI outreach. Upgrade only when you want the live AI working your pipeline autonomously." },
  { q: "What counts as an AI message?", a: "Every email, text, or call script the live AI writes for you — and every plan includes far more than a person could send by hand, so you're working your whole list, not rationing. Replies it drafts count; messages you write yourself never do, and if you ever want extra for a big push you can add it instantly." },
  { q: "Will it have enough calling and messaging to work my whole list?", a: "Yes — comfortably. Every plan includes far more outreach than a person could ever do by hand, and you only ever pay for calls that actually connect (a no-answer costs nothing), so it stretches much further than it sounds. It works through your entire list and keeps following up — and if you ever want even more in a busy month, you can add capacity instantly. Practice and role-play calls are always free, on every plan." },
  { q: "What if I want to run even more in a busy month?", a: "You're never stopped mid-campaign. If you want extra capacity for a big push, you can add it instantly from a few dollars — and email, SMS, and practice calls keep running no matter what." },
  { q: "Is autonomous calling and texting compliant?", a: "The guardrails are built in and always on. Autonomous calls and texts only go out between 8am and 9pm in the prospect's own timezone — the TCPA window, read from their phone number. A one-word STOP opts them out instantly and permanently, every outbound email carries an unsubscribe link, and you can add a spoken recording disclosure for two-party-consent states. Quiet hours, daily caps, and per-deal cooldowns stack on top, and they're all visible on your Autopilot page." },
  { q: "Can I change or cancel my plan anytime?", a: "Yes. Upgrade, downgrade, or cancel anytime — monthly plans have no contract, and annual billing simply gives you about two months free. Your data stays yours either way." },
];

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "Revenue Recall",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: DESCRIPTION,
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: "USD",
        lowPrice: 0,
        highPrice: Math.max(...PLANS.map((p) => p.monthly ?? 0)),
        offerCount: PLANS.filter((p) => p.monthly !== null).length,
        offers: PLANS.filter((p) => p.monthly !== null).map((p) => ({
          "@type": "Offer",
          name: `${p.name} plan`,
          price: p.monthly,
          priceCurrency: "USD",
        })),
      },
    },
    {
      "@type": "FAQPage",
      mainEntity: BILLING_FAQ.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Revenue Recall", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Pricing", item: `${SITE_URL}/pricing` },
      ],
    },
  ],
};

function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export default function PricingPage() {
  return (
    <div className="landing min-h-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <MarketingNav />

      {/* Hero */}
      <section className="hero-glow relative overflow-hidden">
        <div className="surface-grid absolute inset-0 opacity-40" />
        <div className="relative mx-auto max-w-6xl px-5 pb-4 pt-16 text-center lg:pt-20">
          <span className="eyebrow">Pricing</span>
          <h1 className="display-hero mx-auto mt-5 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-[-0.02em] sm:text-5xl">
            Priced per AI rep — <span className="gradient-text">a fraction of the human one.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-muted">
            Start free and watch it surface the revenue you&apos;re losing. Add reps when it&apos;s already paying for itself. No contracts, cancel anytime.
          </p>
        </div>
      </section>

      {/* Plans */}
      <section className="mx-auto max-w-6xl px-5 pb-10">
        <PricingPlans />
      </section>

      {/* Risk reversal — make starting feel like zero risk, all true */}
      <section className="mx-auto max-w-5xl px-5 pb-16">
        <div className="rounded-2xl border border-border bg-surface/40 px-6 py-7">
          <p className="text-center text-xs font-semibold uppercase tracking-wide text-brand">Zero risk to start</p>
          <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { t: "Start free — no card", d: "Watch it surface the revenue you're losing before you pay a cent." },
              { t: "Cancel anytime", d: "No contracts, no lock-in — month to month, always." },
              { t: "Your data is always yours", d: "Export everything whenever you like. It's never held hostage." },
              { t: "Lock in today's price", d: "Your rate is grandfathered for life. Prices rise; yours won't." },
            ].map((x) => (
              <div key={x.t} className="text-center sm:text-left">
                <p className="text-sm font-semibold text-fg">{x.t}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{x.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The math, one line */}
      <section className="border-y border-border bg-surface/30">
        <div className="mx-auto max-w-3xl px-5 py-12 text-center">
          <p className="text-lg text-body">
            An SDR runs <span className="font-semibold text-fg">$5,000+/mo</span> for eight hours a day. Revenue Recall starts at{" "}
            <span className="font-semibold text-brand">$599/mo</span> and never clocks out — reactivate one mid-size deal and it&apos;s paid for the year.
          </p>
        </div>
      </section>

      {/* Billing FAQ */}
      <section className="mx-auto max-w-3xl px-5 py-20">
        <Reveal className="flex flex-col items-center text-center">
          <span className="eyebrow">Billing, answered</span>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-fg">Common questions</h2>
        </Reveal>
        <Stagger className="mt-10 space-y-3">
          {BILLING_FAQ.map((f) => (
            <StaggerItem key={f.q}>
              <details className="group rounded-xl border border-border bg-surface p-5 transition-colors open:border-brand/30 [&_summary]:cursor-pointer">
                <summary className="flex items-center justify-between gap-4 text-[15px] font-medium text-fg marker:content-['']">
                  {f.q}
                  <span className="grid h-6 w-6 flex-none place-items-center rounded-full border border-border text-muted transition-transform duration-200 ease-out group-open:rotate-45 group-open:border-brand/40 group-open:text-brand">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14" /><path d="M5 12h14" /></svg>
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted">{f.a}</p>
              </details>
            </StaggerItem>
          ))}
        </Stagger>
        <p className="mt-8 text-center text-sm text-muted">
          More questions? <Link href="/#faq" className="font-medium text-brand hover:underline">Read the full FAQ</Link> or{" "}
          <Link href="/signup" className="font-medium text-brand hover:underline">start free</Link> and see it on your own pipeline.
        </p>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-5 pb-24">
        <div className="hero-glow relative overflow-hidden rounded-3xl border border-border bg-surface px-8 py-16 text-center">
          <div className="surface-grid absolute inset-0 opacity-30" />
          <div className="relative mx-auto max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Cheaper than the stack it replaces.</h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-muted">The SDR, the sequencer, and the dialer — one autonomous system, live in two minutes.</p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link href="/signup" className="cta group inline-flex items-center gap-2 rounded-full bg-brand py-2 pl-5 pr-2 text-sm font-semibold text-white hover:bg-brand/90">
                Start free
                <span className="grid h-7 w-7 place-items-center rounded-full bg-white/20 transition-transform duration-200 ease-out group-hover:translate-x-0.5">
                  <Arrow />
                </span>
              </Link>
              <Link href="/#how" className="cta inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-5 py-2.5 text-sm font-semibold text-fg transition-colors hover:bg-surface-2">
                See how it works
                <Arrow className="text-muted" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
      <StickyCTA />
    </div>
  );
}
