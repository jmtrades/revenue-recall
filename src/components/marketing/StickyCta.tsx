"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function StickyCta() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 800);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-border bg-bg/90 p-3 backdrop-blur-xl transition-transform duration-300 md:hidden ${show ? "translate-y-0" : "translate-y-full"}`}
    >
      <Link
        href="/signup"
        className="block rounded-xl bg-brand px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-brand/90"
      >
        Start free — no card
      </Link>
    </div>
  );
}
