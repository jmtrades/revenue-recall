import Link from "next/link";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { Footer } from "@/components/marketing/Footer";
import { HeroPreview } from "@/components/marketing/HeroPreview";
import { INDUSTRIES } from "@/lib/industries";

const DESCRIPTION =
  "Revenue Recall finds the deals going cold in any CRM (or none), drafts the outreach with AI, and helps you close the loop — built for every industry.";

export const metadata = {
  title: "Revenue Recall — The universal sales OS that recovers lost revenue",
  description: DESCRIPTION,
  openGraph: {
    title: "Revenue Recall — Recover the revenue you're about to lose",
    description: DESCRIPTION,
    type: "website",
    siteName: "Revenue Recall",
  },
  twitter: { card: "summary_large_image", title: "Revenue Recall", description: DESCRIPTION },
};

const FEATURES = [
  { icon: "↺", title: "Revenue Recall engine", body: "Automatically scores every deal going cold, stalled, or marked lost-but-winnable — and tells a rep the single best next action, ranked by recoverable revenue." },
  { icon: "⛁", title: "Works with any CRM — or none", body: "One adapter layer for Salesforce, HubSpot, Close, Pipedrive, or our built-in CRM. No CRM? Start fresh in minutes. Switch backends without losing a thing." },
  { icon: "✨", title: "AI that drafts and calls", body: "Claude writes personalized email, SMS, and call scripts from real deal context, briefs reps before every call, and summarizes outcomes straight into the timeline." },
  { icon: "☎", title: "Power Dialer", body: "Work your highest-value calls back-to-back with AI prep, click-to-call, and auto-logged outcomes and sentiment. No more cold dials into the void." },
  { icon: "⚡", title: "Automations", body: "Speed-to-lead, idle-deal recall, stage hand-offs, win-backs — set-and-forget rules that handle the follow-up so nothing slips." },
  { icon: "◎", title: "Built for every industry", body: "Real estate, mortgage, insurance, SaaS, agencies, auto, home services — terminology, pipelines, and playbooks tuned to how you actually sell." },
];

const STEPS = [
  { n: "01", title: "Connect or start fresh", body: "Plug in your CRM or spin up the built-in one. We map your pipeline, contacts, and history in minutes." },
  { n: "02", title: "Recall surfaces the risk", body: "The engine continuously ranks revenue that's slipping — cold, stalled, and winnable-lost — so you always know what to work next." },
  { n: "03", title: "AI drafts, you close", body: "One click drafts the outreach or preps the call. Send, dial, and log — the loop closes itself and the data makes it smarter." },
];

const METRICS = [
  { stat: "23%", label: "of lost deals are reactivatable — most never get a second touch" },
  { stat: "<5 min", label: "speed-to-lead with automated first-touch outreach" },
  { stat: "1", label: "platform for every CRM, channel, and industry" },
];

const TESTIMONIALS = [
  { quote: "We were leaving money on the table in deals that just went quiet. Recall surfaces them every morning — it's the first tab we open.", role: "VP Sales, B2B SaaS" },
  { quote: "The AI call prep alone changed our connect rate. Reps walk into every call knowing exactly what to say.", role: "Sales Manager, Real Estate" },
  { quote: "It works with the CRM we already had and the one team that didn't have one. Same playbook, every desk.", role: "RevOps Lead, Insurance" },
];

