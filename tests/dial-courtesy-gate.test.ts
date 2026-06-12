import { describe, it, expect, afterEach, vi } from "vitest";
import { POST as placeRoute } from "@/app/api/calls/place/route";
import { _resetRateLimit } from "@/lib/ratelimit";

function req(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/calls/place", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.useRealTimers();
  _resetRateLimit();
});

describe("manual dialer enforces the TCPA calling window (the rep's Call button is not exempt)", () => {
  it("refuses to dial a prospect at 3am their local time", async () => {
    vi.useFakeTimers();
    // 07:00Z = 03:00 in New York (212).
    vi.setSystemTime(new Date("2026-06-12T07:00:00Z"));
    const res = await placeRoute(req({ to: "+12125551234" }));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/8am–9pm/);
  });

  it("places the call when the prospect's window is open", async () => {
    vi.useFakeTimers();
    // 16:00Z = 12:00 in New York.
    vi.setSystemTime(new Date("2026-06-12T16:00:00Z"));
    const res = await placeRoute(req({ to: "+12125551234" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean };
    expect(body.ok).toBe(true);
  });

  it("gates unknown (non-NANP) numbers on the workspace clock instead of failing open", async () => {
    vi.useFakeTimers();
    // 03:00Z; demo org has no timezone → UTC fallback → outside 8am–9pm.
    vi.setSystemTime(new Date("2026-06-12T03:00:00Z"));
    const res = await placeRoute(req({ to: "+442071234567" }));
    expect(res.status).toBe(403);
  });
});
