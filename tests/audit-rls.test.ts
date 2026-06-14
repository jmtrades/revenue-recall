import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The audit log is the first surface put under ACTIVE RLS:
 *  - reads (listAudit) go through the session/anon client so Postgres RLS
 *    enforces org isolation,
 *  - writes (recordAudit) stay on the service-role client so the trail is
 *    append-only and can't be forged from a user session.
 * This test pins that split so a refactor can't silently send reads back
 * through the RLS-bypassing service-role client.
 */

const calls = { scopedFrom: 0, serviceFrom: 0 };

function fakeClient(counter: "scopedFrom" | "serviceFrom") {
  return {
    from() {
      calls[counter]++;
      const chain: Record<string, unknown> = {};
      const ret = () => chain;
      Object.assign(chain, {
        select: ret,
        eq: ret,
        order: ret,
        insert: async () => ({ error: null }),
        limit: async () => ({ data: [{ id: "a1", action: "settings.updated", target: null, actor_email: "o@x.com", created_at: "2026-06-13T00:00:00Z" }] }),
      });
      return chain;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  getOrgScopedSupabase: () => fakeClient("scopedFrom"),
}));
vi.mock("@/lib/supabase/client", () => ({
  getSupabase: () => fakeClient("serviceFrom"),
}));
vi.mock("@/lib/supabase/active-org", () => ({ resolveActiveOrgId: async () => "org_1" }));
vi.mock("@/lib/auth", () => ({ getSessionUser: async () => ({ id: "u1", email: "o@x.com", name: "Owner" }) }));

import { listAudit, recordAudit } from "@/lib/audit";

beforeEach(() => {
  calls.scopedFrom = 0;
  calls.serviceFrom = 0;
});

describe("audit log RLS split", () => {
  it("listAudit reads through the RLS-enforced session client", async () => {
    const events = await listAudit();
    expect(calls.scopedFrom).toBe(1);
    expect(calls.serviceFrom).toBe(0);
    expect(events[0]).toMatchObject({ id: "a1", action: "settings.updated", actorEmail: "o@x.com" });
  });

  it("recordAudit writes through the service-role client (append-only, never the session client)", async () => {
    await recordAudit("settings.updated", "org name");
    expect(calls.serviceFrom).toBe(1);
    expect(calls.scopedFrom).toBe(0);
  });
});
