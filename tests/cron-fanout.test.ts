import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Multi-tenant cron fan-out. Stub the platform org list + the per-org sub-request
// (fetch) so we exercise ONLY the parent fan-out: bounded concurrency, every
// tenant processed once, and partial-failure aggregation.
const orgs = [{ id: "o1" }, { id: "o2" }, { id: "o3" }];
vi.mock("@/lib/supabase/client", () => ({
  isSupabaseConfigured: () => true,
  getSupabase: () => ({
    from: () => ({
      select: () => ({ order: async () => ({ data: orgs }) }), // allOrgIds
      delete: () => ({ lt: async () => ({}) }), // cleanupRateLimits
    }),
  }),
}));
// Per-org work is never reached here (fetch is stubbed) — keep these trivial.
vi.mock("@/lib/agent/store", () => ({ listTasks: async () => [] }));
vi.mock("@/lib/agent/engine", () => ({ runTask: async () => ({ status: "ok", itemsProcessed: 0 }) }));
vi.mock("@/lib/cadence", () => ({ runDueSteps: async () => ({}), collectDueBatches: async () => ({}) }));
vi.mock("@/lib/digest", () => ({ runDigests: async () => ({}) }));

const realFetch = global.fetch;

describe("cron fan-out scales to many tenants (bounded concurrency)", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "s3cr3t";
    delete process.env.ALERT_WEBHOOK_URL; // so sendAlert never touches our fetch stub
  });
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.CRON_SECRET;
  });

  const call = async () => {
    const { POST } = await import("@/app/api/agent/cron/route");
    return POST(new Request("http://localhost/api/agent/cron", { method: "POST", headers: { authorization: "Bearer s3cr3t" } }));
  };

  it("processes every tenant exactly once, concurrently, and aggregates ok", async () => {
    const seen: string[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    global.fetch = vi.fn(async (u: unknown) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      seen.push(new URL(String(u)).searchParams.get("org")!);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return { status: 200, json: async () => ({ ok: true }) } as Response;
    }) as unknown as typeof fetch;

    const body = await (await call()).json();
    expect(body.fanned).toBe(true);
    expect(body.orgs).toBe(3);
    expect(body.ok).toBe(true);
    expect(seen.sort()).toEqual(["o1", "o2", "o3"]); // every tenant, exactly once
    expect(maxInFlight).toBeGreaterThan(1); // actually concurrent, not a sequential loop
  });

  it("flags a partial failure when one tenant's tick errors (not a falsely-green cron)", async () => {
    global.fetch = vi.fn(async (u: unknown) => {
      const org = new URL(String(u)).searchParams.get("org");
      return { status: org === "o2" ? 500 : 200, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch;

    const body = await (await call()).json();
    expect(body.ok).toBe(false);
    expect(body.failed).toBe(1);
  });
});