const PRICING = [
  { name: "Starter", price: "$0", cadence: "/mo", blurb: "For solo closers getting started.", cta: "Start free", href: "/signup", features: ["Built-in CRM", "Revenue Recall queue", "AI drafting (templates)", "1 pipeline"], featured: false },
  { name: "Growth", price: "$49", cadence: "/user/mo", blurb: "For teams recovering serious revenue.", cta: "Start free trial", href: "/signup", features: ["Everything in Starter", "Connect any CRM", "Live AI drafting + briefs", "Power Dialer + email/SMS", "Automations", "Unlimited pipelines"], featured: true },
  { name: "Scale", price: "Custom", cadence: "", blurb: "For multi-team orgs and brokerages.", cta: "Talk to us", href: "/signup", features: ["Everything in Growth", "SSO & RBAC", "Dedicated success", "Custom integrations", "Security review"], featured: false },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <MarketingNav />

      {/* Hero */}
      <section className="hero-glow relative overflow-hidden">
        <div className="surface-grid absolute inset-0 opacity-40" />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-5 py-20 lg:grid-cols-2 lg:items-center lg:py-28">
          <div className="animate-fade-up">
            <span className="pill border border-border bg-surface/60 text-muted">The universal sales OS</span>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-6xl">
              Recover the revenue <span className="gradient-text">you&apos;re about to lose.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
              Revenue Recall finds the deals going cold in <em>any</em> CRM — or none — drafts the outreach with AI, and helps you close the loop. Built for every industry.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/signup" className="rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand/90">
                Start free — no card
              </Link>
              <Link href="/dashboard" className="rounded-xl border border-border bg-surface/60 px-6 py-3 text-sm font-semibold text-white transition hover:bg-surface-2">
                See the live demo →
              </Link>
            </div>
            <p className="mt-5 text-sm text-muted">Works with Salesforce, HubSpot, Close, Pipedrive — or no CRM at all.</p>
          </div>
          <div className="animate-fade-up [animation-delay:120ms]">
            <HeroPreview />
          </div>
        </div>
      </section>

      {/* Metrics strip */}
      <section className="border-y border-border bg-surface/30">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-5 py-10 sm:grid-cols-3">
          {METRICS.map((m) => (
            <div key={m.label} className="text-center sm:text-left">
              <div className="text-3xl font-semibold gradient-text">{m.stat}</div>
              <p className="mt-1 text-sm text-muted">{m.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Problem → Solution */}
      <section className="mx-auto max-w-3xl px-5 py-20 text-center">
        <p className="text-sm font-semibold uppercase tracking-wider text-brand">The leak no one's plugging</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Most revenue isn&apos;t lost to competitors. It&apos;s lost to silence.
        </h2>
        <p className="mt-5 text-lg leading-relaxed text-muted">
          Deals stall, follow-ups slip, and good leads quietly go cold while reps chase what&apos;s loud. Revenue Recall watches every deal, ranks what&apos;s slipping by how much you can still save, and puts the next move one click away.
        </p>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-5 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand">Everything you need to close the loop</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">One platform, the whole motion</h2>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="group rounded-2xl border border-border bg-surface p-6 transition hover:border-brand/40 hover:bg-surface-2/40">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-soft text-xl text-brand transition group-hover:scale-105">{f.icon}</div>
              <h3 className="mt-4 font-semibold text-white">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-y border-border bg-surface/30">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-brand">How it works</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Live in minutes. Recovering by day one.</h2>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-2xl border border-border bg-surface p-6">
                <div className="text-3xl font-semibold text-brand/40">{s.n}</div>
                <h3 className="mt-3 font-semibold text-white">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Industries */}
      <section id="industries" className="mx-auto max-w-6xl px-5 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand">Tuned to your world</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Built for every industry</h2>
          <p className="mt-4 text-muted">Terminology, pipelines, and playbooks that match how you sell — out of the box.</p>
        </div>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          {INDUSTRIES.filter((i) => i.id !== "generic").map((i) => (
            <span key={i.id} className="rounded-full border border-border bg-surface px-4 py-2 text-sm text-white transition hover:border-brand/40">
              {i.label}
            </span>
          ))}
          <span className="rounded-full border border-dashed border-border px-4 py-2 text-sm text-muted">+ your vertical</span>
        </div>
      </section>

      {/* Testimonials */}
      <section className="border-y border-border bg-surface/30">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="grid gap-5 md:grid-cols-3">
            {TESTIMONIALS.map((t) => (
              <figure key={t.role} className="rounded-2xl border border-border bg-surface p-6">
                <div className="text-2xl leading-none text-brand">&ldquo;</div>
                <blockquote className="mt-2 text-sm leading-relaxed text-white">{t.quote}</blockquote>
                <figcaption className="mt-4 text-xs text-muted">{t.role}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-6xl px-5 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand">Pricing</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Start free. Scale when it pays for itself.</h2>
        </div>
        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {PRICING.map((p) => (
            <div key={p.name} className={`relative rounded-2xl border p-7 ${p.featured ? "border-brand bg-surface ring-glow" : "border-border bg-surface"}`}>
              {p.featured && <span className="absolute -top-3 left-7 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white">Most popular</span>}
              <h3 className="font-semibold text-white">{p.name}</h3>
              <p className="mt-1 text-sm text-muted">{p.blurb}</p>
              <div className="mt-5 flex items-end gap-1">
                <span className="text-4xl font-semibold text-white">{p.price}</span>
                <span className="mb-1 text-sm text-muted">{p.cadence}</span>
              </div>
              <Link href={p.href} className={`mt-6 block rounded-xl px-4 py-2.5 text-center text-sm font-semibold transition ${p.featured ? "bg-brand text-white hover:bg-brand/90" : "border border-border text-white hover:bg-surface-2"}`}>
                {p.cta}
              </Link>
              <ul className="mt-6 space-y-2.5">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-muted">
                    <span className="mt-0.5 text-success">✓</span> {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-5 pb-24">
        <div className="hero-glow relative overflow-hidden rounded-3xl border border-border bg-surface px-8 py-16 text-center">
          <div className="surface-grid absolute inset-0 opacity-30" />
          <div className="relative">
            <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Stop losing deals to silence.</h2>
            <p className="mx-auto mt-4 max-w-xl text-muted">Spin up Revenue Recall in minutes — connect your CRM or start fresh — and see what you can win back.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/signup" className="rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand/90">Start free</Link>
              <Link href="/dashboard" className="rounded-xl border border-border bg-surface/60 px-6 py-3 text-sm font-semibold text-white transition hover:bg-surface-2">Explore the demo</Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
