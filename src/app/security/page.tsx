import Link from "next/link";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { Footer } from "@/components/marketing/Footer";

export const metadata = {
  title: "Security",
  description: "How Revenue Recall protects your data: encryption, tenant isolation, least-privilege access, and a clear compliance roadmap.",
};

const PRACTICES = [
  { title: "Encryption everywhere", body: "All traffic is served over TLS, and data is encrypted at rest in our managed Postgres (Supabase). Secrets live in environment configuration, never in the codebase." },
  { title: "Tenant isolation", body: "Every record is scoped to your organization. Data access is filtered by org on every query, with row-level security policies as defense in depth." },
  { title: "Least-privilege access", body: "Server-side keys are never exposed to the browser. Admin and webhook endpoints are protected with constant-time secret checks, and sensitive routes are rate-limited." },
  { title: "Payments handled by Stripe", body: "We never see or store full card numbers — payments are processed by Stripe, a PCI-DSS Level 1 provider. Webhooks are signature-verified." },
  { title: "Your data stays yours", body: "We don't sell your data, and your customer data is never used to train third-party foundation models. Export or delete your data at any time." },
  { title: "Resilient infrastructure", body: "We run on managed, automatically-backed-up infrastructure (Vercel + Supabase) with redundancy and monitoring built in." },
];

export default function SecurityPage() {
  return (
    <div className="min-h-screen">
      <MarketingNav />
      <section className="hero-glow relative overflow-hidden border-b border-border">
        <div className="surface-grid absolute inset-0 opacity-30" />
        <div className="relative mx-auto max-w-3xl px-5 py-20 text-center">
          <span className="pill border border-border bg-surface/60 text-muted">Trust &amp; Security</span>
          <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight text-white sm:text-5xl">
            Built to protect <span className="gradient-text">your pipeline.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted">
            Your revenue data is sensitive. Here&apos;s how we keep it safe — described plainly, without the security theater.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {PRACTICES.map((p) => (
            <div key={p.title} className="rounded-2xl border border-border bg-surface p-6">
              <h3 className="font-semibold text-white">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{p.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-border bg-surface p-7">
          <h2 className="text-lg font-semibold text-white">Compliance roadmap</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            We follow SOC 2-aligned practices today and are pursuing formal certification as we grow. Enterprise customers
            can request a security review, a Data Processing Agreement (DPA), and SSO as part of the Enterprise plan.
            Found something? Email <a href="mailto:security@revenue-recall.app" className="text-brand hover:underline">security@revenue-recall.app</a>.
          </p>
        </div>

        <div className="mt-10 text-center">
          <Link href="/contact" className="rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand/90">
            Request a security review
          </Link>
        </div>
      </section>
      <Footer />
    </div>
  );
}
