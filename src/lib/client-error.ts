/**
 * Browser-side error reporting — client-safe, no server imports. Errors that
 * happen in the user's browser (a crashed component, a rejected promise in the
 * voice engine, a failed dynamic import) previously died in THEIR console; the
 * operator never knew. This ships them to /api/client-error, which folds them
 * into the same structured-log + alert-webhook pipeline server errors use.
 *
 * Discipline (it must never make things worse):
 * - production only — dev noise stays in the console where it belongs
 * - deduped per message and capped per page lifetime, so a render loop or a
 *   misbehaving extension can't generate traffic storms
 * - fire-and-forget via sendBeacon (survives unload), fetch keepalive fallback
 * - never throws
 */

const seen = new Set<string>();
let budget = 5; // max reports per page lifetime

export interface ClientErrorReport {
  message: string;
  stack?: string;
  source?: string; // "boundary" | "window" | "rejection"
  digest?: string; // Next's server-action/RSC error digest, when present
}

export function reportClientError(report: ClientErrorReport): void {
  try {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV !== "production") return;
    const message = String(report.message ?? "").slice(0, 300);
    if (!message || seen.has(message) || budget <= 0) return;
    seen.add(message);
    budget -= 1;

    const body = JSON.stringify({
      message,
      stack: report.stack ? String(report.stack).slice(0, 2000) : undefined,
      source: report.source ?? "window",
      digest: report.digest ? String(report.digest).slice(0, 64) : undefined,
      url: window.location.pathname.slice(0, 200),
    });

    if (navigator.sendBeacon?.("/api/client-error", new Blob([body], { type: "application/json" }))) return;
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* reporting must never throw into the page */
  }
}
