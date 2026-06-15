import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchJson } from "@/lib/fetch-json";

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

describe("fetchJson", () => {
  it("returns parsed data on a 200", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ a: 1 }), { status: 200 })) as typeof fetch;
    const r = await fetchJson<{ a: number }>("/x");
    expect(r.ok).toBe(true);
    expect(r.status).toBe(200);
    expect(r.data).toEqual({ a: 1 });
    expect(r.error).toBeNull();
  });

  it("never throws on a non-OK status — surfaces it as a result", async () => {
    global.fetch = vi.fn(async () => new Response("nope", { status: 403 })) as typeof fetch;
    const r = await fetchJson("/x");
    expect(r.ok).toBe(false);
    expect(r.status).toBe(403);
    expect(r.error).toMatch(/403/);
  });

  it("tolerates an unparseable body", async () => {
    global.fetch = vi.fn(async () => new Response("<html>", { status: 200 })) as typeof fetch;
    const r = await fetchJson("/x");
    expect(r.ok).toBe(true);
    expect(r.data).toBeNull();
  });

  it("flags an aborted request without an error message", async () => {
    global.fetch = vi.fn(async () => {
      throw new DOMException("aborted", "AbortError");
    }) as typeof fetch;
    const r = await fetchJson("/x");
    expect(r.aborted).toBe(true);
    expect(r.error).toBeNull();
  });

  it("reports a network failure", async () => {
    global.fetch = vi.fn(async () => {
      throw new TypeError("failed to fetch");
    }) as typeof fetch;
    const r = await fetchJson("/x");
    expect(r.ok).toBe(false);
    expect(r.aborted).toBe(false);
    expect(r.error).toBe("Network error");
  });
});
