export type DeletionPlan =
  | { action: "delete_org" }
  | { action: "leave" }
  | { action: "block"; reason: string };

/**
 * Decide what happens to the org when a user deletes their account, so one owner
 * can't silently erase a multi-person workspace (every teammate's contacts,
 * deals, and activities). Pure + unit-tested.
 *  - sole member of the org      → erase the org (their data only)
 *  - sole OWNER, other members   → block until ownership is transferred
 *  - otherwise                   → just remove this member; the org stays
 */
export function planAccountDeletion(role: string | undefined, others: { role: string }[]): DeletionPlan {
  if (others.length === 0) return { action: "delete_org" };
  const otherOwners = others.filter((m) => m.role === "owner");
  if (role === "owner" && otherOwners.length === 0) {
    return {
      action: "block",
      reason: "You're the only owner of a workspace that has other members. Transfer ownership to a teammate in Settings → Team before deleting your account, so they don't lose the workspace.",
    };
  }
  return { action: "leave" };
}
