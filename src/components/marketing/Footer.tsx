import Link from "next/link";

const COLS: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: "Product",
    links: [
      { label: "Revenue Recall", href: "#features" },
      { label: "Power Dialer", href: "#features" },
      { label: "Automations", href: "#features" },
      { label: "Pricing", href: "#pricing" },
    ],
  },
  {
    heading: "Industries",
    links: [
      { label: "Real Estate", href: "#industries" },
      { label: "Mortgage & Lending", href: "#industries" },
      { label: "Insurance", href: "#industries" },
      { label: "SaaS & Agencies", href: "#industries" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "Sign in", href: "/login" },
      { label: "Start free", href: "/signup" },
      { label: "Live demo", href: "/dashboard" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-border bg-surface/40">
      <div className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm font-bold text-white">RR</span>
              <span className="font-semibold text-fg">Revenue Recall</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-muted">The universal sales OS that recovers the revenue you&apos;re about to lose — for any CRM, any industry.</p>
          </div>
          {COLS.map((col) => (
            <div key={col.heading}>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted/70">{col.heading}</p>
              <ul className="mt-3 space-y-2">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link href={l.href} className="text-sm text-muted transition hover:text-fg">{l.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-xs text-muted sm:flex-row">
          <span>© {new Date().getFullYear()} Revenue Recall. All rights reserved.</span>
          <span className="flex gap-5">
            <Link href="/privacy" className="transition hover:text-fg">Privacy</Link>
            <Link href="/terms" className="transition hover:text-fg">Terms</Link>
            <Link href="/security" className="transition hover:text-fg">Security</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
