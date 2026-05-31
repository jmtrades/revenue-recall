"use client";

import { useEffect } from "react";

/**
 * Close-on-Escape for menus, popovers, and dialogs. When `active`, pressing
 * Escape calls `onEscape`. Listener is only attached while active, so it's cheap
 * and never fights other handlers when the surface is closed.
 */
export function useEscapeKey(active: boolean, onEscape: () => void): void {
  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [active, onEscape]);
}
