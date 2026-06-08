/**
 * Team members — shared, client-safe core. Pure types + the permission matrix
 * for managing members (change role / remove), so the member list UI and tests
 * can import it freely. Server-side DB operations live in `members-server.ts`.
 */
import type { MemberRole } from "@/lib/authz";

/** Every role a member can hold (owner is granted, never invited). */
export const MEMBER_ROLES: MemberRole[] = ["owner", "admin", "manager", "rep"];

export interface Member {
  id: string;
  name: string;
  email: string | null;
  role: MemberRole;
  /** True for the signed-in viewer's own row — they can't manage themselves here. */
  isSelf: boolean;
}

export interface MemberActionInput {
  actorRole: MemberRole;
  /** The actor is acting on their own membership. */
  actorIsSelf: boolean;
  targetRole: MemberRole;
  /** How many owners the org currently has (so we never strand it with zero). */
  ownerCount: number;
  action: "role" | "remove";
  /** Desired role, when action === "role". */
  newRole?: MemberRole;
}

/**
 * The one place the rules for managing a teammate live — returns a human-readable
 * reason the action is NOT allowed, or null when it's fine. Enforced server-side;
 * the UI mirrors it to hide controls. Guarantees:
 *  - only owner/admin can manage members at all;
 *  - nobody manages their own membership here (no accidental self-lockout);
 *  - admins can't touch owners or mint new owners (only owners manage owners);
 *  - the last owner can never be demoted or removed (the org always has an owner).
 */
export function memberActionError(i: MemberActionInput): string | null {
  if (i.actorRole !== "owner" && i.actorRole !== "admin") {
    return "You don't have permission to manage members.";
  }
  if (i.actorIsSelf) {
    return "You can't change your own membership here — ask another owner or admin.";
  }
  if (i.actorRole === "admin") {
    if (i.targetRole === "owner") return "Only an owner can manage another owner.";
    if (i.action === "role" && i.newRole === "owner") return "Only an owner can promote someone to owner.";
  }
  if (i.targetRole === "owner") {
    const losingThisOwner = i.action === "remove" || (i.action === "role" && i.newRole !== "owner");
    if (losingThisOwner && i.ownerCount <= 1) {
      return "This is the last owner — promote someone else to owner first.";
    }
  }
  if (i.action === "role" && i.newRole === i.targetRole) {
    return "That's already their role.";
  }
  return null;
}

/** Which roles `actorRole` is allowed to assign (what the UI's dropdown should offer). */
export function assignableRoles(actorRole: MemberRole): MemberRole[] {
  // Only an owner can grant owner; everyone else manages the lower three.
  return actorRole === "owner" ? MEMBER_ROLES : MEMBER_ROLES.filter((r) => r !== "owner");
}
