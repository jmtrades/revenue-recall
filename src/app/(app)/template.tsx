import type { ReactNode } from "react";

/**
 * Per-navigation entrance for the signed-in app. A template re-mounts on every
 * route change (unlike a layout). The entrance is CSS, not a JS animation that
 * starts at opacity 0: if the animation never ticks, the page is still visible.
 * Reduced motion is handled in globals.css.
 */
export default function AppTemplate({ children }: { children: ReactNode }) {
  return <div className="page-in">{children}</div>;
}
