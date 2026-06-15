import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the Supabase client so we can force the member insert to fail and assert
// the org is rolled back (compensating delete) — the fix for a partial bootstrap
// orphaning an org and locking the user out.
const { getSupabase } = vi.hoisted(() => ({ getSupabase: vi.fn() }));
vi.mock("@/lib/supabase/client", async (orig) => ({
  ...(await orig<typeof import("@/lib/supabase/client")>()),
  getSupabase: getSupabase,
}));

import { bootstrapOrg } from "@/lib/supabase/bootstrap";

let failMembers = false;
let deletedOrgId: string | null = null;

function fakeClient() {
  return {
    from(table: string) {
      return {
        insert() {
          const fail = table === "members" && failMembers;
          const result = fail
            ? { data: null, error: { message: "members insert failed" } }
            : { data: table === "stages" ? [{ id: "s1", label: "L" }] : { id: `${table}_id` }, error: null };
          return {
            // stages awaits .select(...) directly; org/pipeline/member use .single()
            select() {
              return Object.assign(Promise.resolve(result), { single: () => Promise.resolve(result) });
            },
          };
        },
        delete() {
          return {
            eq(_col: string, val: string) {
              if (table === "orgs") deletedOrgId = val;
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      };
    },
  };
}

beforeEach(() => {
  failMembers = false;
  deletedOrgId = null;
  getSupabase.mockReturnValue(fakeClient());
});

describe("bootstrapOrg compensating rollback", () => {
  it("deletes the org when a later step fails, so no orphan is left behind", async () => {
    failMembers = true;
    await expect(bootstrapOrg({ member: { authUserId: "u1" } })).rejects.toThrow(/member/);
    expect(deletedOrgId).toBe("orgs_id"); // the just-created org was rolled back (cascade cleans the rest)
  });

  it("does not delete anything on a clean bootstrap", async () => {
    const res = await bootstrapOrg({ member: { authUserId: "u1" } });
    expect(res.orgId).toBe("orgs_id");
    expect(deletedOrgId).toBeNull();
  });
});
