import Link from "next/link";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { Footer } from "@/components/marketing/Footer";
import { HeroPreview } from "@/components/marketing/HeroPreview";
import { PricingPlans } from "@/components/marketing/PricingPlans";
import { Icon, type IconName } from "@/components/icons";
import { INDUSTRIES } from "@/lib/industries";

const DESCRIPTION =
  "Revenue Recall is an autonomous AI sales force. It runs your outbound end to end — finds the deals slipping away, works them across email, SMS, and the phone, follows up until they reply, and recovers the revenue you're losing. Every industry. Any CRM, or none.";

export const metadata = {
  title: "Revenue Recall — Autonomous outbound that runs your whole sales operation",
  description: DESCRIPTION,
  openGraph: {
    title: "Revenue Recall — Put your entire sales operation on autopilot",
    description: DESCRIPTION,
    type: "website",
    siteName: "Revenue Recall",
  },
  twitter: { card: "summary_large_image", title: "Revenue Recall", description: DESCRIPTION },
};

// What it actually DOES — the whole motion, not a writing assistant.
const PILLARS: { icon: IconName; title: string; body: string }[] = [
  { icon: "autopilot", title: "Runs outbound with no human in the loop", body: "It decides who to contact and when, writes in your voice, sends, calls, and follows up until they reply — then logs it all. Set it to draft-for-approval, schedule it, or hand it the wheel completely." },
  { icon: "recall", title: "Recovers revenue you've already lost", body: "The Recall engine scores every deal going cold, stalled, or marked lost-but-winnable, ranks them by recoverable dollars, and works them back to life. This is the money sitting in your CRM that no one's touching." },
  { icon: "dialer", title: "Every channel — email, SMS, and the phone", body: "Not just email. It sends texts, runs a power dialer with AI call prep and live talk-tracks, leaves voicemails, and books the next step — across the channels your buyers actually respond on." },
  { icon: "layers", title: "Tuned to every industry", body: "Real estate, mortgage, insurance, SaaS, agencies, auto, home services — and anything else. Pipelines, terminology, objections, and playbooks that match how your world actually sells, out of the box." },
  { icon: "database", title: "Works with any CRM — or none", body: "Plugs into Salesforce, HubSpot, Close, or Pipedrive on day one, or runs on the built-in CRM if you have none. Switch backends without losing a thing." },
  { icon: "reports", title: "Reports what it recovered", body: "Not vanity metrics — recovered revenue, won-back deals, and per-rep performance. You see exactly what the system put back on the board, and what's still at risk." },
];

const STEPS = [
  { n: "01", title: "Connect or start fresh", body: "Plug in your CRM or spin up the built-in one. It maps your pipeline, contacts, and history in minutes and learns your voice." },
  { n: "02", title: "It goes to work", body: "The engine finds what's slipping, prioritizes by recoverable revenue, and starts working deals across email, SMS, and the phone — on the autonomy level you set." },
  { n: "03", title: "You collect the wins", body: "Replies, booked meetings, and re-engaged deals land back in your pipeline. Everything's logged. You approve, close, and watch recovered revenue climb." },
];

const METRICS = [
  { stat: "24/7", label: "works every deal around the clock — no human in the loop required" },
  { stat: "23%", label: "of dead deals are reactivatable — and almost none ever get a second touch" },
  { stat: "1", label: "system replacing the SDR, the dialer, the sequencer, and the CRM busywork" },
];

const TESTIMONIALS = [
  { quote: "We turned it on and it just started working deals we'd written off. It's not a tool my reps use — it's a rep that doesn't sleep.", role: "VP Sales, B2B SaaS" },
  { quote: "I stopped paying for three SDRs and a sequencer. This does the prospecting, the calls, and the follow-up — and books more meetings than they did.", role: "Founder, Insurance Agency" },
  { quote: "Same playbook on the team that had Salesforce and the team that had nothing. It runs both. Recovered revenue paid for it in week one.", role: "RevOps Lead, Real Estate" },
];

