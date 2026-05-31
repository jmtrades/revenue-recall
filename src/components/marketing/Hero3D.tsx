"use client";

import dynamic from "next/dynamic";
import { HeroPreview } from "@/components/marketing/HeroPreview";

// The WebGL scene is client-only and lazy: it never blocks SSR or the initial
// bundle, and until it loads (or on a device without WebGL) the static product
// preview shows instead — so the hero is always populated, never blank.
const Hero3DScene = dynamic(() => import("@/components/marketing/Hero3DScene"), {
  ssr: false,
  loading: () => <HeroPreview />,
});

export function Hero3D() {
  return (
    <div className="relative overflow-hidden">
      {/* Radial brand glow behind the object for cinematic depth. */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-full w-full -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70 blur-3xl"
        style={{ background: "radial-gradient(circle at 50% 45%, rgba(22,201,141,0.28), rgba(22,201,141,0.06) 45%, transparent 70%)" }}
        aria-hidden
      />
      <div className="relative mx-auto aspect-square w-full max-w-[520px]">
        <Hero3DScene />
      </div>
    </div>
  );
}
