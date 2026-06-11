import Link from "next/link";

// Support address — overridable per deploy; buyers expect a visible way to reach
// a human before they'll trust (and pay for) the product.
const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@recall-touch.com";

const COLS: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: "Product",
    links: [
      { label: "Revenue Recall", href: "/#features" },
      { label: "Power Dialer", href: "/#features" },
      { label: "Automations", href: "/#features" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    heading: "Industries",
    links: [
      { label: "Real Estate", href: "/industries/real-estate" },
      { label: "Mortgage & Lending", href: "/industries/mortgage" },
      { label: "Insurance", href: "/industries/insurance" },
      { label: "SaaS", href: "/industries/saas" },
      { label: "All industries", href: "/industries" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "Sign in", href: "/login" },
      { label: "Start free", href: "/signup" },
      { label: "Try it free", href: "/signup" },
      { label: "Contact support", href: `mailto:${SUPPORT_EMAIL}` },
    ],
  },
  {
    heading: "Developers",
    links: [
      { label: "API & integrations", href: "/docs/api" },
      { label: "Lead Capture API", href: "/docs/api#create" },
      { label: "Webhooks", href: "/docs/api#webhooks" },
      { label: "Embeddable form", href: "/docs/api#form" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-surface/40">
      <div className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-3 lg:grid-cols-5">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-brand text-[13px] font-bold tracking-tight text-white shadow-[inset_0_1px_0_0_rgb(255_255_255/0.45)] ring-1 ring-inset ring-white/10">RR</span>
              <span className="font-display text-[15px] font-semibold tracking-tight text-fg">Revenue Recall</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-muted">Autonomous outbound that recovers the revenue you&apos;re about to lose — for any CRM, any industry.</p>
            {/* Links to /status, which renders live system state — the claim is checkable, not decorative. */}
            <Link href="/status" className="mt-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-muted transition hover:text-fg">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand/70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand" />
              </span>
              All systems operational
            </Link>
          </div>
          {COLS.map((col) => (
            <div key={col.heading}>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted/70">{col.heading}</p>
              <ul className="mt-3 space-y-2">
                {col.links.map((l) => (
                  <li key={l.label}>
                    {l.href.startsWith("mailto:") ? (
                      <a href={l.href} className="text-sm text-muted transition hover:text-fg">{l.label}</a>
                    ) : (
                      <Link href={l.href} className="text-sm text-muted transition hover:text-fg">{l.label}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-xs text-muted sm:flex-row">
          <span>© {new Date().getFullYear()} Revenue Recall. All rights reserved.</span>
          <span className="flex gap-5">
            <a href={`mailto:${SUPPORT_EMAIL}`} className="transition hover:text-fg">Support</a>
            <Link href="/privacy" className="transition hover:text-fg">Privacy</Link>
            <Link href="/terms" className="transition hover:text-fg">Terms</Link>
            <Link href="/security" className="transition hover:text-fg">Security</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
