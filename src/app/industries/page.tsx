import type { Metadata } from "next";
import Link from "next/link";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { Footer } from "@/components/marketing/Footer";
import { StickyCTA } from "@/components/marketing/StickyCTA";
import { INDUSTRIES } from "@/lib/industries";
import { Stagger, StaggerItem } from "@/components/motion/Motion";

export const dynamic = "force-static";

const slugFor = (id: string) => id.replace(/_/g, "-");
const LISTED = INDUSTRIES.filter((i) => i.id !== "generic");

export const metadata: Metadata = {
  title: "Industries — sales automation tuned to how you sell | Revenue Recall",
  description: "Revenue Recall ships with industry-specific pipelines, terminology, objections, and follow-up plays for real estate, mortgage, insurance, SaaS, agencies, automotive, and home services.",
  alternates: { canonical: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.recall-touch.com"}/industries` },
};

export default function IndustriesIndex() {
  return (
    <div className="min-h-screen bg-bg">
      <MarketingNav />
      <main className="mx-auto max-w-5xl px-6 py-16">
        <span className="eyebrow-editorial text-brand">Built for your world</span>
        <h1 className="mt-3 font-editorial text-4xl font-semibold tracking-tight text-fg sm:text-5xl">Sales automation tuned to how your industry actually sells.</h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
          Not a generic CRM with your logo on it. Revenue Recall ships with the pipeline, terminology, objections, and
          follow-up plays that match your world — then runs the whole motion across email, SMS, and the phone.
        </p>
        <Stagger className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {LISTED.map((ind) => (
            <StaggerItem key={ind.id} className="h-full">
              <Link href={`/industries/${slugFor(ind.id)}`} className="group flex h-full flex-col rounded-2xl border border-border bg-surface p-6 transition hover:border-brand/50">
                <h2 className="font-semibold text-fg group-hover:text-brand">{ind.label}</h2>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{ind.blurb}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand">Explore <span aria-hidden>→</span></span>
              </Link>
            </StaggerItem>
          ))}
        </Stagger>
      </main>
      <StickyCTA />
      <Footer />
    </div>
  );
}
