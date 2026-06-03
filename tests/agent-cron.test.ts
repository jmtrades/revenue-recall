import { describe, it, expect, vi, afterEach } from "vitest";

// Keep the per-org work trivial so we only exercise auth + routing.
vi.mock("@/lib/agent/store", () => ({ listTasks: async () => [] }));
vi.mock("@/lib/agent/engine", () => ({ runTask: async () => ({ status: "ok", itemsProcessed: 0 }) }));
vi.mock("@/lib/cadence", () => ({ runDueSteps: async () => ({}), collectDueBatches: async () => ({}) }));
vi.mock("@/lib/digest", () => ({ runDigests: async () => ({}) }));

const req = (headers: Record<string, string>, url = "http://localhost/api/agent/cron") =>
  new Request(url, { method: "POST", headers });

afterEach(() => vi.unstubAllEnvs());

describe("agent cron auth", () => {
  it("rejects x-vercel-cron alone once CRON_SECRET is set (spoofable on non-Vercel hosts)", async () => {
    vi.stubEnv("CRON_SECRET", "s3cr3t");
    const { POST } = await import("@/app/api/agent/cron/route");
    expect((await POST(req({ "x-vercel-cron": "1" }))).status).toBe(401);
  });

  it("rejects a wrong Bearer secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cr3t");
    const { POST } = await import("@/app/api/agent/cron/route");
    expect((await POST(req({ authorization: "Bearer nope" }))).status).toBe(401);
  });

  it("accepts the correct Bearer secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cr3t");
    const { POST } = await import("@/app/api/agent/cron/route");
    expect((await POST(req({ authorization: "Bearer s3cr3t" }))).status).toBe(200);
  });

  it("falls back to the x-vercel-cron header when no secret is configured (demo)", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const { POST } = await import("@/app/api/agent/cron/route");
    expect((await POST(req({ "x-vercel-cron": "1" }))).status).toBe(200);
  });

  it("a per-org sub-request (?org=) processes just that org", async () => {
    vi.stubEnv("CRON_SECRET", "s3cr3t");
    const { POST } = await import("@/app/api/agent/cron/route");
    const res = await POST(req({ authorization: "Bearer s3cr3t" }, "http://localhost/api/agent/cron?org=org_42"));
    expect(res.status).toBe(200);
    expect((await res.json()).org).toBe("org_42");
  });
});
