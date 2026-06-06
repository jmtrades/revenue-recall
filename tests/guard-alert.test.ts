import { describe, it, expect, vi, beforeEach } from "vitest";

const { sendAlert } = vi.hoisted(() => ({ sendAlert: vi.fn(async () => {}) }));
vi.mock("@/lib/alert", () => ({ sendAlert }));

import { withGuard } from "@/lib/api/guard";
import { _resetRateLimit } from "@/lib/ratelimit";

beforeEach(() => {
  _resetRateLimit();
  sendAlert.mockClear();
  delete process.env.ALERT_WEBHOOK_URL;
});

const boom = withGuard(async () => {
  throw new Error("kaboom");
});
const reqTo = (path: string) => new Request(`http://localhost${path}`, { method: "POST" });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("withGuard alerts the operator on unhandled 500s (rate-limited)", () => {
  it("fires an alert on an unhandled error (and still returns a clean 500)", async () => {
    const res = await boom(reqTo("/api/widget"), undefined);
    expect(res.status).toBe(500);
    await flush();
    expect(sendAlert).toHaveBeenCalledTimes(1);
    expect(sendAlert.mock.calls[0][0]).toBe("api.unhandled");
  });

  it("rate-limits repeated alerts for the same path — no webhook storm", async () => {
    await boom(reqTo("/api/widget"), undefined);
    await boom(reqTo("/api/widget"), undefined);
    await boom(reqTo("/api/widget"), undefined);
    await flush();
    expect(sendAlert).toHaveBeenCalledTimes(1); // only the first within the window
  });

  it("alerts independently for a different path", async () => {
    await boom(reqTo("/api/a"), undefined);
    await boom(reqTo("/api/b"), undefined);
    await flush();
    expect(sendAlert).toHaveBeenCalledTimes(2);
  });
});
