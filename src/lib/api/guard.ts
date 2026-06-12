import { NextResponse } from "next/server";
import { logError, errMessage } from "@/lib/log";
import { sendAlert } from "@/lib/alert";
import { rateLimit } from "@/lib/ratelimit";

/**
 * Wrap an API route handler so any unhandled throw becomes a clean JSON 500
 * instead of leaking a stack/opaque framework error. Next already keeps the
 * server up on a throw, but this guarantees a consistent, non-leaky error shape
 * (and one place to log) — so a transient provider/DB failure returns a tidy
 * "Something went wrong" the client can handle, not a raw 500 page.
 *
 * Usage: `export const POST = withGuard(async (req) => { ... });`
 * Handlers that already return their own error responses are unaffected — the
 * guard only catches what they DON'T handle.
 */
// ctx is optional at the type level: Next always passes it, but handlers that
// ignore it (most routes) can then be invoked as plain `POST(req)` — which is
// exactly how the unit tests drive them.
type RouteHandler<C> = (req: Request, ctx: C) => Promise<Response> | Response;
type GuardedHandler<C> = (req: Request, ctx?: C) => Promise<Response>;

export function withGuard<C = unknown>(handler: RouteHandler<C>): GuardedHandler<C> {
  return async (req: Request, ctx?: C) => {
    try {
      // Next always supplies ctx; the undefined case only exists for direct
      // test invocation of routes that never read it.
      return await handler(req, ctx as C);
    } catch (err) {
      const path = new URL(req.url).pathname;
      const error = errMessage(err);
      // One place to observe unexpected failures; never leak internals to clients.
      logError("api.unhandled", { method: req.method, path, error });
      // Alert the operator on unhandled 500s so a bug customers are hitting isn't
      // invisible at scale. Best-effort (never blocks the response) and rate-limited
      // per path so a systemic failure can't storm the alert webhook.
      if (rateLimit(`alert:api.unhandled:${path}`, 1, 300_000).ok) {
        void sendAlert("api.unhandled", { method: req.method, path, error });
      }
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
  };
}
