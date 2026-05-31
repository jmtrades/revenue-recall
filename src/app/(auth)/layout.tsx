import Link from "next/link";
import { Icon } from "@/components/icons";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between border-r border-border bg-surface p-12 lg:flex">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-brand text-sm font-bold tracking-tight text-white shadow-[inset_0_1px_0_0_rgb(255_255_255/0.45)] ring-1 ring-inset ring-white/10">RR</span>
          <span className="font-display text-[15px] font-semibold tracking-tight text-fg">Revenue Recall</span>
        </Link>
        <div>
          <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight text-fg">Autonomous outbound that recovers the revenue you&apos;re about to lose.</h1>
          <p className="mt-4 max-w-md text-muted">Works with any CRM — or none at all — and adapts to any industry. Pipeline, sequences, automations, and a recall engine that never lets a deal go cold.</p>
        </div>
        <div className="flex gap-6 text-sm text-muted">
          <span className="inline-flex items-center gap-1.5"><Icon name="recall" size={14} /> Revenue Recall</span>
          <span className="inline-flex items-center gap-1.5"><Icon name="pipeline" size={14} /> Any pipeline</span>
          <span className="inline-flex items-center gap-1.5"><Icon name="automations" size={14} /> Automations</span>
        </div>
      </div>
      <div className="relative flex flex-col px-6 pb-10 pt-14 sm:justify-center sm:py-6">
        {/* Subtle brand glow so the mobile screen has depth, not a flat void. */}
        <div className="hero-glow pointer-events-none absolute inset-x-0 top-0 h-64 lg:hidden" aria-hidden />
        {/* Mobile-only brand mark (the left panel is hidden under lg). */}
        <Link href="/" className="relative mb-9 flex items-center gap-2.5 lg:hidden">
          <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-brand text-sm font-bold tracking-tight text-white shadow-[inset_0_1px_0_0_rgb(255_255_255/0.45)] ring-1 ring-inset ring-white/10">RR</span>
          <span className="font-display text-[15px] font-semibold tracking-tight text-fg">Revenue Recall</span>
        </Link>
        <div className="relative mx-auto w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
