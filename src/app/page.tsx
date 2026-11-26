import Link from "next/link";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { Footer } from "@/components/marketing/Footer";
import { HeroPreview } from "@/components/marketing/HeroPreview";
import { RecallOrbit } from "@/components/RecallOrbit";
import { StickyCTA } from "@/components/marketing/StickyCTA";
import { PricingPlans } from "@/components/marketing/PricingPlans";
import { BrandLogos } from "@/components/marketing/BrandLogos";
import { VoiceDemo } from "@/components/marketing/VoiceDemo";
import { Icon, type IconName } from "@/components/icons";
import { Reveal, Stagger, StaggerItem, ScaleIn } from "@/components/motion/Motion";
import { SITE_URL } from "@/lib/site";

const DESCRIPTION =
  "Revenue Recall recovers high-ticket webinar drop-offs for coaches, consultants, and course creators. When someone leaves before the pitch, the AI sales team follows up by phone, text, email, and social — and keeps one thread per lead.";

export const metadata = {
  title: "Revenue Recall — Webinar drop-off recovery for coaches and consultants",
  description: DESCRIPTION,
  openGraph: {
    title: "Revenue Recall — The phone rings when they leave the webinar",
    description: DESCRIPTION,
    type: "website",
    siteName: "Revenue Recall",
  },
  twitter: { card: "summary_large_image", title: "Revenue Recall", description: DESCRIPTION },
  alternates: { canonical: SITE_URL },
};

// Structured data so search engines render a rich result (org + product). No
// hardcoded price — `catalog.ts` is the single source of truth for that, and we
// don't fabricate ratings or reviews.
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "Revenue Recall",
      url: SITE_URL,
      logo: `${SITE_URL}/icon.svg`,
      description: DESCRIPTION,
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "Revenue Recall",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "SoftwareApplication",
      name: "Revenue Recall",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: DESCRIPTION,
      offers: { "@type": "Offer", category: "SaaS" },
    },
  ],
};

// What it actually DOES — the whole motion, not a writing assistant.
const PILLARS: { icon: IconName; title: string; body: string }[] = [
  { icon: "autopilot", title: "The phone rings when they leave", body: "A registrant who drops before the pitch is worked immediately: a call, then a text, then an email. You can review every line, or let the team send it." },
  { icon: "recall", title: "One thread for every channel", body: "Instagram, Messenger, WhatsApp, SMS, email, and the site chat land on the same lead. The next reply knows what they already said." },
  { icon: "dialer", title: "A sales team with roles", body: "Speed-to-lead, setting the call, closer assist, drop-off recovery, and reactivation. Each one handles the objection in front of it and hands the lead to a person when you pause the AI." },
  { icon: "layers", title: "Built for the webinar offer", body: "High-ticket coaches, consultants, and course creators. The language is the enrollment conversation, not a generic outbound script." },
  { icon: "database", title: "Works with any CRM — or none", body: "Plugs into Salesforce, HubSpot, Close, or Pipedrive on day one, or runs on the built-in CRM if you have none. Switch backends without losing a thing." },
  { icon: "reports", title: "Reports what it recovered", body: "Not vanity metrics — recovered revenue, won-back deals, and per-rep performance. You see exactly what the system put back on the board, and what's still at risk." },
];

const STEPS = [
  { n: "01", title: "Point the webinar at it", body: "Paste the webhook or the beacon. Zoom, WebinarJam, GoTo, Demio, and the rest are already armed. A leave becomes a lead in the same second the event arrives." },
  { n: "02", title: "The team works the drop-off", body: "The recovery role calls, texts, and emails. The setter books the call. Instagram, ads, and the site chat join the same thread." },
  { n: "03", title: "You see the money", body: "Booked calls and sales stay attached to the ad that started them, so cost per call and return on spend are on one page." },
];

const METRICS = [
  { stat: "Seconds", label: "from a leave event to the recovery call being queued" },
  { stat: "One", label: "thread per lead, across the phone, text, email, and social" },
  { stat: "Five", label: "roles: speed-to-lead, setter, closer assist, recovery, reactivation" },
];

