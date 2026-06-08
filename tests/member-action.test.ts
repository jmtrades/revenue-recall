import { describe, it, expect } from "vitest";
import { memberActionError, assignableRoles, type MemberActionInput } from "@/lib/members";

const base: MemberActionInput = { actorRole: "owner", actorIsSelf: false, targetRole: "rep", ownerCount: 1, action: "remove" };

describe("memberActionError (member management rules)", () => {
  it("blocks members who aren't owner/admin", () => {
    expect(memberActionError({ ...base, actorRole: "rep" })).toBeTruthy();
    expect(memberActionError({ ...base, actorRole: "manager" })).toBeTruthy();
  });

  it("blocks managing your own membership", () => {
    expect(memberActionError({ ...base, actorIsSelf: true })).toBeTruthy();
    expect(memberActionError({ ...base, actorRole: "admin", actorIsSelf: true, targetRole: "admin", action: "role", newRole: "rep" })).toBeTruthy();
  });

  it("stops admins from touching or minting owners", () => {
    expect(memberActionError({ ...base, actorRole: "admin", targetRole: "owner", ownerCount: 2 })).toBeTruthy();
    expect(memberActionError({ ...base, actorRole: "admin", action: "role", newRole: "owner" })).toBeTruthy();
    // ...but an admin can still manage the lower roles
    expect(memberActionError({ ...base, actorRole: "admin", targetRole: "rep", action: "role", newRole: "manager" })).toBeNull();
  });

  it("protects the last owner from demotion or removal", () => {
    expect(memberActionError({ ...base, targetRole: "owner", ownerCount: 1, action: "remove" })).toBeTruthy();
    expect(memberActionError({ ...base, targetRole: "owner", ownerCount: 1, action: "role", newRole: "admin" })).toBeTruthy();
    // with a co-owner present, demoting one is allowed
    expect(memberActionError({ ...base, targetRole: "owner", ownerCount: 2, action: "role", newRole: "admin" })).toBeNull();
    expect(memberActionError({ ...base, targetRole: "owner", ownerCount: 2, action: "remove" })).toBeNull();
  });

  it("rejects a no-op role change", () => {
    expect(memberActionError({ ...base, targetRole: "admin", action: "role", newRole: "admin" })).toBeTruthy();
  });

  it("allows valid management", () => {
    expect(memberActionError({ ...base, targetRole: "rep", action: "role", newRole: "admin" })).toBeNull();
    expect(memberActionError({ ...base, action: "remove" })).toBeNull();
    // an owner may promote someone to owner
    expect(memberActionError({ ...base, targetRole: "rep", action: "role", newRole: "owner" })).toBeNull();
  });
});

describe("assignableRoles", () => {
  it("only owners can grant owner", () => {
    expect(assignableRoles("owner")).toContain("owner");
    expect(assignableRoles("admin")).toEqual(["admin", "manager", "rep"]);
    expect(assignableRoles("manager")).not.toContain("owner");
  });
});
