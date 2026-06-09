/**
 * Best-effort in-memory rate limiter. A fixed-window counter per key (e.g. client
 * IP + route), kept in a process-local map. It's intentionally simple: it caps
 * abusive bursts against public endpoints without external infra, and degrades
 * safely (per-instance, resets on restart). For hard, cross-instance guarantees
 * a shared store (Redis/Upstash) implements the same `rateLimit` shape later.
 */

import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";

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
export async function aiRateLimit(req: Request, scope = "ai"): Promise<RateLimitResult> {
  const perMin = Number(process.env.AI_RATE_LIMIT_PER_MIN);
  const limit = Number.isFinite(perMin) && perMin > 0 ? perMin : 30;
  // AI endpoints are the cost-bearing ones, so their limiter is the DB-backed
  // counter (per-instance memory resets on every cold start and multiplies by
  // instance count on serverless); falls back to in-memory without a database.
  return distributedRateLimit(clientKey(req, scope), limit, 60_000);
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

/**
 * Throttle bulk import per client. Far tighter than the generic write limit
 * because ONE call creates up to 2000 contacts (+ their opportunities): an
 * unthrottled loop here is a DB write flood. A handful per minute is plenty for
 * human-driven CSV uploads (select file → map → confirm). Tune with
 * IMPORT_RATE_LIMIT_PER_MIN (default 10/min).
 */
export function importRateLimit(req: Request, scope = "import"): RateLimitResult {
  const perMin = Number(process.env.IMPORT_RATE_LIMIT_PER_MIN);
  const limit = Number.isFinite(perMin) && perMin > 0 ? perMin : 10;
  return rateLimit(clientKey(req, scope), limit, 60_000);
}

/** Test-only: clear all buckets between cases. */
export function _resetRateLimit(): void {
  buckets.clear();
}

/**
 * Cross-instance rate limit (Supabase-backed). Same decision as `rateLimit`, but
 * the fixed-window counter is SHARED across serverless instances — so it's a real
 * cap on brute-force/abuse of auth endpoints (login/signup/reset), where the
 * per-instance in-memory limiter would otherwise allow N_instances × limit.
 *
 * Falls back to the in-memory limiter when Supabase isn't configured, and FAILS
 * OPEN on any store error — never block a legitimate user because the limiter's
 * own DB hiccuped. (Auth endpoints also have the upstream provider's caps.)
 */
export async function distributedRateLimit(key: string, limit: number, windowMs: number, now: number = Date.now()): Promise<RateLimitResult> {
  if (!isSupabaseConfigured()) return rateLimit(key, limit, windowMs, now);
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const resetAt = windowStart + windowMs;
  try {
    const { data, error } = await getSupabase()!.rpc("incr_rate_limit", { p_key: key, p_window: windowStart });
    if (error || typeof data !== "number") return rateLimit(key, limit, windowMs, now);
    return { ok: data <= limit, remaining: Math.max(0, limit - data), resetAt };
  } catch {
    return rateLimit(key, limit, windowMs, now);
  }
}

/** Best-effort cleanup of expired rate-limit windows (call occasionally, e.g.
 *  from the cron). No-op without Supabase; never throws. */
export async function cleanupRateLimits(olderThanMs = 3_600_000, now: number = Date.now()): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    await getSupabase()!.from("rate_limits").delete().lt("window_start", now - olderThanMs);
  } catch {
    /* best-effort */
  }
}