// Who it's for — coaches, consultants, and course creators.
// thousands. Proves the product spans solo operators through the enterprise.
const AUDIENCES: { scale: string; icon: IconName; title: string; body: string; points: string[] }[] = [
  {
    scale: "For one",
    icon: "autopilot",
    title: "High-ticket coaches",
    body: "You run the webinar. The people who leave before the pitch are the ones who needed the next conversation. The recovery team starts it while you are still on the call.",
    points: ["Leave, no-show, and replay on one timeline", "Books the strategy call in the thread", "STOP, quiet hours, and an AI pause"],
  },
  {
    scale: "For a team",
    icon: "leads",
    title: "Consultants",
    body: "A webinar that fills the calendar only works if the no-shows get a human follow-up. The setter asks for the call. You take the ones that are qualified.",
    points: ["BANT and fit scored from the thread", "One inbox for DM, SMS, and email", "Spend tied to booked calls and sales"],
  },
  {
    scale: "For the enterprise",
    icon: "building",
    title: "Course creators",
    body: "The offer is on the webinar. The leak is everyone who registered and never saw it. The calculator prices that leak from your own show rate and close rate.",
    points: ["Public leak calculator for the ad", "Instant-form leads from Meta land here", "No invented stats or testimonials"],
  },
];

const FAQ = [
  { q: "How is this different from ChatGPT or Claude?", a: "Those give you words. Revenue Recall does the work. It decides who to reach and when, writes in your voice, sends across email/SMS/phone, follows up until they reply, logs everything, and tells you what revenue it recovered. A writing assistant hands you a draft and stops — this runs the entire motion." },
  { q: "Is it really autonomous?", a: "As autonomous as you want. Review mode drafts everything for one-click approval. Scheduled mode runs on a cadence. Full autopilot works your pipeline end-to-end — sending, calling, and following up — with guardrails for quiet hours, opt-outs, and daily caps so it stays safe and on-brand." },
  { q: "Does it really do calls, not just email?", a: "Yes. It runs a power dialer with AI call prep and live talk-tracks, handles objections, leaves natural voicemails, and logs outcomes and sentiment automatically. Email, SMS, and voice — the full outbound stack." },
  { q: "Who is it for?", a: "High-ticket coaches, consultants, and course creators who run webinars. The public site and the ad destination are built for that offer. Other pipelines still exist in the product if you already use one." },
  { q: "Do I need a CRM?", a: "No. It ships with a built-in CRM, so you can start in minutes with nothing. Already on Salesforce, HubSpot, Close, or Pipedrive? It plugs in and runs on top — no migration." },
  { q: "Will the outreach sound like a robot?", a: "No. You teach it your voice in one step (describe yourself or paste a few real messages) and every email, text, and call reads like you wrote it. It's engineered to be indistinguishable from a great human rep." },
  { q: "How fast can I be live?", a: "Paste the webinar webhook or the beacon, and the next leave is a lead. The leak calculator at /webinar-leak is the page to send ad traffic to." },
];

