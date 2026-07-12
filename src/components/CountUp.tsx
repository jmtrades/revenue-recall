"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

/**
 * Animates the numeric part of an already-formatted stat ("$214,300", "$1.2M",
 * "41%", "7") from 0 to its value once on mount — the same liveness the
 * marketing hero has, brought inside the product.
 *
 * Robustness: SSR, no-JS, reduced-motion, and any unparseable string all render
 * the exact final text (state initializes to the target; animation only starts
 * client-side). Grouping and decimal places mirror the original so the width
 * barely shifts while counting.
 */
export function CountUp({ value, className }: { value: string; className?: string }) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const raf = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (reduced) {
      setDisplay(value);
      return;
    }
    // [prefix][number][suffix] — e.g. "$" "1,234.5" "M". Bail to static text on
    // anything that doesn't contain a number.
    const m = value.match(/-?[\d,]+(?:\.\d+)?/);
    if (!m || m.index === undefined) {
      setDisplay(value);
      return;
    }
    const prefix = value.slice(0, m.index);
    const suffix = value.slice(m.index + m[0].length);
    const target = parseFloat(m[0].replace(/,/g, ""));
    if (!Number.isFinite(target)) {
      setDisplay(value);
      return;
    }
    const decimals = (m[0].split(".")[1] ?? "").length;
    const grouped = m[0].includes(",");
    const fmt = (v: number) =>
      grouped || decimals > 0
        ? v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
        : String(Math.round(v));

    const ms = 900;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(`${prefix}${fmt(target * eased)}${suffix}`);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, reduced]);

  return <span className={className}>{display}</span>;
}
