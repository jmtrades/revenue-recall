import { describe, it, expect } from "vitest";
import { parseClientError } from "@/lib/client-error-intake";
import { POST } from "@/app/api/client-error/route";

function post(body: unknown, ip = "203.0.113.9"): Promise<Response> {
  return Promise.resolve(
    POST(
      new Request("http://localhost/api/client-error", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
      undefined,
    ),
  );
}

describe("browser-error intake", () => {
  it("accepts a well-formed report and clamps are enforced by schema", () => {
    expect(parseClientError({ message: "TypeError: x is not a function", stack: "at foo", source: "window", url: "/dashboard" })).toMatchObject({
      message: "TypeError: x is not a function",
    });
    // Over-length fields are rejected, not silently truncated server-side —
    // the client already clamps; an oversized payload here is not our client.
    expect(parseClientError({ message: "x".repeat(301) })).toBeNull();
    expect(parseClientError({ message: "ok", stack: "y".repeat(2001) })).toBeNull();
    expect(parseClientError({ message: "ok", source: "not-a-source" })).toBeNull();
    expect(parseClientError({})).toBeNull();
    expect(parseClientError("garbage")).toBeNull();
  });

  it("always answers 204 — valid, invalid, or malformed JSON", async () => {
    expect((await post({ message: "Boom", source: "boundary" })).status).toBe(204);
    expect((await post({ nope: true })).status).toBe(204);
    expect((await post("{not json")).status).toBe(204);
  });

  it("rate-limits per IP without ever changing the response shape", async () => {
    // Exhaust one IP's window; every response stays 204 (probes learn nothing).
    for (let i = 0; i < 12; i++) {
      const res = await post({ message: `e${i}` }, "198.51.100.7");
      expect(res.status).toBe(204);
    }
  });
});
