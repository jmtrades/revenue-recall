import { logError } from "@/lib/log";

/**
 * Operational alerting. When the autonomous engine hits a problem the operator
 * can't otherwise see — a per-tenant cron sub-request failing, a cadence/digest
 * error — we notify them. An autonomous outbound system must not fail silently.
 *
 * Always writes a structured server error log; additionally POSTs a compact JSON
 * alert to ALERT_WEBHOOK_URL (point it at Slack/PagerDuty/your endpoint) when set.
 * Best-effort and never throws — alerting must not break the path it reports on.
 * The URL is operator-configured (not user input), so no SSRF surface.
 */
export async function sendAlert(event: string, detail: Record<string, unknown>): Promise<void> {
  logError(`alert.${event}`, detail);
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;
  const payload = { event, detail, at: new Date().toISOString(), app: process.env.NEXT_PUBLIC_SITE_URL ?? null };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: ctrl.signal });
  } catch {
    /* swallow — never let alerting throw */
  } finally {
    clearTimeout(timer);
  }
}

/** True when a best-effort engine result carries an error (the catch handlers in
 *  the cron return `{ error }` instead of throwing). */
export function isErrored(result: unknown): result is { error: string } {
  return Boolean(result && typeof result === "object" && "error" in result);
}
