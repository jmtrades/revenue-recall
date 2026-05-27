import Link from "next/link";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { Footer } from "@/components/marketing/Footer";

export const metadata = {
  title: "About",
  description: "Why Revenue Recall exists: most lost revenue doesn't go to a competitor — it goes quiet. We're building the sales OS that catches it.",
};

const VALUES = [
  { title: "Recover, don't just track", body: "Most CRMs are systems of record. We're a system of action — surfacing the revenue slipping away and putting the next move one click from done." },
  { title: "Works with your world", body: "Any CRM, or none. Every industry. We meet teams where they are instead of forcing a migration before they get value." },
  { title: "Human, not robotic", body: "AI should sound like you, do the busywork, and stay out of the way. We obsess over outreach that's indistinguishable from a great rep." },
  { title: "Honest by default", body: "Transparent pricing, no dark patterns, and your data stays yours. We'd rather earn the next month than lock you in." },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen">
      <MarketingNav />
      <section className="hero-glow relative overflow-hidden border-b border-border">
        <div className="surface-grid absolute inset-0 opacity-30" />
        <div className="relative mx-auto max-w-3xl px-5 py-20 text-center">
          <span className="pill border border-border bg-surface/60 text-muted">Our mission</span>
          <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight text-white sm:text-5xl">
            Most lost revenue <span className="gradient-text">just goes quiet.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted">
            Deals don&apos;t usually die to a competitor — they stall, slip, and fade while reps chase what&apos;s loud.
            Revenue Recall exists to catch that silent leak for every sales team, in every industry.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-16">
        <h2 className="text-2xl font-semibold tracking-tight text-white">Why we built this</h2>
        <p className="mt-4 text-muted leading-relaxed">
          Every team has a graveyard of deals that were one good follow-up away from closing. The problem isn&apos;t effort —
          it&apos;s that the loudest deals get the attention while quietly-winnable ones go cold. We set out to build a sales
          OS that watches every deal, ranks what&apos;s slipping by how much you can still save, drafts the outreach in your
          voice, and closes the loop — on autopilot when you want it.
        </p>
        <p className="mt-4 text-muted leading-relaxed">
          We&apos;re an early, focused team shipping fast. If that resonates, we&apos;d love to hear from you.
        </p>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="grid gap-5 md:grid-cols-2">
          {VALUES.map((v) => (
            <div key={v.title} className="rounded-2xl border border-border bg-surface p-6">
              <h3 className="font-semibold text-white">{v.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{v.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-wrap justify-center gap-3">
          <Link href="/signup" className="rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand/90">
            Start free
          </Link>
          <Link href="/contact" className="rounded-xl border border-border bg-surface/60 px-6 py-3 text-sm font-semibold text-white transition hover:bg-surface-2">
            Get in touch
          </Link>
        </div>
      </section>
      <Footer />
    </div>
  );
}
