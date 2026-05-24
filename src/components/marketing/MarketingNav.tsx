import Link from "next/link";

export function MarketingNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm font-bold text-white">RR</span>
          <span className="font-semibold text-white">Revenue Recall</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm text-muted md:flex">
          <a href="#features" className="transition hover:text-white">Features</a>
          <a href="#how" className="transition hover:text-white">How it works</a>
          <a href="#industries" className="transition hover:text-white">Industries</a>
          <a href="#roi" className="transition hover:text-white">ROI</a>
          <a href="#pricing" className="transition hover:text-white">Pricing</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="rounded-lg px-3 py-2 text-sm text-muted transition hover:text-white">Sign in</Link>
          <Link href="/signup" className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand/90">
            Start free
          </Link>
        </div>
      </div>
    </header>
  );
}
