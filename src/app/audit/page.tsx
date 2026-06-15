import Link from "next/link";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { Footer } from "@/components/marketing/Footer";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/Motion";
import { Icon, type IconName } from "@/components/icons";
import { SITE_URL } from "@/lib/site";

// Lead-magnet landing page for the "Free Dead-Lead Audit" — the top of the
// concierge funnel. It reuses the product's real first-run capability (connect a
// CRM/CSV → the Recall engine ranks cold deals by recoverable revenue), so it
// needs no separate backend: the CTA sends visitors into signup, where the audit
// happens automatically. Link it directly in cold outreach.

const DESCRIPTION =
  "Free Dead-Lead Audit: see exactly how much closeable revenue is sitting in the leads you stopped following up — and reactivate the top ones, in your voice, in days.";

export const metadata = {
  title: "Free Dead-Lead Audit — Revenue Recall",
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/audit` },
  openGraph: { title: "Free Dead-Lead Audit", description: DESCRIPTION, type: "website", siteName: "Revenue Recall" },
};

function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M5 12h14" /><path d="m13 6 6 6-6 6" />
    </svg>
  );
}

const STEPS: { n: string; title: string; body: string; icon: IconName }[] = [
  { n: "01", title: "Connect your pipeline", body: "Plug in your CRM read-only, or drop a CSV export. Takes two minutes — nothing is changed, nothing is sent yet.", icon: "database" },
  { n: "02", title: "See the recoverable revenue", body: "The Recall engine scores every cold, stalled, and lost-but-winnable deal, ranks them by dollars on the table, and shows you the number you've been leaving behind.", icon: "recall" },
  { n: "03", title: "Reactivate the top 10 — in your voice", body: "It drafts the outreach in your voice across email, text, and phone. You approve, it sends, and the replies land back in your pipeline.", icon: "autopilot" },
];

const GET: { title: string; body: string }[] = [
  { title: "A dollar figure", body: "The closeable revenue sitting in leads you'd written off — quantified, ranked, and yours to keep." },
  { title: "10 leads reactivated", body: "We work your best cold leads back to life with you — real messages, in your voice, going out this week." },
  { title: "Zero risk", body: "Free, read-only, no card. See the money first; decide to automate it after." },
];

export default function AuditPage() {
  return (
    <div className="landing min-h-screen">
      <MarketingNav />

      {/* Hero */}
      <section className="hero-glow relative overflow-hidden">
        <div className="surface-grid absolute inset-0 opacity-40" />
        <div className="relative mx-auto max-w-3xl px-5 pb-14 pt-28 text-center sm:pt-32">
          <span className="eyebrow">Free · no card · read-only</span>
          <h1 className="display-hero mt-5 text-[2.4rem] font-semibold leading-[1.04] tracking-[-0.02em] sm:text-[3.25rem]">
            How much revenue is <span className="gradient-text">rotting in your CRM?</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-body">
            Most teams have months of leads they chased once or twice and gave up on. The money&apos;s still there. The
            free <strong className="font-semibold text-fg">Dead-Lead Audit</strong> shows you exactly how much is still
            closeable — then reactivates the best of it, in your voice.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/signup?next=/onboarding" className="cta group inline-flex items-center gap-2 rounded-full bg-brand py-2.5 pl-6 pr-2.5 text-base font-semibold text-white hover:bg-brand/90">
              Run my free audit
              <span className="grid h-8 w-8 place-items-center rounded-full bg-white/20 transition-transform duration-200 ease-out group-hover:translate-x-0.5"><Arrow /></span>
            </Link>
          </div>
          <p className="mt-3 text-xs text-muted">2-minute setup · See the number before you pay anything</p>
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-border bg-surface/30">
        <div className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
          <Reveal className="mx-auto max-w-2xl text-center">
            <span className="eyebrow">How the audit works</span>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">From cold pipeline to booked meetings — in days</h2>
          </Reveal>
          <Stagger className="mt-12 grid gap-x-8 gap-y-10 md:grid-cols-3">
            {STEPS.map((s) => (
              <StaggerItem key={s.n} className="relative">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-brand-soft text-brand ring-1 ring-inset ring-brand/20"><Icon name={s.icon} size={22} /></span>
                  <span className="font-display text-sm font-semibold tabular-nums text-muted">{s.n}</span>
                </div>
                <h3 className="mt-4 font-semibold text-fg">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* What you get */}
      <section className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">What you walk away with</span>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Proof first. Decision second.</h2>
        </Reveal>
        <Stagger className="mt-12 grid gap-5 md:grid-cols-3">
          {GET.map((g) => (
            <StaggerItem key={g.title} className="raised rounded-2xl border border-border bg-surface p-7">
              <h3 className="font-semibold text-fg">{g.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{g.body}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* Guarantee + CTA */}
      <section className="mx-auto max-w-3xl px-5 pb-24">
        <div className="hero-glow bezel relative overflow-hidden rounded-3xl border border-border bg-surface px-6 py-14 text-center sm:px-10">
          <div className="surface-grid absolute inset-0 opacity-30" />
          <div className="relative">
            <span className="grid h-12 w-12 mx-auto place-items-center rounded-xl bg-brand-soft text-brand ring-1 ring-inset ring-brand/20"><Icon name="shield" size={24} /></span>
            <h2 className="mt-5 text-2xl font-semibold tracking-tight text-fg sm:text-3xl">The risk is ours, not yours</h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-muted">
              The audit is free and read-only. You see the recoverable revenue before you spend a cent — and if you turn
              on the full engine, it&apos;s backed by a 30-day money-back guarantee.
            </p>
            <div className="mt-8">
              <Link href="/signup?next=/onboarding" className="cta group inline-flex items-center gap-2 rounded-full bg-brand py-2.5 pl-6 pr-2.5 text-base font-semibold text-white hover:bg-brand/90">
                Show me what&apos;s recoverable
                <span className="grid h-8 w-8 place-items-center rounded-full bg-white/20 transition-transform duration-200 ease-out group-hover:translate-x-0.5"><Arrow /></span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