// FAQPage structured data — makes the Q&A below eligible for Google's FAQ rich
// result. Built straight from the FAQ above, so the markup can't drift from the
// rendered copy.
const FAQ_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

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
    <div className="landing min-h-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_LD) }} />
      <MarketingNav />

      {/* Hero */}
      <section className="hero-glow relative overflow-hidden">
        <div className="surface-grid absolute inset-0 opacity-40" />
        {/* Signature recall mark — bleeds off the top-right, behind the content. */}
        <RecallOrbit size={560} aria-hidden className="pointer-events-none absolute -right-16 -top-12 hidden opacity-60 lg:block" />
        <div className="relative mx-auto grid max-w-6xl grid-cols-1 gap-8 px-5 pb-12 pt-10 sm:gap-12 sm:pb-20 sm:pt-14 lg:grid-cols-2 lg:items-center lg:pb-28 lg:pt-20">
          <div className="min-w-0 animate-fade-up">
            <span className="eyebrow">Webinar drop-off recovery · coaches, consultants, courses</span>
            <h1 className="display-hero mt-5 text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.02em] sm:text-[3.5rem] sm:leading-[0.98] lg:text-[4.25rem]">
              Someone just left before the pitch. <span className="gradient-text">Their phone is already ringing.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-body">
              An AI sales team for high-ticket webinars. It catches the drop-off, works the lead across phone, text, email, and social, and keeps <strong className="font-semibold text-fg">one thread</strong> so the setter can book the call.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/signup" className="cta group inline-flex items-center gap-2 rounded-full bg-brand-strong py-2 pl-5 pr-2 text-sm font-semibold text-white hover:bg-brand-strong/90">
                Start free — no card
                <span className="grid h-7 w-7 place-items-center rounded-full bg-white/20 transition-transform duration-200 ease-out group-hover:translate-x-0.5">
                  <Arrow />
                </span>
              </Link>
              <Link href="/webinar-leak" className="cta inline-flex items-center gap-2 rounded-full border border-border bg-surface/60 px-5 py-2.5 text-sm font-semibold text-fg transition-colors hover:bg-surface-2">
                Price the leak
                <Arrow className="text-muted" />
              </Link>
            </div>
            <p className="mt-3 text-xs text-muted">Live in 2 minutes · See the revenue you&apos;re losing before you pay · Cancel anytime</p>
            <div className="mt-10 pt-6">
              <div className="hairline" />
              <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Runs closing teams in</p>
              <p className="mt-2 text-sm text-body">Coaches · Consultants · Course creators</p>
            </div>
          </div>
          <div className="min-w-0 animate-fade-up [animation-delay:120ms]">
            <HeroPreview />
          </div>
        </div>
      </section>

      {/* Metrics strip */}
      <section className="border-y border-border bg-surface/30">
        <Stagger className="mx-auto grid max-w-6xl grid-cols-1 divide-y divide-border px-5 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {METRICS.map((m) => (
            <StaggerItem key={m.label} className="px-4 py-6 text-center sm:px-8 sm:py-10 sm:text-left">
              <div className="font-display text-4xl font-semibold tabular-nums tracking-tight text-fg sm:text-5xl">{m.stat}</div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{m.label}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-16 sm:py-24 lg:grid-cols-12">
          <Reveal className="lg:col-span-5">
            <span className="eyebrow">The results</span>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
              You see the work, and the revenue it put back.
            </h2>
            <p className="mt-4 max-w-md text-lg leading-relaxed text-muted">
              Every send, call, reply, webinar join and leave, booking, and win is logged to your workspace. Results shows recovered revenue, leads brought back from a drop-off, and an estimate of hours saved — with the week written out as an email you can forward.
            </p>
          </Reveal>
          <Reveal delay={0.08} className="lg:col-span-7">
            <div className="bezel rounded-[1.75rem] p-2">
              <div className="rounded-[1.4rem] border border-border/80 bg-surface p-5 sm:p-6">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {[
                    ["Revenue recovered", "Won deals, attributed to the touch before them"],
                    ["Rescued from drop-off", "Left the room, then rejoined, replied, or booked"],
                    ["Hours saved", "Estimated from the AI actions that were logged"],
                  ].map(([title, body]) => (
                    <div key={title} className="rounded-2xl bg-surface-2/80 p-4">
                      <p className="text-sm font-medium text-fg">{title}</p>
                      <p className="mt-2 text-xs leading-relaxed text-muted">{body}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-xs text-muted">Numbers come from your ledger. An empty week stays empty.</p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Integrations / works-with bar */}
      <section className="border-b border-border">
        <Reveal className="mx-auto max-w-6xl px-5 py-10">
          <p className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Runs on the stack you already use — or none of it</p>
          <BrandLogos />
        </Reveal>
      </section>

      {/* Hear the voice — live, on-device, no signup */}
      <section className="border-b border-border bg-surface/30">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-5 py-14 sm:py-20 lg:grid-cols-2">
          <Reveal>
            <span className="eyebrow">The voice</span>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
              It calls like a real person. <span className="gradient-text">Hear it now.</span>
            </h2>
            <p className="mt-4 max-w-md text-lg leading-relaxed text-muted">
              Not a robotic phone tree — a natural voice that opens, handles the objection, and asks for the next step. Tap any rep and it speaks the line live, generated on your own device. No signup, nothing uploaded.
            </p>
            <p className="mt-4 text-sm text-muted">The same voice works your power-dialer calls and voicemails, in your rep&apos;s tone.</p>
          </Reveal>
          <Reveal delay={0.1}>
            <VoiceDemo />
          </Reveal>
        </div>
      </section>

      {/* Objection killer: not a drafting tool */}
      <section className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">The difference</span>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
            You don&apos;t need another AI that writes. You need the work <span className="gradient-text">done.</span>
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-muted">
            Everyone has ChatGPT and Claude. They hand you a draft and stop. The hard part was never the words — it&apos;s knowing who to chase, doing it relentlessly across every channel, and never dropping a follow-up.
          </p>
        </Reveal>
        <Stagger className="mt-12 grid gap-5 md:grid-cols-2">
          <StaggerItem className="rounded-2xl border border-border bg-surface p-7">
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
          </StaggerItem>
          <StaggerItem className="raised rounded-2xl border border-brand/40 bg-surface p-7 ring-glow">
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
          </StaggerItem>
        </Stagger>
      </section>

      {/* Pillars — what it does */}
      <section id="features" className="border-y border-border bg-surface/30">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:py-20">
          <Reveal className="mx-auto max-w-2xl text-center">
            <span className="eyebrow">One system, the whole motion</span>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">An autonomous sales force, not a feature</h2>
          </Reveal>
          <Stagger className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {PILLARS.map((f) => (
              <StaggerItem key={f.title} className="group raised lift rounded-2xl border border-border bg-surface p-6 hover:border-brand/40">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-soft text-brand ring-1 ring-inset ring-brand/20 transition-transform duration-200 ease-out group-hover:scale-105"><Icon name={f.icon} size={22} /></div>
                <h3 className="mt-4 font-semibold text-fg">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* Autonomy spectrum */}
      <section className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">You set the leash</span>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">From co-pilot to fully hands-off</h2>
          <p className="mt-4 text-muted">Start with everything queued for your approval. Trust it more, hand it more — all the way to running your outbound while you sleep.</p>
        </Reveal>
        <Stagger className="mt-10 grid gap-5 md:grid-cols-3">
          {[
            { tag: "Review", title: "It drafts, you approve", body: "Every message and call plan is queued for one-click approval. Perfect for week one." },
            { tag: "Scheduled", title: "It runs on a cadence", body: "Sequences fire on schedule across channels. You stay in the loop on the outcomes, not the busywork." },
            { tag: "Autopilot", title: "It runs the operation", body: "Full end-to-end autonomy — sends, calls, follows up, and recovers deals with guardrails on quiet hours, opt-outs, and caps." },
          ].map((s, i) => (
            <StaggerItem key={s.tag} className={`raised rounded-2xl border p-6 ${i === 2 ? "border-brand/40 bg-surface ring-glow" : "border-border bg-surface"}`}>
              <div className="flex items-center justify-between">
                <span className={`pill ${i === 2 ? "bg-brand-soft text-brand" : "bg-surface-2 text-muted"}`}>{s.tag}</span>
                {/* escalating autonomy level — visualizes "you set the leash" */}
                <span className="flex items-center gap-1" aria-label={`Autonomy level ${i + 1} of 3`}>
                  {[0, 1, 2].map((j) => (
                    <span key={j} className={`h-1.5 w-5 rounded-full ${j <= i ? "bg-brand" : "bg-border"}`} />
                  ))}
                </span>
              </div>
              <h3 className="mt-4 font-semibold text-fg">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* How it works */}
      <section id="how" className="border-y border-border bg-surface/30">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:py-20">
          <Reveal className="mx-auto max-w-2xl text-center">
            <span className="eyebrow">How it works</span>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Live in minutes. Recovering by day one.</h2>
          </Reveal>
          {/* Open process timeline — numbered nodes + fading connectors, not more boxes. */}
          <Stagger className="mt-14 grid gap-x-8 gap-y-10 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <StaggerItem key={s.n} className="relative">
                <div className="flex items-center gap-4">
                  <span className="grid h-11 w-11 flex-none place-items-center rounded-full border border-brand/30 bg-brand-soft font-display text-sm font-semibold tabular-nums text-brand shadow-[inset_0_1px_0_0_rgb(255_255_255/0.06)]">
                    {s.n}
                  </span>
                  {i < STEPS.length - 1 && (
                    <span className="hidden h-px flex-1 bg-gradient-to-r from-border to-transparent md:block" aria-hidden />
                  )}
                </div>
                <h3 className="mt-5 font-semibold text-fg">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* Industries */}
      <section id="industries" className="mx-auto max-w-6xl px-5 py-14 sm:py-20">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">Who it is for</span>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">The webinar offer</h2>
          <p className="mt-4 text-muted">Coaches, consultants, and course creators. The enrollment conversation is the default. Other businesses can still pick a pipeline in the product.</p>
        </Reveal>
        <Stagger className="mx-auto mt-12 grid max-w-5xl gap-3 sm:grid-cols-3">
          {[
            ["Coaches", "The room, the pitch, and the people who left it."],
            ["Consultants", "The webinar that should have booked the working session."],
            ["Course creators", "Registrants who never saw the offer."],
          ].map(([title, body]) => (
            <StaggerItem key={title} className="raised rounded-2xl border border-border bg-surface px-5 py-4">
              <p className="text-sm font-semibold text-fg">{title}</p>
              <p className="mt-1 text-sm text-muted">{body}</p>
            </StaggerItem>
          ))}
        </Stagger>
        <p className="mt-6 text-center text-sm"><Link href="/webinar-leak" className="text-brand hover:underline">Open the leak calculator</Link></p>
      </section>

      {/* Who it's for — solo operators through the enterprise */}
      <section id="who" className="mx-auto max-w-6xl px-5 py-14 sm:py-20">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">Who it&rsquo;s for</span>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">One motion for the webinar business</h2>
          <p className="mt-4 text-muted">The same recovery, whether you teach, consult, or sell a course. The ad destination is the leak calculator.</p>
        </Reveal>
        <Stagger className="mt-12 grid gap-5 md:grid-cols-3">
          {AUDIENCES.map((a) => (
            <StaggerItem key={a.title} className="raised lift group flex h-full flex-col rounded-2xl border border-border bg-surface p-7 hover:border-brand/40">
              <div className="flex items-center justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-soft text-brand ring-1 ring-inset ring-brand/20 transition-transform duration-200 ease-out group-hover:scale-105">
                  <Icon name={a.icon} size={18} />
                </span>
                <span className="pill bg-surface-2 text-muted">{a.scale}</span>
              </div>
              <h3 className="mt-5 text-base font-semibold text-fg">{a.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-body">{a.body}</p>
              <ul className="mt-5 space-y-2.5 border-t border-border pt-5">
                {a.points.map((p) => (
                  <li key={p} className="flex items-start gap-2.5 text-sm text-body">
                    <span className="mt-0.5 grid h-[18px] w-[18px] flex-none place-items-center rounded-full bg-brand-soft text-brand"><CheckMini /></span>
                    {p}
                  </li>
                ))}
              </ul>
            </StaggerItem>
          ))}
        </Stagger>
        <p className="mx-auto mt-10 max-w-2xl text-center text-sm text-muted">
          One person or one thousand — same two-minute setup, same engine.{" "}
          <Link href="/signup" className="font-medium text-brand hover:underline">Start free</Link> and scale when you&rsquo;re ready.
        </p>
      </section>

      {/* What it replaces — the ROI math */}
      <section className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">The math</span>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">One system replaces the whole stack — and the headcount.</h2>
          <p className="mt-4 text-muted">What teams pay today to do what Revenue Recall does autonomously:</p>
        </Reveal>
        <ScaleIn className="raised mx-auto mt-10 grid max-w-3xl gap-px overflow-hidden rounded-2xl border border-border bg-border">
          {[
            { item: "An SDR / appointment setter (salary + ramp)", cost: "$4,000–6,000 / mo" },
            { item: "Sales sequencer (Outreach, Salesloft)", cost: "$100+ / user / mo" },
            { item: "Power dialer", cost: "$100+ / user / mo" },
            { item: "Data, enrichment & AI writing tools", cost: "$100+ / mo" },
          ].map((r) => (
            <div key={r.item} className="flex items-center justify-between gap-4 bg-surface px-5 py-4 text-sm">
              <span className="flex items-center gap-3 text-body">
                <span className="grid h-[18px] w-[18px] flex-none place-items-center rounded-full border border-border text-muted/60"><CrossMini /></span>
                {r.item}
              </span>
              <span className="shrink-0 font-medium text-muted line-through decoration-danger/50">{r.cost}</span>
            </div>
          ))}
          <div className="flex items-center justify-between gap-4 border-l-2 border-brand bg-brand-soft/40 px-5 py-5">
            <span className="flex items-center gap-3 font-semibold text-fg">
              <span className="grid h-[18px] w-[18px] flex-none place-items-center rounded-full bg-brand/20 text-brand"><CheckMini /></span>
              Revenue Recall — all of it, autonomous, 24/7
            </span>
            <span className="shrink-0 font-display text-lg font-semibold text-brand">from $599 / mo</span>
          </div>
        </ScaleIn>
        <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-muted">
          Reactivate a single mid-size deal and it&apos;s paid for the year. Everything else it recovers is margin.
        </p>
      </section>

      {/* Integrations / developer platform */}
      <section id="integrations" className="border-y border-border bg-surface/30">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:py-20">
          <Reveal className="mx-auto max-w-2xl text-center">
            <span className="eyebrow">Open platform</span>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Connects to everything you run</h2>
            <p className="mt-4 text-muted">A REST API, webhooks, and a drop-in form — so leads flow in from anywhere and your stack stays in sync, automatically.</p>
          </Reveal>
          <Stagger className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              { icon: "automations" as IconName, title: "REST API", body: "Push leads, and sync contacts & deals both ways with a workspace API key. Full two-way CRUD." },
              { icon: "bell" as IconName, title: "Signed webhooks", body: "Get events the moment they happen — lead.created, deal.won, and more — HMAC-signed for your peace of mind." },
              { icon: "leads" as IconName, title: "Embeddable form", body: "Drop a capture form on any site. Every submission becomes a lead the AI works immediately — no code." },
            ].map((f) => (
              <StaggerItem key={f.title} className="group raised lift rounded-2xl border border-border bg-surface p-6 hover:border-brand/40">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-soft text-brand ring-1 ring-inset ring-brand/20 transition-transform duration-200 ease-out group-hover:scale-105"><Icon name={f.icon} size={22} /></div>
                <h3 className="mt-4 font-semibold text-fg">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
              </StaggerItem>
            ))}
          </Stagger>
          <div className="mt-8 text-center">
            <Link href="/docs/api" className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
              Read the API docs <Arrow className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-y border-border bg-surface/30">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:py-20">
          <Reveal className="mx-auto max-w-2xl text-center">
            <span className="eyebrow">Pricing</span>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Priced per AI rep — a fraction of the human one.</h2>
            <p className="mt-4 text-muted">Start free and watch it surface the revenue you&apos;re losing. Add reps when it&apos;s already paying for itself.</p>
          </Reveal>
          <PricingPlans />
          {/* Risk reversal — true and zero-liability: free to start, no card,
              cancel anytime. (No money-back guarantee — we don't promise results
              we can't control.) */}
          <div className="mx-auto mt-10 flex max-w-2xl flex-col items-center gap-3 rounded-2xl border border-brand/30 bg-brand-soft/10 px-6 py-6 text-center sm:flex-row sm:gap-5 sm:text-left">
            <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-brand-soft text-brand ring-1 ring-inset ring-brand/20">
              <Icon name="shield" size={22} />
            </span>
            <div>
              <p className="font-semibold text-fg">See the value before you pay a cent</p>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                Start free, with no card — and watch it surface the revenue slipping through your pipeline before you ever pay. Add reps only once it&apos;s earning its keep. Cancel anytime, no contract, and your data is always yours.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Trust — concrete mechanisms, not vague "enterprise-grade" */}
      <section className="border-y border-border bg-surface/30">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:py-20">
          <Reveal className="mx-auto max-w-2xl text-center">
            <span className="eyebrow">Built to be trusted</span>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Your data, your rules — and an off switch on everything.</h2>
          </Reveal>
          <Stagger className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: "shield" as IconName, title: "Your data is yours", body: "Export everything or permanently delete your account yourself, anytime — no email, no waiting. Leave with your data intact." },
              { icon: "database" as IconName, title: "Encrypted & isolated", body: "Every workspace is row-level isolated, and the keys you connect (CRM, channels, numbers) are encrypted per org. Your pipeline never mixes with anyone's." },
              { icon: "approvals" as IconName, title: "Compliance, on by default", body: "CAN-SPAM footer and one-tap unsubscribe on email, “Reply STOP” on SMS, plus quiet hours, opt-out lists, and daily caps the AI can't cross." },
              { icon: "autopilot" as IconName, title: "You hold the leash", body: "Run it in review mode and approve every send, or hand it the wheel — and pull it back to manual in one click whenever you want." },
            ].map((t) => (
              <StaggerItem key={t.title} className="rounded-2xl border border-border bg-surface p-6">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-soft text-brand ring-1 ring-inset ring-brand/20">
                  <Icon name={t.icon} size={18} />
                </span>
                <h3 className="mt-4 font-semibold text-fg">{t.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{t.body}</p>
              </StaggerItem>
            ))}
          </Stagger>
          <p className="mt-8 text-center text-sm text-muted">
            More on how we handle data:{" "}
            <Link href="/security" className="font-medium text-brand hover:underline">Security</Link>{" · "}
            <Link href="/privacy" className="font-medium text-brand hover:underline">Privacy</Link>
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl px-5 py-14 sm:py-20">
        <Reveal className="flex flex-col items-center text-center">
          <span className="eyebrow">FAQ</span>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Questions, answered</h2>
        </Reveal>
        <Stagger className="mt-10 space-y-3">
          {FAQ.map((f) => (
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
      </section>

      {/* Final CTA — the close: one objective, the whole promise in three beats */}
      <section className="mx-auto max-w-6xl px-5 pb-24">
        <ScaleIn className="hero-glow bezel relative overflow-hidden rounded-3xl border border-border bg-surface px-5 py-16 text-center sm:px-8 sm:py-20">
          <div className="surface-grid absolute inset-0 opacity-30" />
          <div className="relative mx-auto max-w-2xl">
            <span className="eyebrow">Your move</span>
            <h2 className="mt-5 text-[2rem] font-semibold leading-[1.05] tracking-tight text-fg sm:text-[2.75rem] sm:leading-[1.08]">
              Stop letting deals die in your CRM. <span className="gradient-text">Turn the engine on.</span>
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base text-muted sm:text-lg">
              In two minutes it maps your pipeline, finds the revenue slipping away, and starts working it back — across email, SMS, and the phone, in your voice.
            </p>

            {/* the objective, made concrete */}
            <div className="mx-auto mt-9 grid max-w-lg grid-cols-3 gap-2.5 text-left sm:gap-3">
              {[
                { n: "1", t: "Connect or start fresh", s: "Any CRM, or none" },
                { n: "2", t: "It goes to work", s: "Autonomous · 24/7" },
                { n: "3", t: "You collect the wins", s: "Revenue, recovered" },
              ].map((s) => (
                <div key={s.n} className="rounded-xl border border-border bg-surface-2/40 p-3">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-soft font-display text-xs font-semibold text-brand ring-1 ring-inset ring-brand/20">{s.n}</span>
                  <p className="mt-2.5 text-[13px] font-semibold leading-tight text-fg">{s.t}</p>
                  <p className="mt-1 text-[11px] leading-tight text-muted">{s.s}</p>
                </div>
              ))}
            </div>

            <div className="mt-9 flex flex-col items-center gap-3">
              <Link href="/signup" className="cta group inline-flex items-center gap-2 rounded-full bg-brand-strong py-2.5 pl-6 pr-2.5 text-base font-semibold text-white hover:bg-brand-strong/90">
                Start free — live in 2 minutes
                <span className="grid h-8 w-8 place-items-center rounded-full bg-white/20 transition-transform duration-200 ease-out group-hover:translate-x-0.5">
                  <Arrow />
                </span>
              </Link>
              <p className="text-xs text-muted">
                No credit card · Cancel anytime · <Link href="/pricing" className="font-medium text-brand hover:underline">See pricing</Link>
              </p>
            </div>
          </div>
        </ScaleIn>
      </section>

      <Footer />
      <StickyCTA />
    </div>
  );
}
