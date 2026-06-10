"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ScrollProgress } from "@/components/motion/ScrollProgress";
import { MobileMenu } from "@/components/marketing/MobileMenu";

function ArrowRight({ className = "" }: { className?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export function MarketingNav() {
  // Scroll-aware chrome: airy and near-transparent over the hero, condensing to a
  // blurred, bordered bar with a soft shadow once the page scrolls — the premium
  // sticky-nav treatment every top site uses.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 border-b transition-[background-color,border-color,box-shadow] duration-300 ${
        scrolled
          ? "border-border/60 bg-bg/80 shadow-[0_1px_0_0_rgb(255_255_255/0.03),0_10px_30px_-22px_rgb(0_0_0/0.8)] backdrop-blur-xl"
          : "border-transparent bg-bg/30 backdrop-blur-md"
      }`}
    >
      <ScrollProgress />
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-brand text-[13px] font-bold tracking-tight text-white shadow-[inset_0_1px_0_0_rgb(255_255_255/0.45)] ring-1 ring-inset ring-white/10 transition-transform duration-200 ease-out group-hover:scale-105">
            RR
          </span>
          <span className="font-display text-[15px] font-semibold tracking-tight text-fg">Revenue Recall</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm font-medium text-muted lg:flex">
          <a href="/#features" className="transition-colors hover:text-fg">Features</a>
          <a href="/#how" className="transition-colors hover:text-fg">How it works</a>
          <a href="/#industries" className="transition-colors hover:text-fg">Industries</a>
          <a href="/#integrations" className="transition-colors hover:text-fg">Integrations</a>
          <a href="/#who" className="transition-colors hover:text-fg">Who it&rsquo;s for</a>
          <a href="/#pricing" className="transition-colors hover:text-fg">Pricing</a>
        </nav>
        <div className="flex items-center gap-1.5">
          <Link href="/login" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-fg sm:block">Sign in</Link>
          <Link
            href="/signup"
            className="cta group inline-flex items-center gap-2 rounded-full bg-brand py-1.5 pl-4 pr-1.5 text-sm font-semibold text-white hover:bg-brand/90"
          >
            Start free
            <span className="grid h-6 w-6 place-items-center rounded-full bg-white/20 transition-transform duration-200 ease-out group-hover:translate-x-0.5">
              <ArrowRight />
            </span>
          </Link>
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