const FAQ = [
  { q: "How is this different from ChatGPT or Claude?", a: "Those give you words. Revenue Recall does the work. It decides who to reach and when, writes in your voice, sends across email/SMS/phone, follows up until they reply, logs everything, and tells you what revenue it recovered. A writing assistant hands you a draft and stops — this runs the entire motion." },
  { q: "Is it really autonomous?", a: "As autonomous as you want. Review mode drafts everything for one-click approval. Scheduled mode runs on a cadence. Full autopilot works your pipeline end-to-end — sending, calling, and following up — with guardrails for quiet hours, opt-outs, and daily caps so it stays safe and on-brand." },
  { q: "Does it really do calls, not just email?", a: "Yes. It runs a power dialer with AI call prep and live talk-tracks, handles objections, leaves natural voicemails, and logs outcomes and sentiment automatically. Email, SMS, and voice — the full outbound stack." },
  { q: "Which industries does it support?", a: "Real estate, mortgage, insurance, SaaS, agencies, automotive, home services — each with tuned pipelines, terminology, objections, and playbooks. Plus a universal template for anything else. It sells like someone who knows your business." },
  { q: "Do I need a CRM?", a: "No. It ships with a built-in CRM, so you can start in minutes with nothing. Already on Salesforce, HubSpot, Close, or Pipedrive? It plugs in and runs on top — no migration." },
  { q: "Will the outreach sound like a robot?", a: "No. You teach it your voice in one step (describe yourself or paste a few real messages) and every email, text, and call reads like you wrote it. It's engineered to be indistinguishable from a great human rep." },
  { q: "How fast can I be live?", a: "Two minutes. Sign up, pick your industry, connect a CRM or start fresh — your pipeline, sequences, and autonomous outbound are ready immediately." },
];

