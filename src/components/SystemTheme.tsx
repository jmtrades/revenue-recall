"use client";

import { useEffect } from "react";

/**
 * Resolves "system" appearance mode against the OS on the client and writes the
 * concrete theme onto the app shell (#app-shell). Rendered only when the org's
 * mode is "system"; explicit dark/light are server-rendered with no flash.
 */
export function SystemTheme() {
  useEffect(() => {
    const el = document.getElementById("app-shell");
    if (!el || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => el.setAttribute("data-theme", mq.matches ? "light" : "dark");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return null;
}
