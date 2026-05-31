/**
 * Shared HTTP resilience for CRM adapters. External CRM APIs throttle (HTTP 429)
 * and have transient 5xx blips; a single fetch that gives up on the first 429
 * makes an integration flaky in production. fetchWithRetry retries idempotent
 * failures with exponential backoff, honoring a server-provided Retry-After.
 *
 * `sleep` is injectable so the behavior is unit-testable without real delays.
 */

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export interface RetryOptions {
  /** Max retries after the first attempt (so total attempts = retries + 1). */
  retries?: number;
  /** Base backoff in ms (doubled each attempt). */
  baseMs?: number;
  /** Cap on any single backoff wait. */
  maxMs?: number;
  /** Per-attempt timeout in ms. A hung connection is aborted and (if attempts
   *  remain) retried, so one unresponsive endpoint can't block the request
   *  until the serverless platform kills the whole function. 0 disables it. */
  timeoutMs?: number;
  /** Injectable delay (tests pass a no-op/recorder). */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Parse a Retry-After header (delta-seconds or an HTTP date) into ms. */
export function retryAfterMs(value: string | null, now: number = Date.now()): number | undefined {
  if (!value) return undefined;
  const secs = Number(value);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const when = Date.parse(value);
  return Number.isNaN(when) ? undefined : Math.max(0, when - now);
}

/** Exponential backoff with full jitter, capped. */
export function backoffMs(attempt: number, baseMs: number, maxMs: number): number {
  const ceiling = Math.min(maxMs, baseMs * 2 ** attempt);
  return Math.floor(Math.random() * ceiling);
}

/**
 * fetch() with retry on 429/5xx and network errors. Returns the final Response
 * (the caller still checks res.ok and formats its own error); only retryable
 * failures are retried, so 4xx like 400/401/404 return immediately.
 */
export async function fetchWithRetry(input: string, init?: RequestInit, opts: RetryOptions = {}): Promise<Response> {
  const retries = opts.retries ?? 3;
  const baseMs = opts.baseMs ?? 400;
  const maxMs = opts.maxMs ?? 8000;
  const timeoutMs = opts.timeoutMs ?? 15000;
  const sleep = opts.sleep ?? defaultSleep;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    // Abort a hung request after timeoutMs. We compose with any caller-supplied
    // signal so an upstream cancel still works.
    const controller = timeoutMs > 0 ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const res = await fetch(input, controller ? { ...init, signal: controller.signal } : init);
      if (RETRYABLE_STATUS.has(res.status) && attempt < retries) {
        const wait = retryAfterMs(res.headers.get("retry-after")) ?? backoffMs(attempt, baseMs, maxMs);
        await sleep(wait);
        continue;
      }
      return res;
    } catch (err) {
      // Network-level failure or a timeout abort — retry if we can.
      lastError = err;
      if (attempt >= retries) break;
      await sleep(backoffMs(attempt, baseMs, maxMs));
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("fetchWithRetry: request failed");
}
