import { MarketingNav } from "@/components/marketing/MarketingNav";
import { Footer } from "@/components/marketing/Footer";

export function LegalLayout({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <MarketingNav />
      <article className="mx-auto max-w-3xl px-5 py-16">
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-muted">Last updated: {updated}</p>
        <div className="mt-4 rounded-lg border border-warn/40 bg-warn/10 px-4 py-3 text-xs text-warn">
          Template for launch — have your legal counsel review and adapt this before relying on it.
        </div>
        <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-white [&_a]:text-brand [&_a:hover]:underline">
          {children}
        </div>
      </article>
      <Footer />
    </div>
  );
}
