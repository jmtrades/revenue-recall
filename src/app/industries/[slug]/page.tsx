import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { Footer } from "@/components/marketing/Footer";
import { INDUSTRY_CATALOG, getCatalogEntry, termsFor } from "@/lib/industries/catalog";

export const dynamicParams = false;

export function generateStaticParams() {
  return INDUSTRY_CATALOG.map((e) => ({ slug: e.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const entry = getCatalogEntry(params.slug);
  if (!entry) return {};
  const desc = `Revenue Recall for ${entry.name}: rank every deal going cold, draft outreach in your voice, and close the loop. Works with any CRM. Start free.`;
  return {
    title: `${entry.name} Sales Software`,
    description: desc,
    openGraph: { title: `Revenue Recall for ${entry.name}`, description: desc, type: "website" },
  };
}

const CRMS = ["Salesforce", "HubSpot", "Close", "Pipedrive", "Gmail", "Outlook", "Twilio"];

export default function IndustryPage({ params }: { params: { slug: string } }) {
  const entry = getCatalogEntry(params.slug);
  if (!entry) notFound();

  const t = termsFor(entry);
  const contact = t.contact.toLowerCase();
  const opp = t.opportunity.toLowerCase();
  const value = t.value.toLowerCase();

  const pains = [
    `${entry.name} ${opp}s stall and quietly go cold while you chase what's loud.`,
    `Follow-ups slip through the cracks — and you find out a ${opp} died weeks too late.`,
    `Generic, robotic outreach gets ignored; your ${contact}s want to hear from a real person.`,
  ];
  const wins = [
    `Every slipping ${opp} surfaced and ranked by recoverable ${value}.`,
    `AI drafts the email, text, or call in your exact voice — indistinguishable from you.`,
    `Autopilot follows up so no ${contact} is ever dropped, and the record writes itself.`,
  ];

  return (
    <div className="min-h-screen">
      <MarketingNav />

      <section className="hero-glow relative overflow-hidden border-b border-border">
        <div className="surface-grid absolute inset-0 opacity-30" />
        <div className="relative mx-auto max-w-3xl px-5 py-20 text-center">
          <span className="pill border border-border bg-surface/60 text-muted">Revenue Recall for {entry.name}</span>
          <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight text-white sm:text-5xl">
            Recover the {value} <span className="gradient-text">you&apos;re about to lose.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted">
            {entry.tagline ? `${entry.tagline} ` : ""}Revenue Recall ranks every {opp} going cold, drafts the outreach in
            your voice, and closes the loop — tuned for {entry.name}, with any CRM or none.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className="rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand/90">
              Start free — no card
            </Link>
            <Link href="/dashboard" className="rounded-xl border border-border bg-surface/60 px-6 py-3 text-sm font-semibold text-white transition hover:bg-surface-2">
              See the live demo →
            </Link>
          </div>
          <p className="mt-3 text-xs text-muted">Describe your {entry.name.toLowerCase()} business in a sentence — your workspace builds itself in 2 minutes.</p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-16">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-surface p-7">
            <p className="text-sm font-semibold uppercase tracking-wider text-muted">Where {entry.name} revenue leaks</p>
            <ul className="mt-4 space-y-3 text-sm text-muted">
              {pains.map((p) => (
                <li key={p} className="flex gap-2"><span className="text-danger">✕</span> {p}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-brand/40 bg-surface p-7 ring-glow">
            <p className="text-sm font-semibold uppercase tracking-wider text-brand">With Revenue Recall</p>
            <ul className="mt-4 space-y-3 text-sm text-white">
              {wins.map((w) => (
                <li key={w} className="flex gap-2"><span className="text-success">✓</span> {w}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="border-y border-border">
        <div className="mx-auto max-w-6xl px-5 py-8">
          <p className="text-center text-xs font-semibold uppercase tracking-wider text-muted">
            Works with the tools {entry.name} teams already use — or none
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm font-medium text-muted/80">
            {CRMS.map((n) => (
              <span key={n} className="transition hover:text-white">{n}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-24 pt-16">
        <div className="hero-glow relative overflow-hidden rounded-3xl border border-border bg-surface px-8 py-16 text-center">
          <div className="surface-grid absolute inset-0 opacity-30" />
          <div className="relative">
            <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Stop losing {entry.name} deals to silence.</h2>
            <p className="mx-auto mt-4 max-w-xl text-muted">Spin up your workspace in minutes and see the recoverable {value} hiding in your pipeline.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/signup" className="rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand/90">Start free</Link>
              <Link href="/pricing" className="rounded-xl border border-border bg-surface/60 px-6 py-3 text-sm font-semibold text-white transition hover:bg-surface-2">See pricing</Link>
            </div>
          </div>
        </div>
        <p className="mt-8 text-center text-sm text-muted">
          A different industry? <Link href="/industries" className="text-brand hover:underline">Browse all</Link> — or just{" "}
          <Link href="/signup" className="text-brand hover:underline">describe yours</Link> and it adapts.
        </p>
      </section>

      <Footer />
    </div>
  );
}
