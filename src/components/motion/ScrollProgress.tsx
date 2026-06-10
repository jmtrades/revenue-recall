"use client";

import { motion, useScroll, useSpring, useReducedMotion } from "motion/react";

/** Hairline page-scroll progress bar pinned under the marketing nav. */
export function ScrollProgress() {
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 160, damping: 28, restDelta: 0.001 });
  if (reduced) return null;
  return (
    <motion.div
      aria-hidden
      className="absolute inset-x-0 bottom-0 h-px origin-left bg-brand/70"
      style={{ scaleX }}
    />
  );
}
