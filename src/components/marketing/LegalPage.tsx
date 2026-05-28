import { MarketingNav } from "@/components/marketing/MarketingNav";
import { Footer } from "@/components/marketing/Footer";

export interface LegalSection {
  heading: string;
  body: string[];
}

export function LegalPage({ title, updated, intro, sections }: { title: string; updated: string; intro: string; sections: LegalSection[] }) {
  return (
    <div className="min-h-screen">
      <MarketingNav />
      <article className="mx-auto max-w-3xl px-5 py-16 lg:py-24">
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>
        <p className="mt-2 text-xs uppercase tracking-wider text-muted">Last updated {updated}</p>
        <p className="mt-6 text-lg leading-relaxed text-muted">{intro}</p>
        <div className="mt-10 space-y-8">
          {sections.map((s) => (
            <section key={s.heading}>
              <h2 className="text-lg font-semibold text-white">{s.heading}</h2>
              {s.body.map((p, i) => (
                <p key={i} className="mt-3 text-sm leading-relaxed text-muted">
                  {p}
                </p>
              ))}
            </section>
          ))}
        </div>
        <p className="mt-12 text-sm text-muted">
          Questions about this page? Email{" "}
          <a href="mailto:legal@revenuerecall.com" className="text-brand transition hover:text-white">
            legal@revenuerecall.com
          </a>
          .
        </p>
      </article>
      <Footer />
    </div>
  );
}
