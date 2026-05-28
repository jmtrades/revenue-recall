import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between border-r border-border bg-surface p-12 lg:flex">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-sm font-bold text-white">RR</span>
          <span className="font-semibold text-fg">Revenue Recall</span>
        </Link>
        <div>
          <h1 className="text-3xl font-semibold leading-tight text-fg">The sales OS that recovers the revenue you&apos;re about to lose.</h1>
          <p className="mt-4 max-w-md text-muted">Works with any CRM — or none at all — and adapts to any industry. Pipeline, sequences, automations, and a recall engine that never lets a deal go cold.</p>
        </div>
        <div className="flex gap-6 text-sm text-muted">
          <span>↺ Revenue Recall</span>
          <span>▤ Any pipeline</span>
          <span>⚡ Automations</span>
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
