import { describe, it, expect, beforeEach } from "vitest";
import { POST as importLeads } from "@/app/api/import/route";
import { _resetRateLimit } from "@/lib/ratelimit";

// Built-in (in-memory) CRM is writeable, so the import route runs end to end.
beforeEach(() => {
  _resetRateLimit();
  delete process.env.IMPORT_RATE_LIMIT_PER_MIN;
});

function post(ip: string, rows: unknown) {
  return importLeads(
    new Request("http://localhost/api/import", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ rows }),
    }),
  );
}

const uniqueRow = () => [{ name: `Imp ${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }];

describe("POST /api/import — bulk throttle + guard", () => {
  it("throttles a client that bursts past the import cap (429)", async () => {
    process.env.IMPORT_RATE_LIMIT_PER_MIN = "3";
    let last = 0;
    for (let i = 0; i < 4; i++) last = (await post("203.0.113.77", uniqueRow())).status;
    expect(last).toBe(429); // the 4th call (cap of 3) is rejected before any writes
  });

  it("gives different clients independent import budgets", async () => {
    process.env.IMPORT_RATE_LIMIT_PER_MIN = "1";
    expect((await post("10.0.0.1", uniqueRow())).status).not.toBe(429);
    expect((await post("10.0.0.2", uniqueRow())).status).not.toBe(429); // separate client
    expect((await post("10.0.0.1", uniqueRow())).status).toBe(429); // 10.0.0.1 over its cap
  });

  it("imports a valid batch under the cap (200)", async () => {
    const res = await post("10.0.0.9", [{ name: `Solo ${Date.now()}`, email: `solo${Date.now()}@x.com` }]);
    expect(res.status).toBe(200);
    expect((await res.json()).contacts).toBe(1);
  });

  it("rejects a malformed payload with 400 (the guard doesn't mask validation)", async () => {
    const res = await post("10.0.0.10", "not-an-array");
    expect(res.status).toBe(400);
  });
});
