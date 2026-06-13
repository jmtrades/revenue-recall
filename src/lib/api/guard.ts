import { NextResponse } from "next/server";
import { logError, errMessage } from "@/lib/log";
import { sendAlert } from "@/lib/alert";
import { rateLimit } from "@/lib/ratelimit";
import { requestId } from "@/lib/request-id";

/**
 * Wrap an API route handler so any unhandled throw becomes a clean JSON 500
 * instead of leaking a stack/opaque framework error. Next already keeps the
 * server up on a throw, but this guarantees a consistent, non-leaky error shape
 * (and one place to log) — so a transient provider/DB failure returns a tidy
 * "Something went wrong" the client can handle, not a raw 500 page.
 *
 * Every response also carries an `x-request-id` correlation header, and a 500
 * echoes that id in its body — so an error a user reports can be located in the
 * server logs by a single id (the no-APM-yet observability baseline).
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
    const rid = requestId(req);
    try {
      // Next always supplies ctx; the undefined case only exists for direct
      // test invocation of routes that never read it.
      const res = await handler(req, ctx as C);
      // Tag the response so any request can be correlated to its server logs.
      try {
        res.headers.set("x-request-id", rid);
      } catch {
        /* immutable response (rare) — correlation header is best-effort */
      }
      return res;
    } catch (err) {
      const path = new URL(req.url).pathname;
      const error = errMessage(err);
      // One place to observe unexpected failures; never leak internals to clients.
      logError("api.unhandled", { method: req.method, path, error, requestId: rid });
      // Alert the operator on unhandled 500s so a bug customers are hitting isn't
      // invisible at scale. Best-effort (never blocks the response) and rate-limited
      // per path so a systemic failure can't storm the alert webhook.
      if (rateLimit(`alert:api.unhandled:${path}`, 1, 300_000).ok) {
        void sendAlert("api.unhandled", { method: req.method, path, error, requestId: rid });
      }
      // Echo the id so a user can quote it to support and we can find the log.
      return NextResponse.json({ error: "Something went wrong. Please try again.", requestId: rid }, { status: 500, headers: { "x-request-id": rid } });
    }
  };
}
