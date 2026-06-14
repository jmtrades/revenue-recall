import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The context-aware read-client selector (read-client.ts) is the single switch
 * that turns RLS enforcement on for user-facing reads. These tests pin its
 * fail-safe routing so a refactor can't silently send authenticated reads back
 * through the RLS-bypassing service-role client, or break public/background
 * reads by sending them through the (sessionless → empty) session client.
 */

const SERVICE = { tag: "service" };
const SESSION = { tag: "session" };

const sessionUser = { value: null as null | { id: string } };
const override = { value: undefined as string | undefined };
const sessionUserThrows = { value: false };

vi.mock("@/lib/supabase/client", () => ({ getSupabase: () => SERVICE }));
vi.mock("@/lib/supabase/server", () => ({ getOrgScopedSupabase: () => SESSION }));
vi.mock("@/lib/supabase/org-context", () => ({ getOrgOverride: () => override.value }));
vi.mock("@/lib/auth", () => ({
  getSessionUser: async () => {
    if (sessionUserThrows.value) throw new Error("outside request scope");
    return sessionUser.value;
  },
}));

import { getOrgReadClient, rlsReadsEnabled } from "@/lib/supabase/read-client";

beforeEach(() => {
  process.env.RLS_ENFORCE_READS = "true";
  sessionUser.value = null;
  override.value = undefined;
  sessionUserThrows.value = false;
});
afterEach(() => {
  delete process.env.RLS_ENFORCE_READS;
});

describe("getOrgReadClient routing", () => {
  it("flag OFF → always the service-role client (byte-identical legacy behavior)", async () => {
    delete process.env.RLS_ENFORCE_READS;
    expect(rlsReadsEnabled()).toBe(false);
    sessionUser.value = { id: "u1" };
    expect(await getOrgReadClient()).toBe(SERVICE);
  });

  it("authenticated request → session client (RLS enforces)", async () => {
    sessionUser.value = { id: "u1" };
    expect(await getOrgReadClient()).toBe(SESSION);
  });

  it("background (runWithOrg override active) → service-role, never the session client", async () => {
    override.value = "org_42";
    sessionUser.value = { id: "u1" }; // even if a session somehow exists
    expect(await getOrgReadClient()).toBe(SERVICE);
  });

  it("public / unauthenticated request → service-role (RLS would empty it)", async () => {
    sessionUser.value = null;
    expect(await getOrgReadClient()).toBe(SERVICE);
  });

  it("auth lookup throwing (no request scope) → service-role (fail-safe)", async () => {
    sessionUserThrows.value = true;
    expect(await getOrgReadClient()).toBe(SERVICE);
  });
});
