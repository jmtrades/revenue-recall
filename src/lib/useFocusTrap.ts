"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Focus management for an open modal / drawer. When `active` turns true the hook
 * remembers what was focused, moves focus into the container, and traps Tab /
 * Shift+Tab inside it; when it closes (or unmounts) focus returns to the element
 * that opened it. Pair with useEscapeKey + a backdrop click for a complete,
 * keyboard-accessible overlay. Attach the returned ref to the dialog container.
 */
export function useFocusTrap<T extends HTMLElement = HTMLElement>(active: boolean): RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    // The container must be focusable so focus has somewhere to land when the
    // dialog has no focusable children yet (e.g. while its content loads).
    if (!node.hasAttribute("tabindex")) node.tabIndex = -1;

    const focusables = (): HTMLElement[] => Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE));
    (focusables()[0] ?? node).focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        node.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (e.shiftKey) {
        if (current === first || !node.contains(current)) {
          e.preventDefault();
          last.focus();
        }
      } else if (current === last || !node.contains(current)) {
        e.preventDefault();
        first.focus();
      }
    };

    node.addEventListener("keydown", onKeyDown);
    return () => {
      node.removeEventListener("keydown", onKeyDown);
      // Return focus to whatever opened the overlay, if it's still around.
      if (previouslyFocused && document.contains(previouslyFocused)) previouslyFocused.focus();
    };
  }, [active]);
  return ref;
}
