import { describe, it, expect } from "vitest";
import { reEngagementHint } from "@/lib/ai/draft";

describe("reEngagementHint — reactivation is tailored to WHY the deal went cold", () => {
  it("gives a distinct, reason-specific directive per recall reason", () => {
    const reasons = ["no_show", "going_cold", "stalled", "no_activity", "lost_winnable"];
    const hints = reasons.map(reEngagementHint);
    // Every reason maps to a non-empty directive, and they're all different.
    expect(hints.every((h) => h.length > 0)).toBe(true);
    expect(new Set(hints).size).toBe(reasons.length);
  });

  it("a no-show is treated as 'we missed each other', not a generic nudge", () => {
    const noShow = reEngagementHint("no_show");
    expect(noShow.toLowerCase()).toContain("missed each other");
    expect(noShow).not.toBe(reEngagementHint("going_cold"));
  });

  it("falls back to a generic re-engage directive for an unknown/absent reason", () => {
    expect(reEngagementHint(undefined)).toContain("re-engage");
    expect(reEngagementHint("weird")).toBe(reEngagementHint(undefined));
  });
});
