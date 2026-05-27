import { MarketingNav } from "@/components/marketing/MarketingNav";
import { Footer } from "@/components/marketing/Footer";
import { ContactForm } from "@/components/marketing/ContactForm";

export const metadata = {
  title: "Contact",
  description: "Talk to the Revenue Recall team — sales, support, or security. Or request a callback.",
};

const CHANNELS = [
  { label: "Sales", email: "sales@revenue-recall.app", note: "Demos, pricing, and Enterprise plans." },
  { label: "Support", email: "support@revenue-recall.app", note: "Help with your account or workspace." },
  { label: "Security", email: "security@revenue-recall.app", note: "Report a vulnerability or request a review." },
];

export default function ContactPage() {
  return (
    <div className="min-h-screen">
      <MarketingNav />
      <section className="hero-glow relative overflow-hidden border-b border-border">
        <div className="surface-grid absolute inset-0 opacity-30" />
        <div className="relative mx-auto max-w-3xl px-5 py-20 text-center">
          <span className="pill border border-border bg-surface/60 text-muted">Contact</span>
          <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight text-white sm:text-5xl">
            Let&apos;s <span className="gradient-text">talk.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-muted">
            Questions about fit, pricing, or rolling this out to your team? Leave your email and we&apos;ll reach out — or
            message us directly.
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-10 px-5 py-16 md:grid-cols-2">
        <div>
          <h2 className="text-lg font-semibold text-white">Reach us directly</h2>
          <div className="mt-4 space-y-3">
            {CHANNELS.map((c) => (
              <div key={c.label} className="rounded-xl border border-border bg-surface p-4">
                <p className="text-sm font-medium text-white">{c.label}</p>
                <a href={`mailto:${c.email}`} className="text-sm text-brand hover:underline">{c.email}</a>
                <p className="mt-1 text-xs text-muted">{c.note}</p>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">Request a callback</h2>
          <div className="mt-4">
            <ContactForm />
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
