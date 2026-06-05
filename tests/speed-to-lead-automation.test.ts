import { describe, it, expect, vi, beforeEach } from "vitest";

// Control the org's automation overrides to prove the toggle is a real master switch.
const { getOrgSettings } = vi.hoisted(() => ({ getOrgSettings: vi.fn() }));
vi.mock("@/lib/org", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/org")>();
  return { ...actual, getOrgSettings };
});

import { fireSpeedToLead } from "@/lib/agent/speed-to-lead";

beforeEach(() => getOrgSettings.mockReset());

describe("Speed-to-Lead respects the automation master switch", () => {
  it("does not fire when the org turned Speed-to-Lead off", async () => {
    getOrgSettings.mockResolvedValue({ industryId: "generic", automations: { speed_to_lead: false } });
    const res = await fireSpeedToLead("c_x");
    expect(res.enrolled).toBe(false);
    expect(res.reason).toBe("automation off");
  });

  it("proceeds (to the task gate) when the automation is on / default", async () => {
    getOrgSettings.mockResolvedValue({ industryId: "generic", automations: {} });
    const res = await fireSpeedToLead("c_y");
    // Default-on → not blocked by the automation switch; it falls through to the
    // on_new_lead task gate (no such task in this test → "no on_new_lead task").
    expect(res.reason).not.toBe("automation off");
  });
});
