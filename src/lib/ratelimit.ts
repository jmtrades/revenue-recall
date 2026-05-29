/**
 * Best-effort in-memory rate limiter. A fixed-window counter per key (e.g. client
 * IP + route), kept in a process-local map. It's intentionally simple: it caps
 * abusive bursts against public endpoints without external infra, and degrades
 * safely (per-instance, resets on restart). For hard, cross-instance guarantees
 * a shared store (Redis/Upstash) implements the same `rateLimit` shape later.
 */

interface Window {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Window>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
}

/** Allow up to `limit` hits per `windowMs` for `key`. Pure-ish (uses a module map + clock). */
export function rateLimit(key: string, limit: number, windowMs: number, now: number = Date.now()): RateLimitResult {
  const w = buckets.get(key);
  if (!w || now >= w.resetAt) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { ok: true, remaining: limit - 1, resetAt };
  }
  w.count += 1;
  const remaining = Math.max(0, limit - w.count);
  return { ok: w.count <= limit, remaining, resetAt: w.resetAt };
}

/** Best-effort client key from a request (proxy headers, else a constant). */
export function clientKey(req: Request, scope: string): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = fwd || req.headers.get("x-real-ip") || "unknown";
  return `${scope}:${ip}`;
}

/**
 * Throttle a cost-incurring AI/voice endpoint per client. The monthly budget cap
 * protects total spend; this stops a single client from bursting (abuse / runaway
 * loops). Tune with AI_RATE_LIMIT_PER_MIN (default 30/min).
 */
export function aiRateLimit(req: Request, scope = "ai"): RateLimitResult {
  const perMin = Number(process.env.AI_RATE_LIMIT_PER_MIN);
  const limit = Number.isFinite(perMin) && perMin > 0 ? perMin : 30;
  return rateLimit(clientKey(req, scope), limit, 60_000);
}

/**
 * Throttle a state-mutating / send-triggering write endpoint per client. Looser
 * than the AI limit (these are cheap) but stops runaway loops, bulk-send abuse,
 * and DB write floods. Tune with WRITE_RATE_LIMIT_PER_MIN (default 120/min).
 */
export function writeRateLimit(req: Request, scope = "write"): RateLimitResult {
  const perMin = Number(process.env.WRITE_RATE_LIMIT_PER_MIN);
  const limit = Number.isFinite(perMin) && perMin > 0 ? perMin : 120;
  return rateLimit(clientKey(req, scope), limit, 60_000);
}

/** Test-only: clear all buckets between cases. */
export function _resetRateLimit(): void {
  buckets.clear();
}
