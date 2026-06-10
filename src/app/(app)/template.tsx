"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/**
 * Per-navigation page transition for the whole app shell. A template re-mounts
 * on every route change (unlike a layout), so each page gets a short, consistent
 * fade-rise entrance — the app feels composed instead of snapping between
 * screens. Static under prefers-reduced-motion.
 */
export default function AppTemplate({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  if (reduced) return <>{children}</>;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
    >
      {children}
    </motion.div>
  );
}
