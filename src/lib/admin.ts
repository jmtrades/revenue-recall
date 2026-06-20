import { NextResponse } from "next/server";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import { logInfo, logWarn } from "@/lib/log";
import { safeEqual } from "@/lib/safe-compare";

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
  if (!expected || !provided || !safeEqual(provided, expected)) {
    logWarn("admin.unauthorized", { scope });
    return NextResponse.json({ error: "Unauthorized — send Authorization: Bearer <ADMIN_TOKEN>." }, { status: 401 });
  }
  logInfo("admin.authorized", { scope });
  return null;
}

/** Boolean form for endpoints that stay PUBLIC but reveal extra detail to an
 *  operator (e.g. /api/health shows setup-gap text only with the token). Pure +
 *  constant-time; no rate-limit or logging since it gates detail, not access. */
export function isAdminRequest(req: Request): boolean {
  const expected = process.env.ADMIN_TOKEN;
  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  return Boolean(expected && provided && safeEqual(provided, expected));
}
