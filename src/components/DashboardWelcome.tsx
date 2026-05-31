import Link from "next/link";
import { Card, Button } from "@/components/ui";
import { Icon, type IconName } from "@/components/icons";

/**
 * First-run experience. A brand-new workspace has no deals yet, so the metric
 * grid, charts, and leaderboard would all render as zeros — which reads as
 * broken, not premium. Instead we greet the user and point them at the three
 * ways to get real data flowing in under two minutes.
 */
const STEPS: { icon: IconName; title: string; body: string; href: string; cta: string }[] = [
  {
    icon: "upload",
    title: "Import your leads",
    body: "Drop in a CSV from any source — columns are auto-mapped and duplicates are skipped. Your pipeline fills instantly.",
    href: "/settings?tab=import",
    cta: "Import a CSV",
  },
  {
    icon: "database",
    title: "Connect your data",
    body: "Already on a CRM, a spreadsheet, or a database? Connect it and Revenue Recall runs on top — no migration.",
    href: "/settings?tab=integrations",
    cta: "Connect a source",
  },
  {
    icon: "plus",
    title: "Add your first deal",
    body: "Prefer to start clean? Create a contact and an opportunity by hand and start working it right away.",
    href: "/leads",
    cta: "Create a lead",
  },
];

export function DashboardWelcome({ greeting }: { greeting: string }) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-gradient-to-br from-brand-soft/40 to-surface px-7 py-9">
        <span className="eyebrow text-brand">Welcome</span>
        <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight text-fg sm:text-3xl">{greeting} — let&rsquo;s get your pipeline working.</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
          Revenue Recall is ready. Bring in your deals and it starts surfacing the revenue you&rsquo;re losing, drafts
          outreach in your voice, and works every deal around the clock. Pick a way to start:
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {STEPS.map((s) => (
          <Card key={s.title} className="flex h-full flex-col">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-soft text-brand ring-1 ring-inset ring-brand/20">
              <Icon name={s.icon} size={20} />
            </span>
            <h2 className="mt-4 text-base font-semibold text-fg">{s.title}</h2>
            <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted">{s.body}</p>
            <div className="mt-5">
              <Button href={s.href} variant="outline" size="sm">{s.cta}</Button>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-fg">Teach it your voice while you&rsquo;re here</h2>
            <p className="mt-1 text-sm text-muted">Two minutes now means every email, text, and call sounds like you — not a bot.</p>
          </div>
          <Link href="/settings?tab=voice" className="shrink-0 text-sm font-medium text-brand hover:underline">Set up your voice →</Link>
        </div>
      </Card>
    </div>
  );
}
