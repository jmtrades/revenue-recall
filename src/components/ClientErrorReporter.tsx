"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/client-error";

/**
 * Mounts the global browser-error listeners (uncaught errors + unhandled
 * promise rejections) once, app-wide — marketing pages included, where the
 * logged-out voice demo runs. Renders nothing. Error boundaries report
 * render crashes; this catches everything boundaries can't see.
 */
export function ClientErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      reportClientError({ message: e.message || "Unknown error", stack: e.error?.stack, source: "window" });
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason as { message?: string; stack?: string } | undefined;
      reportClientError({ message: r?.message || String(e.reason ?? "Unhandled rejection"), stack: r?.stack, source: "rejection" });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
