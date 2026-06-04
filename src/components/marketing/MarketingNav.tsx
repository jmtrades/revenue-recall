import Link from "next/link";

function ArrowRight({ className = "" }: { className?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export function MarketingNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-brand text-[13px] font-bold tracking-tight text-white shadow-[inset_0_1px_0_0_rgb(255_255_255/0.45)] ring-1 ring-inset ring-white/10">
            RR
          </span>
          <span className="font-display text-[15px] font-semibold tracking-tight text-fg">Revenue Recall</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm font-medium text-muted lg:flex">
          <a href="#features" className="transition-colors hover:text-fg">Features</a>
          <a href="#how" className="transition-colors hover:text-fg">How it works</a>
          <a href="#industries" className="transition-colors hover:text-fg">Industries</a>
          <a href="#integrations" className="transition-colors hover:text-fg">Integrations</a>
          <a href="#who" className="transition-colors hover:text-fg">Who it&rsquo;s for</a>
          <a href="#pricing" className="transition-colors hover:text-fg">Pricing</a>
        </nav>
        <div className="flex items-center gap-1.5">
          <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-fg">Sign in</Link>
          <Link
            href="/signup"
            className="cta group inline-flex items-center gap-2 rounded-full bg-brand py-1.5 pl-4 pr-1.5 text-sm font-semibold text-white hover:bg-brand/90"
          >
            Start free
            <span className="grid h-6 w-6 place-items-center rounded-full bg-white/20 transition-transform duration-200 ease-out group-hover:translate-x-0.5">
              <ArrowRight />
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}
