"use client";

import { useEffect } from "react";

/**
 * Warn before the tab closes / reloads while a form holds unsaved edits — the
 * browser-native confirm dialog, gated on `dirty`. (In-app navigation isn't
 * interceptable in the App Router; the disabled-until-dirty Save button plus
 * this unload guard covers the destructive cases: closing the tab, hitting
 * reload, or following an external link.)
 */
export function useUnsavedChangesWarning(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Chrome requires returnValue to be set for the prompt to appear.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}
