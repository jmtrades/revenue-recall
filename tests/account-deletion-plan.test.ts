import { describe, it, expect } from "vitest";
import { planAccountDeletion } from "@/lib/account-deletion";

describe("planAccountDeletion", () => {
  it("erases the org when the user is its only member", () => {
    expect(planAccountDeletion("owner", [])).toEqual({ action: "delete_org" });
    expect(planAccountDeletion("admin", [])).toEqual({ action: "delete_org" });
  });

  it("blocks a sole owner from deleting a workspace that has other members", () => {
    const plan = planAccountDeletion("owner", [{ role: "admin" }, { role: "rep" }]);
    expect(plan.action).toBe("block");
  });

  it("lets an owner leave when another owner remains", () => {
    expect(planAccountDeletion("owner", [{ role: "owner" }]).action).toBe("leave");
  });

  it("lets a non-owner leave without touching the org", () => {
    expect(planAccountDeletion("rep", [{ role: "owner" }, { role: "admin" }]).action).toBe("leave");
    expect(planAccountDeletion("admin", [{ role: "owner" }]).action).toBe("leave");
  });
});
