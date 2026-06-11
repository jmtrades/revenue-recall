import Link from "next/link";
import { LogoBadge } from "@/components/Logo";
import { Icon } from "@/components/icons";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hero-glow relative hidden flex-col justify-between overflow-hidden border-r border-border bg-surface p-12 lg:flex">
        {/* Blueprint texture + glow so the brand panel reads as crafted, not flat. */}
        <div className="surface-grid absolute inset-0 opacity-40" aria-hidden />
        <Link href="/" className="relative flex items-center gap-2.5 animate-fade-up">
          <LogoBadge box={36} />
          <span className="font-display text-[15px] font-semibold tracking-tight text-fg">Revenue Recall</span>
        </Link>
        <div className="relative">
          <h1 className="display-hero font-display text-[2.6rem] font-semibold leading-[1.06] tracking-tight animate-fade-up [animation-delay:80ms]">
            Autonomous outbound that recovers the revenue you&apos;re about to <span className="gradient-text">lose.</span>
          </h1>
          <p className="mt-5 max-w-md text-muted animate-fade-up [animation-delay:160ms]">
            Works with any CRM — or none at all — and adapts to any industry. Pipeline, sequences, automations, and a
            recall engine that never lets a deal go cold.
          </p>
          <ul className="mt-8 space-y-3 animate-fade-up [animation-delay:240ms]">
            {[
              "Live in 2 minutes — no credit card",
              "Email, SMS & the phone, in your voice",
              "Reports the revenue it put back on the board",
            ].map((t) => (
              <li key={t} className="flex items-center gap-2.5 text-sm text-body">
                <span className="grid h-[18px] w-[18px] flex-none place-items-center rounded-full bg-brand/15 text-brand">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative flex gap-6 text-sm text-muted animate-fade-up [animation-delay:320ms]">
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
          <LogoBadge box={36} />
          <span className="font-display text-[15px] font-semibold tracking-tight text-fg">Revenue Recall</span>
        </Link>
        <div className="relative mx-auto w-full max-w-sm animate-fade-up [animation-delay:120ms]">{children}</div>
      </div>
    </div>
  );
}
