import { describe, it, expect } from "vitest";
import { roleAllowed, requireRole } from "@/lib/authz";

describe("roleAllowed", () => {
  it("grants when the role is in the allowed set", () => {
    expect(roleAllowed("owner", ["owner", "admin"])).toBe(true);
    expect(roleAllowed("admin", ["owner", "admin"])).toBe(true);
  });
  it("denies reps, managers, and the role-less", () => {
    expect(roleAllowed("rep", ["owner", "admin"])).toBe(false);
    expect(roleAllowed("manager", ["owner", "admin"])).toBe(false);
    expect(roleAllowed(null, ["owner", "admin"])).toBe(false);
  });
});

describe("requireRole is demo-safe", () => {
  it("allows (null) when auth isn't enforced — no DB / open demo", async () => {
    // Supabase isn't configured in the test env → isAuthRequired() is false.
    expect(await requireRole("owner", "admin")).toBeNull();
  });
});
