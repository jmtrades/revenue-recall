import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import { logInfo, logWarn } from "@/lib/log";

/**
 * Constant-time bearer comparison that doesn't leak length. HMAC both values
 * with a random per-process key → fixed-length digests → no early-out, no length
 * side channel.
 */
function tokenMatches(provided: string, expected: string): boolean {
  const key = crypto.randomBytes(32);
  const a = crypto.createHmac("sha256", key).update(provided).digest();
  const b = crypto.createHmac("sha256", key).update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * Gate an operator-only endpoint with ADMIN_TOKEN. Adds the three things the raw
 * `auth === "Bearer " + x` check lacked: a constant-time compare, per-IP rate
 * limiting (brute-force protection), and an audit log of every attempt. Returns
 * a NextResponse to short-circuit the handler, or null when authorized.
 */
export function requireAdmin(req: Request, scope: string): NextResponse | null {
  if (!rateLimit(clientKey(req, `admin:${scope}`), 10, 60_000).ok) {
    logWarn("admin.ratelimited", { scope });
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const expected = process.env.ADMIN_TOKEN;
  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!expected || !provided || !tokenMatches(provided, expected)) {
    logWarn("admin.unauthorized", { scope });
    return NextResponse.json({ error: "Unauthorized — send Authorization: Bearer <ADMIN_TOKEN>." }, { status: 401 });
  }
  logInfo("admin.authorized", { scope });
  return null;
}
