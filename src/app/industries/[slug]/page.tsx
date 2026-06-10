import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { Footer } from "@/components/marketing/Footer";
import { StickyCTA } from "@/components/marketing/StickyCTA";
import { Icon } from "@/components/icons";
import { Reveal, Stagger, StaggerItem, ScaleIn } from "@/components/motion/Motion";
import { INDUSTRIES, getIndustry } from "@/lib/industries";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

/**
 * Per-industry SEO + conversion landing pages, e.g. /industries/real-estate.
 * Every word is derived from the SAME industry templates that power the product
 * (pipeline, terminology, objections, playbook), so the marketing claim and the
 * shipped behavior can never drift apart. Static, so they're crawlable and fast.
 */

// URL slugs use hyphens; the template ids use underscores. One stable mapping.
const slugFor = (id: string) => id.replace(/_/g, "-");
const idForSlug = (slug: string) => slug.replace(/-/g, "_");

const LISTED = INDUSTRIES.filter((i) => i.id !== "generic");

export function generateStaticParams() {
  return LISTED.map((i) => ({ slug: slugFor(i.id) }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const ind = LISTED.find((i) => i.id === idForSlug(params.slug));
  if (!ind) return {};
  const title = `${ind.label} sales automation — Revenue Recall`;
  const description = `Autonomous outbound built for ${ind.label.toLowerCase()}: a ${ind.pipeline.label.toLowerCase()} tuned to how you actually sell, AI that works every slipping deal across email, SMS, and the phone, and the revenue you're losing — recovered. ${ind.blurb}`;
  const url = `${SITE_URL}/industries/${params.slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, type: "website", url, siteName: "Revenue Recall" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default function IndustryPage({ params }: { params: { slug: string } }) {
  const ind = LISTED.find((i) => i.id === idForSlug(params.slug));
  if (!ind) notFound();
  const full = getIndustry(ind.id);
  const openStages = full.pipeline.stages.filter((s) => s.type === "open");
  const objections = full.playbook.objections.slice(0, 5);
  const objectionAngles = full.playbook.objectionAngles;
  const sampleVoice = full.playbook.sampleVoice.slice(0, 2);
  const term = full.terminology;

  // JSON-LD so the page is rich-result eligible: the product itself + a
  // breadcrumb trail (Industries → this industry) for breadcrumb rich results.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        name: `Revenue Recall for ${ind.label}`,
        applicationCategory: "BusinessApplication",
        description: ind.blurb,
        offers: { "@type": "Offer", category: "SaaS" },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Industries", item: `${SITE_URL}/industries` },
          { "@type": "ListItem", position: 2, name: ind.label, item: `${SITE_URL}/industries/${params.slug}` },
        ],
      },
    ],
  };

  return (
    <div className="min-h-screen bg-bg">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <MarketingNav />

      <main className="mx-auto max-w-5xl px-5 py-10 sm:py-16">
        <nav className="mb-6 flex items-center gap-2 text-sm text-muted">
          <Link href="/industries" className="hover:text-fg">Industries</Link>
          <span>/</span>
          <span className="text-fg">{ind.label}</span>
        </nav>

        {/* Hero */}
        <section className="max-w-3xl animate-fade-up">
          <span className="eyebrow">Built for {ind.label}</span>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-fg sm:text-5xl">
            Autonomous outbound for {ind.label.toLowerCase()} — it works every deal you&apos;re letting slip.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-muted">
            Revenue Recall ships with a {ind.pipeline.label.toLowerCase()}, the terminology, objections, and follow-up
            plays that match how {ind.label.toLowerCase()} actually sells — then runs them across email, SMS, and the
            phone, following up until they reply. {ind.blurb}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/signup" className="cta rounded-full bg-brand px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand/90">Start free</Link>
            <Link href="/#how" className="cta rounded-full border border-border px-6 py-3 text-sm font-semibold text-fg transition hover:bg-surface-2">See how it works</Link>
          </div>
        </section>

        {/* Pipeline out of the box */}
        <section className="mt-10 sm:mt-16">
          <Reveal>
            <h2 className="text-2xl font-semibold text-fg">Your pipeline, day one</h2>
            <p className="mt-2 text-muted">No setup — the {ind.label} workspace lands with these stages, win-probabilities, and a {term.contact.toLowerCase()}/{term.opportunity.toLowerCase()} model already wired into the forecast.</p>
          </Reveal>
          <Stagger className="mt-6 flex flex-wrap items-stretch gap-2">
            {full.pipeline.stages.map((s) => (
              <StaggerItem key={s.id} className={`flex flex-col rounded-xl border px-4 py-3 ${s.type === "won" ? "border-success/40 bg-success/5" : s.type === "lost" ? "border-danger/40 bg-danger/5" : "border-border bg-surface"}`}>
                <span className="text-sm font-medium text-fg">{s.label}</span>
                <span className="mt-1 text-xs tabular-nums text-muted">{Math.round(s.probability * 100)}% win</span>
              </StaggerItem>
            ))}
          </Stagger>
        </section>

        {/* What it does for this vertical */}
        <Stagger className="mt-10 sm:mt-16 grid gap-5 sm:grid-cols-3">
          {[
            { icon: "recall" as const, title: "Recovers slipping deals", body: `It scores every ${term.opportunity.toLowerCase()} going cold across your ${openStages.length} working stages, ranks by recoverable ${term.value.toLowerCase()}, and works them back.` },
            { icon: "dialer" as const, title: "Every channel they answer", body: "Email, SMS, and a power dialer with AI call prep — tuned to the cadence and timing your buyers actually respond to." },
            { icon: "autopilot" as const, title: "Handles the objections", body: `It knows the real ${ind.label.toLowerCase()} objections — "${objections[0]}", "${objections[1] ?? objections[0]}" — and answers them in your voice.` },
          ].map((c) => (
            <StaggerItem key={c.title} className="rounded-2xl border border-border bg-surface p-5">
              <Icon name={c.icon} size={20} className="text-brand" />
              <h3 className="mt-3 font-semibold text-fg">{c.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{c.body}</p>
            </StaggerItem>
          ))}
        </Stagger>

        {/* Objection handling proof */}
        {objectionAngles && (
          <section className="mt-10 sm:mt-16">
            <Reveal>
              <h2 className="text-2xl font-semibold text-fg">It answers the objections you actually hear</h2>
            </Reveal>
            <Stagger className="mt-6 space-y-3">
              {([["price", "Price"], ["timing", "Timing"], ["trust", "Trust"]] as const).map(([k, label]) =>
                objectionAngles[k] ? (
                  <StaggerItem key={k} className="rounded-xl border border-border bg-surface p-4">
                    <span className="pill bg-surface-2 text-muted">{label}</span>
                    <p className="mt-2 text-sm leading-relaxed text-fg">&ldquo;{objectionAngles[k]}&rdquo;</p>
                  </StaggerItem>
                ) : null,
              )}
            </Stagger>
          </section>
        )}

        {/* Voice samples */}
        {sampleVoice.length > 0 && (
          <section className="mt-10 sm:mt-16">
            <Reveal>
              <h2 className="text-2xl font-semibold text-fg">Messages that sound like you, not a bot</h2>
            </Reveal>
            <Stagger className="mt-6 grid gap-4 sm:grid-cols-2">
              {sampleVoice.map((v, i) => (
                <StaggerItem key={i}>
                  <blockquote className="h-full rounded-2xl border border-border bg-surface-2 p-5 text-sm italic leading-relaxed text-fg">&ldquo;{v}&rdquo;</blockquote>
                </StaggerItem>
              ))}
            </Stagger>
          </section>
        )}

        {/* CTA */}
        <ScaleIn className="mt-20 rounded-3xl border border-brand/30 bg-brand-soft/20 p-10 text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-fg">Put your {ind.label.toLowerCase()} pipeline on autopilot.</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted">Start free. The system maps your pipeline, learns your voice, and starts recovering revenue the same day.</p>
          <Link href="/signup" className="cta mt-6 inline-flex rounded-full bg-brand px-7 py-3 text-sm font-semibold text-white transition hover:bg-brand/90">Start free</Link>
        </ScaleIn>

        {/* Cross-links (internal SEO) */}
        <Reveal className="mt-10 sm:mt-16 border-t border-border pt-8">
          <p className="text-sm text-muted">Other industries:</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {LISTED.filter((i) => i.id !== ind.id).map((i) => (
              <Link key={i.id} href={`/industries/${slugFor(i.id)}`} className="rounded-full border border-border px-3 py-1.5 text-sm text-muted transition hover:border-brand/50 hover:text-fg">
                {i.label}
              </Link>
            ))}
          </div>
        </Reveal>
      </main>

      <StickyCTA />
      <Footer />
    </div>
  );
}
