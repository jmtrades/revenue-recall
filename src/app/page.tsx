import Link from "next/link";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { Footer } from "@/components/marketing/Footer";
import { HeroPreview } from "@/components/marketing/HeroPreview";
import { PricingPlans } from "@/components/marketing/PricingPlans";
import { Icon, type IconName } from "@/components/icons";
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

const FEATURES: { icon: IconName; title: string; body: string }[] = [
  { icon: "recall", title: "Revenue Recall engine", body: "Automatically scores every deal going cold, stalled, or marked lost-but-winnable — and tells a rep the single best next action, ranked by recoverable revenue." },
  { icon: "database", title: "Works with any CRM — or none", body: "One adapter layer for Salesforce, HubSpot, Close, Pipedrive, or our built-in CRM. No CRM? Start fresh in minutes. Switch backends without losing a thing." },
  { icon: "autopilot", title: "AI that drafts and calls", body: "Claude writes personalized email, SMS, and call scripts from real deal context, briefs reps before every call, and summarizes outcomes straight into the timeline." },
  { icon: "dialer", title: "Power Dialer", body: "Work your highest-value calls back-to-back with AI prep, click-to-call, and auto-logged outcomes and sentiment. No more cold dials into the void." },
  { icon: "automations", title: "Automations", body: "Speed-to-lead, idle-deal recall, stage hand-offs, win-backs — set-and-forget rules that handle the follow-up so nothing slips." },
  { icon: "layers", title: "Built for every industry", body: "Real estate, mortgage, insurance, SaaS, agencies, auto, home services — terminology, pipelines, and playbooks tuned to how you actually sell." },
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

const FAQ = [
  { q: "Do I need a CRM to use this?", a: "No. Revenue Recall ships with a built-in CRM, so you can start in minutes with nothing. Already on Salesforce, HubSpot, Close, or Pipedrive? It plugs in and works on top." },
  { q: "Will the AI sound like a robot?", a: "No — that's the point. You teach it your voice in one step (describe yourself or paste a few of your real messages), and every email, text, and call script reads like you wrote it." },
  { q: "Is it really autonomous?", a: "As autonomous as you want. Run tasks manually, set them on a schedule, or let the AI work your pipeline end-to-end. Review mode drafts everything for one-click approval; autonomous mode sends and logs on its own." },
  { q: "What does it cost to start?", a: "Nothing. The Starter plan is free, with no credit card. Upgrade to Growth when the recovered revenue more than pays for it." },
  { q: "Which industries does it support?", a: "Real estate, mortgage, insurance, SaaS, agencies, automotive, home services, and more — with pipelines, terminology, and playbooks tuned to each. Plus a universal template for anything else." },
  { q: "How fast can I be live?", a: "Two minutes. Sign up, pick your industry, and your pipeline, sequences, and AI are ready — your data and recall queue populate immediately." },
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
            <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight text-fg sm:text-5xl lg:text-6xl">
              Recover the revenue <span className="gradient-text">you&apos;re about to lose.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
              Revenue Recall finds the deals going cold in <em>any</em> CRM — or none — drafts the outreach with AI, and helps you close the loop. Built for every industry.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/signup" className="rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand/90">
                Start free — no card
              </Link>
              <Link href="/dashboard" className="rounded-xl border border-border bg-surface/60 px-6 py-3 text-sm font-semibold text-fg transition hover:bg-surface-2">
                See the live demo →
              </Link>
            </div>
            <p className="mt-3 text-xs text-muted">Free to start · No credit card · Live in 2 minutes</p>
            <div className="mt-6 flex items-center gap-4">
              <div className="flex -space-x-2">
                {["AC", "JN", "SP", "TR", "MK"].map((i, n) => (
                  <span key={i} className="grid h-8 w-8 place-items-center rounded-full border-2 border-bg text-[10px] font-semibold text-white" style={{ background: ["#5b8cff", "#34d399", "#fbbf24", "#a78bfa", "#fb923c"][n] }}>{i}</span>
                ))}
              </div>
              <div className="text-sm">
                <span className="text-warn">★★★★★</span>
                <span className="ml-2 text-muted">Loved by sales teams across 8 industries</span>
              </div>
            </div>
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

      {/* Integrations / works-with bar */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-5 py-8">
          <p className="text-center text-xs font-semibold uppercase tracking-wider text-muted">Plugs into the stack you already use — or works with none</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm font-medium text-muted/80">
            {["Salesforce", "HubSpot", "Close", "Pipedrive", "Gmail", "Outlook", "Twilio", "Slack"].map((n) => (
              <span key={n} className="transition hover:text-fg">{n}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Problem → Solution */}
      <section className="mx-auto max-w-3xl px-5 py-20 text-center">
        <p className="text-sm font-semibold uppercase tracking-wider text-brand">The leak no one&apos;s plugging</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
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
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">One platform, the whole motion</h2>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="group rounded-2xl border border-border bg-surface p-6 transition hover:border-brand/40 hover:bg-surface-2/40">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-soft text-brand transition group-hover:scale-105"><Icon name={f.icon} size={22} /></div>
              <h3 className="mt-4 font-semibold text-fg">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Before / after */}
      <section className="mx-auto max-w-5xl px-5 py-16">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-surface p-7">
            <p className="text-sm font-semibold uppercase tracking-wider text-muted">The old way</p>
            <ul className="mt-4 space-y-3 text-sm text-muted">
              {["Deals quietly go cold while reps chase what's loud", "Hours lost to CRM data entry no one wants to do", "Generic, robotic outreach that gets ignored", "Follow-ups slip through the cracks", "You find out a deal died weeks too late"].map((t) => (
                <li key={t} className="flex gap-2"><span className="text-danger">✕</span> {t}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-brand/40 bg-surface p-7 ring-glow">
            <p className="text-sm font-semibold uppercase tracking-wider text-brand">With Revenue Recall</p>
            <ul className="mt-4 space-y-3 text-sm text-fg">
              {["Every slipping deal surfaced and ranked by recoverable revenue", "The record writes itself — AI logs the work automatically", "Outreach in your exact voice, indistinguishable from you", "Autopilot follows up so nothing is ever dropped", "You act before deals go cold, not after"].map((t) => (
                <li key={t} className="flex gap-2"><span className="text-success">✓</span> {t}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-y border-border bg-surface/30">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-brand">How it works</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Live in minutes. Recovering by day one.</h2>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-2xl border border-border bg-surface p-6">
                <div className="text-3xl font-semibold text-brand/40">{s.n}</div>
                <h3 className="mt-3 font-semibold text-fg">{s.title}</h3>
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
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Built for every industry</h2>
          <p className="mt-4 text-muted">Terminology, pipelines, and playbooks that match how you sell — out of the box.</p>
        </div>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          {INDUSTRIES.filter((i) => i.id !== "generic").map((i) => (
            <span key={i.id} className="rounded-full border border-border bg-surface px-4 py-2 text-sm text-fg transition hover:border-brand/40">
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
                <div className="text-sm text-warn">★★★★★</div>
                <blockquote className="mt-3 text-sm leading-relaxed text-fg">“{t.quote}”</blockquote>
                <figcaption className="mt-4 text-xs text-muted">{t.role}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-5 py-20">
        <div className="text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand">FAQ</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Questions, answered</h2>
        </div>
        <div className="mt-10 space-y-3">
          {FAQ.map((f) => (
            <details key={f.q} className="group rounded-xl border border-border bg-surface p-5 [&_summary]:cursor-pointer">
              <summary className="flex items-center justify-between text-sm font-medium text-fg marker:content-['']">
                {f.q}
                <span className="text-muted transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-6xl px-5 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand">Pricing</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Start free. Scale when it pays for itself.</h2>
        </div>
        <PricingPlans />
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-5 pb-24">
        <div className="hero-glow relative overflow-hidden rounded-3xl border border-border bg-surface px-8 py-16 text-center">
          <div className="surface-grid absolute inset-0 opacity-30" />
          <div className="relative">
            <h2 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Stop losing deals to silence.</h2>
            <p className="mx-auto mt-4 max-w-xl text-muted">Spin up Revenue Recall in minutes — connect your CRM or start fresh — and see what you can win back.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/signup" className="rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand/90">Start free</Link>
              <Link href="/dashboard" className="rounded-xl border border-border bg-surface/60 px-6 py-3 text-sm font-semibold text-fg transition hover:bg-surface-2">Explore the demo</Link>
            </div>
            <p className="mt-4 text-xs text-muted">Free forever to start · No credit card · Cancel anytime</p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
