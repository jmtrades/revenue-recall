/**
 * Minimal structured logger. Emits one JSON line per event so production logs
 * are greppable/queryable (and ready to ship to Sentry/Datadog later) instead of
 * the ad-hoc console.error scattering we had before. Keys that look secret are
 * redacted defensively so a careless field never leaks a token.
 */

type Level = "info" | "warn" | "error";

const REDACT = /(token|secret|password|authorization|api[_-]?key|cookie|bearer)/i;

function sanitize(fields?: Record<string, unknown>): Record<string, unknown> {
  if (!fields) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = REDACT.test(k) ? "[redacted]" : v;
  return out;
}

function emit(level: Level, event: string, fields?: Record<string, unknown>): void {
  let line: string;
  try {
    line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...sanitize(fields) });
  } catch {
    line = JSON.stringify({ ts: new Date().toISOString(), level, event });
  }
  // eslint-disable-next-line no-console
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
}

export function logInfo(event: string, fields?: Record<string, unknown>): void {
  emit("info", event, fields);
}
export function logWarn(event: string, fields?: Record<string, unknown>): void {
  emit("warn", event, fields);
}
export function logError(event: string, fields?: Record<string, unknown>): void {
  emit("error", event, fields);
}

/** Normalize an unknown thrown value to a safe, loggable message. */
export function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
