"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ScrollProgress } from "@/components/motion/ScrollProgress";
import { LogoBadge } from "@/components/Logo";
import { MobileMenu } from "@/components/marketing/MobileMenu";

function ArrowRight({ className = "" }: { className?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

// Landing in-page sections, in the order they appear down the page — so the
// scroll-spy highlight moves smoothly top-to-bottom.
const NAV_LINKS = [
  { id: "features", label: "Features" },
  { id: "how", label: "How it works" },
  { id: "industries", label: "Industries" },
  { id: "who", label: "Who it’s for" },
  { id: "integrations", label: "Integrations" },
  { id: "pricing", label: "Pricing" },
] as const;

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

  // Scroll-spy: highlight whichever section is crossing the viewport's vertical
  // centre. The -50%/-50% rootMargin collapses the observer root to a centre
  // line, so exactly one section is "intersecting" at a time. No-op off the
  // landing page (these section ids don't exist there).
  const [activeId, setActiveId] = useState<string | null>(null);
  useEffect(() => {
    const sections = NAV_LINKS.map((l) => document.getElementById(l.id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (sections.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setActiveId(entry.target.id);
      },
      { rootMargin: "-50% 0px -50% 0px", threshold: 0 },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
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
          <LogoBadge box={32} className="transition-transform duration-200 ease-out group-hover:scale-105" />
          <span className="font-display text-[15px] font-semibold tracking-tight text-fg">Revenue Recall</span>
        </Link>
        <nav className="hidden items-center gap-7 text-sm font-medium text-muted lg:flex">
          {NAV_LINKS.map((l) => {
            const active = activeId === l.id;
            return (
              <a
                key={l.id}
                href={`/#${l.id}`}
                aria-current={active ? "true" : undefined}
                className={`relative transition-colors hover:text-fg ${active ? "text-fg" : ""}`}
              >
                {l.label}
                <span
                  aria-hidden="true"
                  className={`absolute -bottom-1.5 left-0 h-px w-full origin-left bg-brand transition-transform duration-300 ease-out motion-reduce:transition-none ${active ? "scale-x-100" : "scale-x-0"}`}
                />
              </a>
            );
          })}
        </nav>
        <div className="flex items-center gap-1.5">
          <Link href="/login" className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted transition-colors hover:text-fg sm:block">Sign in</Link>
          <Link
            href="/signup"
            className="cta group inline-flex items-center gap-2 rounded-full bg-brand-strong py-1.5 pl-4 pr-1.5 text-sm font-semibold text-white hover:bg-brand-strong/90"
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
