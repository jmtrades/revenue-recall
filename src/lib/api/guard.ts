import { NextResponse } from "next/server";

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
type RouteHandler<C> = (req: Request, ctx: C) => Promise<Response> | Response;

export function withGuard<C = unknown>(handler: RouteHandler<C>): RouteHandler<C> {
  return async (req: Request, ctx: C) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      // One place to observe unexpected failures; never leak internals to clients.
      console.error(`[api] unhandled error on ${req.method} ${new URL(req.url).pathname}:`, err);
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
  };
}
