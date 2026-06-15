import { describe, it, expect, vi, afterEach } from "vitest";
import { requestId } from "@/lib/request-id";
import { withGuard } from "@/lib/api/guard";

afterEach(() => vi.restoreAllMocks());

describe("requestId", () => {
  it("prefers an upstream x-request-id", () => {
    const req = new Request("http://x/y", { headers: { "x-request-id": "abc-123" } });
    expect(requestId(req)).toBe("abc-123");
  });
  it("falls back to x-vercel-id", () => {
    const req = new Request("http://x/y", { headers: { "x-vercel-id": "iad1::xyz" } });
    expect(requestId(req)).toBe("iad1::xyz");
  });
  it("mints one when none provided", () => {
    expect(requestId(new Request("http://x/y")).length).toBeGreaterThan(8);
  });
});

describe("withGuard request correlation", () => {
  it("echoes the upstream id on a 500 (body + header) and logs it", async () => {
    const route = withGuard(async () => {
      throw new Error("boom");
    });
    const res = await route(new Request("http://x/api/thing", { method: "POST", headers: { "x-request-id": "rid-9" } }));
    expect(res.status).toBe(500);
    expect(res.headers.get("x-request-id")).toBe("rid-9");
    const body = (await res.json()) as { requestId?: string };
    expect(body.requestId).toBe("rid-9");
  });

  it("tags a successful response with the correlation id", async () => {
    const route = withGuard(async () => new Response("ok", { status: 200 }));
    const res = await route(new Request("http://x/api/thing", { headers: { "x-request-id": "rid-ok" } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBe("rid-ok");
  });
});