function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function CheckMini() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function CrossMini() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <MarketingNav />

      {/* Hero */}
      <section className="hero-glow relative overflow-hidden">
        <div className="surface-grid absolute inset-0 opacity-40" />
        <div className="relative mx-auto grid max-w-6xl gap-12 px-5 pb-20 pt-14 lg:grid-cols-2 lg:items-center lg:pb-28 lg:pt-20">
          <div className="animate-fade-up">
            <span className="eyebrow">Autonomous outbound · every industry</span>
            <h1 className="mt-5 text-[2.6rem] font-semibold leading-[1.05] tracking-tight text-fg sm:text-5xl lg:text-[3.75rem]">
              Put your entire sales operation <span className="gradient-text">on autopilot.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-body">
              Revenue Recall doesn&apos;t just draft messages — it <strong className="font-semibold text-fg">runs your outbound end to end</strong>. It finds the deals slipping away, works them across email, SMS, and the phone, follows up until they reply, and recovers the revenue you&apos;re losing. A sales force that never sleeps — for any industry, on any CRM, or none.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/signup" className="cta group inline-flex items-center gap-2 rounded-full bg-brand py-2 pl-5 pr-2 text-sm font-semibold text-white hover:bg-brand/90">
                Start free — no card
                <span className="grid h-7 w-7 place-items-center rounded-full bg-white/20 transition-transform duration-200 ease-out group-hover:translate-x-0.5">
                  <Arrow />
                </span>
              </Link>
              <Link href="/dashboard" className="cta inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-5 py-2.5 text-sm font-semibold text-fg transition-colors hover:bg-surface-2">
                Watch it run live
                <Arrow className="text-muted" />
              </Link>
            </div>
            <p className="mt-3 text-xs text-muted">Free to start · No credit card · Live in 2 minutes</p>
            <div className="mt-10 pt-6">
              <div className="hairline" />
              <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Runs closing teams in</p>
              <p className="mt-2 text-sm text-body">Real estate · SaaS · Insurance · Mortgage · Agencies · Auto · Home services</p>
            </div>
          </div>
          <div className="animate-fade-up [animation-delay:120ms]">
            <HeroPreview />
          </div>
        </div>
      </section>

      {/* Metrics strip */}
      <section className="border-y border-border bg-surface/30">
        <div className="mx-auto grid max-w-6xl grid-cols-1 divide-y divide-border px-5 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {METRICS.map((m) => (
            <div key={m.label} className="px-2 py-10 text-center sm:px-8 sm:text-left">
              <div className="font-display text-4xl font-semibold tabular-nums tracking-tight text-fg sm:text-5xl">{m.stat}</div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{m.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Integrations / works-with bar */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-5 py-10">
          <p className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Runs on the stack you already use — or none of it</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
            {["Salesforce", "HubSpot", "Close", "Pipedrive", "Gmail", "Outlook", "Twilio", "Slack"].map((n) => (
              <span key={n} className="font-display text-[15px] font-medium tracking-tight text-muted/70 transition-colors hover:text-body">{n}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Objection killer: not a drafting tool */}
      <section className="mx-auto max-w-5xl px-5 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">The difference</span>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
            You don&apos;t need another AI that writes. You need the work <span className="gradient-text">done.</span>
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-muted">
            Everyone has ChatGPT and Claude. They hand you a draft and stop. The hard part was never the words — it&apos;s knowing who to chase, doing it relentlessly across every channel, and never dropping a follow-up.
          </p>
        </div>
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-surface p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">AI writing tools</p>
            <ul className="mt-5 space-y-3.5 text-sm text-muted">
              {["You decide who to contact", "You paste in the context", "You copy the draft out", "You send it — once", "You remember to follow up (or don't)", "You log it in the CRM later"].map((t) => (
                <li key={t} className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-[18px] w-[18px] flex-none place-items-center rounded-full border border-border text-muted/70"><CrossMini /></span>
                  {t}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-xs text-muted">You still do all the work. It just types faster.</p>
          </div>
          <div className="raised rounded-2xl border border-brand/40 bg-surface p-7 ring-glow">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">Revenue Recall</p>
            <ul className="mt-5 space-y-3.5 text-sm text-body">
              {["Finds the deals worth working, ranked by $ recoverable", "Pulls the context from your CRM itself", "Writes in your voice — across email, SMS & calls", "Sends, dials, and leaves voicemails autonomously", "Follows up on a cadence until they reply", "Logs every touch and reports what it recovered"].map((t) => (
                <li key={t} className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-[18px] w-[18px] flex-none place-items-center rounded-full bg-brand/15 text-brand"><CheckMini /></span>
                  {t}
                </li>
              ))}
            </ul>
            <p className="mt-6 text-xs font-medium text-brand">It does the job. You collect the wins.</p>
          </div>
        </div>
      </section>

      {/* Pillars — what it does */}
      <section id="features" className="border-y border-border bg-surface/30">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <span className="eyebrow">One system, the whole motion</span>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">An autonomous sales force, not a feature</h2>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {PILLARS.map((f) => (
              <div key={f.title} className="group raised lift rounded-2xl border border-border bg-surface p-6 hover:border-brand/40">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-soft text-brand ring-1 ring-inset ring-brand/20 transition-transform duration-200 ease-out group-hover:scale-105"><Icon name={f.icon} size={22} /></div>
                <h3 className="mt-4 font-semibold text-fg">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Autonomy spectrum */}
      <section className="mx-auto max-w-5xl px-5 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand">You set the leash</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">From co-pilot to fully hands-off</h2>
          <p className="mt-4 text-muted">Start with everything queued for your approval. Trust it more, hand it more — all the way to running your outbound while you sleep.</p>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {[
            { tag: "Review", title: "It drafts, you approve", body: "Every message and call plan is queued for one-click approval. Perfect for week one." },
            { tag: "Scheduled", title: "It runs on a cadence", body: "Sequences fire on schedule across channels. You stay in the loop on the outcomes, not the busywork." },
            { tag: "Autopilot", title: "It runs the operation", body: "Full end-to-end autonomy — sends, calls, follows up, and recovers deals with guardrails on quiet hours, opt-outs, and caps." },
          ].map((s, i) => (
            <div key={s.tag} className={`rounded-2xl border p-6 ${i === 2 ? "border-brand/40 bg-surface ring-glow" : "border-border bg-surface"}`}>
              <span className={`pill ${i === 2 ? "bg-brand-soft text-brand" : "bg-surface-2 text-muted"}`}>{s.tag}</span>
              <h3 className="mt-3 font-semibold text-fg">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
            </div>
          ))}
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
          <p className="mt-4 text-muted">It knows the terminology, the objections, and the way deals actually close in your business — out of the box.</p>
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
              <figure key={t.role} className="rounded-2xl border border-border bg-surface p-6 shadow-soft">
                <span className="font-display text-3xl leading-none text-brand">&ldquo;</span>
                <blockquote className="mt-2 text-sm leading-relaxed text-fg">{t.quote}</blockquote>
                <figcaption className="mt-4 text-xs font-medium uppercase tracking-wider text-muted">{t.role}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* What it replaces — the ROI math */}
      <section className="mx-auto max-w-5xl px-5 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand">The math</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">One system replaces the whole stack — and the headcount.</h2>
          <p className="mt-4 text-muted">What teams pay today to do what Revenue Recall does autonomously:</p>
        </div>
        <div className="mx-auto mt-10 grid max-w-3xl gap-px overflow-hidden rounded-2xl border border-border bg-border">
          {[
            { item: "An SDR / appointment setter (salary + ramp)", cost: "$4,000–6,000 / mo" },
            { item: "Sales sequencer (Outreach, Salesloft)", cost: "$100+ / user / mo" },
            { item: "Power dialer", cost: "$100+ / user / mo" },
            { item: "Data, enrichment & AI writing tools", cost: "$100+ / mo" },
          ].map((r) => (
            <div key={r.item} className="flex items-center justify-between gap-4 bg-surface px-5 py-4 text-sm">
              <span className="text-muted">{r.item}</span>
              <span className="shrink-0 font-medium text-fg line-through decoration-danger/60">{r.cost}</span>
            </div>
          ))}
          <div className="flex items-center justify-between gap-4 bg-brand-soft/40 px-5 py-5">
            <span className="font-semibold text-fg">Revenue Recall — all of it, autonomous, 24/7</span>
            <span className="shrink-0 text-lg font-semibold gradient-text">from $149 / mo</span>
          </div>
        </div>
        <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-muted">
          Reactivate a single mid-size deal and it&apos;s paid for the year. Everything else it recovers is margin.
        </p>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-y border-border bg-surface/30">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-wider text-brand">Pricing</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Priced per AI rep — a fraction of the human one.</h2>
            <p className="mt-4 text-muted">Start free and watch it surface the revenue you&apos;re losing. Add reps when it&apos;s already paying for itself.</p>
          </div>
          <PricingPlans />
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

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-5 pb-24">
        <div className="hero-glow relative overflow-hidden rounded-3xl border border-border bg-surface px-8 py-16 text-center">
          <div className="surface-grid absolute inset-0 opacity-30" />
          <div className="relative">
            <h2 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Your pipeline is full of revenue you&apos;re not working.</h2>
            <p className="mx-auto mt-4 max-w-xl text-muted">Turn on Revenue Recall in minutes — connect your CRM or start fresh — and let it go win it back.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/signup" className="cta rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white hover:bg-brand/90">Start free</Link>
              <Link href="/dashboard" className="cta rounded-xl border border-border bg-surface/60 px-6 py-3 text-sm font-semibold text-fg hover:bg-surface-2">Watch it run</Link>
            </div>
            <p className="mt-4 text-xs text-muted">Free forever to start · No credit card · Cancel anytime</p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
