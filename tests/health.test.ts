import { describe, it, expect, beforeEach, afterEach } from "vitest";

// The health route reads env at request time; toggle vars per case.
const SAVED = { ...process.env };
beforeEach(() => {
  delete process.env.NEXT_PUBLIC_AUTH_REQUIRED;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.VERCEL_GIT_COMMIT_SHA;
  delete process.env.GIT_COMMIT_SHA;
});
afterEach(() => {
  process.env = { ...SAVED };
});

async function health() {
  const { GET } = await import("@/app/api/health/route");
  const res = await GET();
  return res.json();
}

describe("health launch-readiness verdict", () => {
  it("flags auth-optional + no-database as launch blockers", async () => {
    const body = await health();
    expect(body.launch.ready).toBe(false);
    expect(body.launch.blockers.join(" ")).toMatch(/NEXT_PUBLIC_AUTH_REQUIRED/);
    expect(body.launch.blockers.join(" ")).toMatch(/database/i);
  });

  it("is launch-ready when a database is connected and auth is required", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
    process.env.NEXT_PUBLIC_AUTH_REQUIRED = "true";
    const body = await health();
    expect(body.capabilities.database).toBe("supabase");
    expect(body.capabilities.auth).toBe("required");
    expect(body.launch.ready).toBe(true);
    expect(body.launch.blockers).toEqual([]);
  });

  it("auto-enables auth when a database is connected — no flag needed", async () => {
    // The production failure mode this fixes: Supabase connected but the
    // build-time NEXT_PUBLIC_AUTH_REQUIRED flag never took, leaving everyone on
    // a shared open workspace. With a real backend present, auth is now ON by
    // default so each user gets their own private org automatically.
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
    // NEXT_PUBLIC_AUTH_REQUIRED intentionally unset
    const body = await health();
    expect(body.capabilities.auth).toBe("required");
    expect(body.launch.ready).toBe(true);
    expect(body.launch.blockers).toEqual([]);
  });

  it("ignores a stray NEXT_PUBLIC_AUTH_REQUIRED=false when a database is connected", async () => {
    // A leftover opt-out must never drop a real multi-tenant deploy back into an
    // open, shared-workspace state — the exact production misconfig that left
    // every visitor on one org. A connected database forces auth on, full stop.
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
    process.env.NEXT_PUBLIC_AUTH_REQUIRED = "false";
    const body = await health();
    expect(body.capabilities.auth).toBe("required");
    expect(body.launch.ready).toBe(true);
  });

  it("blocks launch when a database is connected without a service-role key", async () => {
    // Provisioning a new user's first org uses the service-role client (it
    // bypasses RLS to create the org/member). Without that key every signup
    // silently dead-ends, so a connected DB with no service role must be loud.
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    // SUPABASE_SERVICE_ROLE_KEY intentionally absent
    const body = await health();
    expect(body.capabilities.database).toBe("supabase");
    expect(body.launch.ready).toBe(false);
    expect(body.launch.blockers.join(" ")).toMatch(/service-role/i);
  });

  it("still reports status ok even when not launch-ready", async () => {
    const body = await health();
    expect(body.status).toBe("ok");
    expect(Array.isArray(body.launch.warnings)).toBe(true);
  });
});

describe("health release identification", () => {
  // A failed deploy keeps serving the previous build while every other health
  // field still reads green — the commit field is what makes that visible.
  it("reports the short commit SHA when the host injects one", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "c8ecfe680a8ec2bb91f74886de8d09d04a012c94";
    const body = await health();
    expect(body.commit).toBe("c8ecfe6");
  });

  it("falls back to GIT_COMMIT_SHA for non-Vercel hosts", async () => {
    process.env.GIT_COMMIT_SHA = "269c44d1234567890";
    const body = await health();
    expect(body.commit).toBe("269c44d");
  });

  it("reports 'dev' when no build SHA is available", async () => {
    const body = await health();
    expect(body.commit).toBe("dev");
  });
});
