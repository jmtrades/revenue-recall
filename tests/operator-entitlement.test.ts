import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock only getSessionUser; keep every other auth export intact so the rest of
// the module graph (which also imports from @/lib/auth) is unaffected.
vi.mock("@/lib/auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/auth")>()),
  getSessionUser: vi.fn(),
}));

import { getSessionUser } from "@/lib/auth";
import { isOperator } from "@/lib/operator";
import { isEntitled } from "@/lib/billing/enforce";

const mockUser = (email: string | null) =>
  (getSessionUser as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(email ? { email } : null);

beforeEach(() => {
  process.env.BILLING_ENFORCE = "true"; // enforcement ON — the gating case
  delete process.env.SAMPLE_DATA_EMAILS;
  delete process.env.OPERATOR_EMAIL;
});
afterEach(() => {
  delete process.env.BILLING_ENFORCE;
  vi.clearAllMocks();
});

describe("operator entitlement bypass — owner is never locked out of their own product", () => {
  it("the default operator is fully entitled even under enforcement", async () => {
    mockUser("jmtrades1990@gmail.com");
    expect(await isOperator()).toBe(true);
    expect(await isEntitled("aiLive")).toBe(true); // ElevenLabs voice works for the owner
    expect(await isEntitled("autopilot")).toBe(true);
  });

  it("the second owner's REAL sign-in address is fully entitled (calling + AI), no env set", async () => {
    // The live account that actually signs in is elixiiaperfumes@gmail.com (el-i-xii…).
    mockUser("elixiiaperfumes@gmail.com");
    expect(await isOperator()).toBe(true);
    expect(await isEntitled("aiLive")).toBe(true);
    expect(await isEntitled("autopilot")).toBe(true);
  });

  it("the shorter alias spelling also resolves to an owner", async () => {
    mockUser("elxiiaperfumes@gmail.com");
    expect(await isOperator()).toBe(true);
  });

  it("a normal customer is still gated under enforcement", async () => {
    mockUser("customer@acme.com");
    expect(await isOperator()).toBe(false);
    expect(await isEntitled("aiLive")).toBe(false);
  });

  it("honors an OPERATOR_EMAIL override (case-insensitive)", async () => {
    process.env.OPERATOR_EMAIL = "Owner@Co.com";
    mockUser("owner@co.com");
    expect(await isOperator()).toBe(true);
    expect(await isEntitled("aiLive")).toBe(true);
  });

  it("no session (cron/service context) is not the operator → normal gating applies", async () => {
    mockUser(null);
    expect(await isOperator()).toBe(false);
    expect(await isEntitled("aiLive")).toBe(false);
  });
});
