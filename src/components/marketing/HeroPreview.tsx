"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

const RECALL = [
  { name: "Northwind — Renewal", reason: "Going cold", value: "$24K", score: 92, tone: "bg-warn" },
  { name: "Cedar Realty — Listing", reason: "Winnable loss", value: "$18K", score: 81, tone: "bg-brand" },
  { name: "Vertex Group — Expansion", reason: "Stalled", value: "$31K", score: 76, tone: "bg-danger" },
  { name: "Harborline — New deal", reason: "Untouched", value: "$9K", score: 64, tone: "bg-muted" },
];

const EASE = [0.23, 1, 0.32, 1] as const;
const RECOVERABLE = 82_400;

/** Count up to `target` over `ms` once (eased). Honors reduced motion (jumps to target). */
function useCountUp(target: number, ms: number, run: boolean): number {
  // Initialize to the final value so SSR + no-JS render the real number; only
  // animate (from ~0) once mounted on the client.
  const [n, setN] = useState(target);
  const raf = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!run) {
      setN(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setN(Math.round(target * eased));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [target, ms, run]);
  return n;
}

export function HeroPreview() {
  const reduced = useReducedMotion();
  const recoverable = useCountUp(RECOVERABLE, 1400, !reduced);

  // The "autopilot" cursor walks the queue, marking each deal it's working — so
  // the panel reads as a live product, not a screenshot.
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setActive((a) => (a + 1) % RECALL.length), 1700);
    return () => clearInterval(id);
  }, [reduced]);

  return (
    // Double-bezel: a glass panel seated in a machined tray — reads as real hardware.
    <div className="bezel animate-float rounded-[1.5rem] p-2">
      <div className="overflow-hidden rounded-[1rem] border border-border bg-surface">
        {/* window chrome */}
        <div className="flex items-center gap-2 border-b border-border bg-surface-2/60 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-danger/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-warn/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
          <span className="ml-2 text-xs font-medium text-muted">Revenue Recall</span>
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-medium text-brand">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand/70" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand" />
            </span>
            Autopilot on
          </span>
        </div>

        <div className="space-y-4 p-5">
          {/* KPI row */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Recoverable", value: `$${recoverable.toLocaleString("en-US")}`, tone: "text-warn" },
              { label: "Weighted forecast", value: "$214K", tone: "text-fg" },
              { label: "Win rate", value: "41%", tone: "text-success" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border border-border bg-surface-2/50 p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted">{stat.label}</p>
                <p className={`mt-1 text-lg font-semibold tabular-nums ${stat.tone}`}>{stat.value}</p>
              </div>
            ))}
          </div>

          {/* recall list */}
          <div className="rounded-xl border border-border bg-surface-2/30 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-fg">Revenue Recall queue</span>
              <span className="pill bg-brand-soft text-brand">4 at risk</span>
            </div>
            <motion.div
              className="space-y-1.5"
              initial={reduced ? false : "hidden"}
              animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1, delayChildren: 0.15 } } }}
            >
              {RECALL.map((r, i) => {
                const isActive = !reduced && i === active;
                return (
                  <motion.div
                    key={r.name}
                    variants={{ hidden: { opacity: 0, x: 12 }, show: { opacity: 1, x: 0, transition: { duration: 0.45, ease: EASE } } }}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors duration-500 ${isActive ? "border-brand/50 bg-brand/[0.06]" : "border-border/60 bg-surface"}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${r.tone}`} />
                      <span className="tabular-nums text-xs text-fg">{r.score}</span>
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-fg">{r.name}</span>
                    <span className="hidden text-[11px] text-muted sm:inline">{r.reason}</span>
                    <span className="text-sm font-medium tabular-nums text-brand">{r.value}</span>
                    {isActive ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-brand/15 px-2 py-0.5 text-[10px] font-medium text-brand">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand/70" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand" />
                        </span>
                        Working
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-0.5 text-[10px] font-medium text-muted">
                        <span className="h-1.5 w-1.5 rounded-full bg-muted/50" /> Queued
                      </span>
                    )}
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
