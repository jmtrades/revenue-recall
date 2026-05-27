import { NextResponse } from "next/server";

/**
 * Lightweight in-memory rate limiter. Best-effort: counters live per serverless
 * instance, not shared across regions — enough to blunt floods and accidental
 * loops at launch. The hard cost ceiling on AI is the per-org action meter; this
 * guards against abuse/DoS. Swap in Upstash/Redis for a global limit later.
 */

type Window = { count: number; reset: number };
const buckets = new Map<string, Window>();
let lastSweep = 0;

function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [k, w] of buckets) if (now >= w.reset) buckets.delete(k);
}

export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  const first = xff.split(",")[0]?.trim();
  return first || req.headers.get("x-real-ip") || "unknown";
}

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  sweep(now);
  const w = buckets.get(key);
  if (!w || now >= w.reset) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  w.count += 1;
  if (w.count > limit) return { ok: false, retryAfter: Math.max(1, Math.ceil((w.reset - now) / 1000)) };
  return { ok: true, retryAfter: 0 };
}

/** Returns a 429 response when the caller is over the limit, else null. */
export function limited(req: Request, name: string, limit: number, windowMs: number): NextResponse | null {
  const { ok, retryAfter } = rateLimit(`${name}:${clientIp(req)}`, limit, windowMs);
  if (ok) return null;
  return NextResponse.json(
    { error: "Too many requests. Please slow down and try again shortly." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}
