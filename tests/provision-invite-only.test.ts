import { describe, it, expect, beforeEach, vi } from "vitest";

// Invite-only (private) deployment gate: ensureOrgForUser must NOT bootstrap a
// workspace for an uninvited stranger once an org already exists — but must still
// let existing members, invited people, and the very first user (fresh deploy) in.

const { getSupabase } = vi.hoisted(() => ({ getSupabase: vi.fn() }));
const { acceptPendingInvite } = vi.hoisted(() => ({ acceptPendingInvite: vi.fn() }));
const { bootstrapOrg } = vi.hoisted(() => ({ bootstrapOrg: vi.fn() }));
const { inviteOnlyEnabled } = vi.hoisted(() => ({ inviteOnlyEnabled: vi.fn() }));

vi.mock("@/lib/supabase/client", () => ({ getSupabase }));
vi.mock("@/lib/invites-server", () => ({ acceptPendingInvite }));
vi.mock("@/lib/supabase/bootstrap", () => ({ bootstrapOrg }));
vi.mock("@/lib/billing/lifecycle", () => ({ sendWelcomeEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/config", () => ({ inviteOnlyEnabled }));

import { ensureOrgForUser } from "@/lib/supabase/provision";
import type { SessionUser } from "@/lib/auth";

let memberOrgId: string | null = null;
let orgCount = 0;

function fakeClient() {
  return {
    from(table: string) {
      return {
        select(_cols: string, opts?: { count?: string; head?: boolean }) {
          if (table === "orgs" && opts?.head) {
            return Promise.resolve({ count: orgCount, error: null });
          }
          // members lookup chain: .select(...).eq(...).limit(...).maybeSingle()
          return {
            eq() {
              return {
                limit() {
                  return { maybeSingle: () => Promise.resolve({ data: memberOrgId ? { org_id: memberOrgId } : null }) };
                },
              };
            },
          };
        },
      };
    },
  };
}

function user(id: string): SessionUser {
  return { id, name: "Pat", email: `${id}@example.com` } as SessionUser;
}

beforeEach(() => {
  vi.clearAllMocks();
  memberOrgId = null;
  orgCount = 0;
  getSupabase.mockReturnValue(fakeClient());
  acceptPendingInvite.mockResolvedValue(null);
  bootstrapOrg.mockResolvedValue({ orgId: "new_org", pipelineId: "p", counts: {} });
  inviteOnlyEnabled.mockReturnValue(true);
});

describe("ensureOrgForUser — invite-only gate", () => {
  it("blocks an uninvited stranger once an org exists (no bootstrap)", async () => {
    orgCount = 1; // a workspace already exists
    const orgId = await ensureOrgForUser(user("stranger"));
    expect(orgId).toBeNull();
    expect(bootstrapOrg).not.toHaveBeenCalled();
  });

  it("lets the very first user become owner on a fresh deployment", async () => {
    orgCount = 0; // no org anywhere yet
    const orgId = await ensureOrgForUser(user("firstowner"));
    expect(orgId).toBe("new_org");
    expect(bootstrapOrg).toHaveBeenCalledOnce();
  });

  it("lets an invited user join the inviting org", async () => {
    orgCount = 1;
    acceptPendingInvite.mockResolvedValue("inviting_org");
    const orgId = await ensureOrgForUser(user("invited"));
    expect(orgId).toBe("inviting_org");
    expect(bootstrapOrg).not.toHaveBeenCalled();
  });

  it("returns the org of an existing member without re-checking the gate", async () => {
    orgCount = 1;
    memberOrgId = "their_org";
    const orgId = await ensureOrgForUser(user("member"));
    expect(orgId).toBe("their_org");
    expect(acceptPendingInvite).not.toHaveBeenCalled();
    expect(bootstrapOrg).not.toHaveBeenCalled();
  });

  it("bootstraps normally for anyone when the flag is OFF", async () => {
    inviteOnlyEnabled.mockReturnValue(false);
    orgCount = 1;
    const orgId = await ensureOrgForUser(user("openuser"));
    expect(orgId).toBe("new_org");
    expect(bootstrapOrg).toHaveBeenCalledOnce();
  });
});
