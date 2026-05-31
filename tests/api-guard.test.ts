import { describe, it, expect } from "vitest";
import { withGuard } from "@/lib/api/guard";

function req(): Request {
  return new Request("http://localhost/api/x", { method: "POST" });
}

describe("withGuard", () => {
  it("passes a normal response through unchanged", async () => {
    const handler = withGuard(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const res = await handler(req(), undefined);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("preserves a handler's own error response (4xx/5xx it returns itself)", async () => {
    const handler = withGuard(async () => new Response(JSON.stringify({ error: "bad" }), { status: 400 }));
    const res = await handler(req(), undefined);
    expect(res.status).toBe(400); // not masked into a 500
  });

  it("converts an unhandled throw into a clean JSON 500", async () => {
    const handler = withGuard(async () => {
      throw new Error("provider exploded");
    });
    const res = await handler(req(), undefined);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/something went wrong/i);
    // Never leaks the internal message.
    expect(JSON.stringify(body)).not.toContain("provider exploded");
  });

  it("catches a synchronous throw too", async () => {
    const handler = withGuard(() => {
      throw new Error("sync boom");
    });
    const res = await handler(req(), undefined);
    expect(res.status).toBe(500);
  });
});
