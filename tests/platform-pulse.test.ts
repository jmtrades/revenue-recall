import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { pulseBody, isoWeekKey, runPlatformPulse, type PlatformStats } from "@/lib/platform-pulse";

const SAVED = { ...process.env };
beforeEach(() => {
  delete process.env.OPERATOR_EMAIL;
});
afterEach(() => {
  process.env = { ...SAVED };
});

const STATS: PlatformStats = {
  totalOrgs: 42,
  newOrgs7d: 5,
  paidSubs: 7,
  byPlan: { growth: 5, team: 2 },
  mrrUsd: 5 * 399 + 2 * 899, // 3,793 — five Operators (1 seat) + two Autopilots
  aiCostUsd7d: 38.4,
  aiActions7d: 1234,
  talkMinutes7d: 870,
};

describe("platform pulse body", () => {
  it("reads as the founder's scoreboard: workspaces, subs, MRR, usage, COGS", () => {
    const body = pulseBody(STATS);
    expect(body).toContain("Workspaces: 42 total · 5 new this week");
    expect(body).toContain("Paid subscriptions: 7 (Operator ×5 · Autopilot ×2)");
    expect(body).toContain("Estimated MRR: $3,793");
    expect(body).toContain("AI actions: 1,234 · talk minutes: 870");
    expect(body).toContain("AI + voice COGS: $38.40");
  });

  it("omits the plan breakdown cleanly when there are no paid subs", () => {
    const body = pulseBody({ ...STATS, paidSubs: 0, byPlan: {} });
    expect(body).toContain("Paid subscriptions: 0");
    expect(body).not.toContain("()");
  });
});

describe("ISO week key (the once-per-week dedupe unit)", () => {
  it("is stable within a week and rolls on Mondays", () => {
    expect(isoWeekKey(new Date("2026-06-08T13:00:00Z"))).toBe(isoWeekKey(new Date("2026-06-12T23:00:00Z"))); // Mon..Fri same week
    expect(isoWeekKey(new Date("2026-06-14T23:59:00Z"))).not.toBe(isoWeekKey(new Date("2026-06-15T00:01:00Z"))); // Sun → Mon rolls
  });

  it("handles the year boundary (ISO week 1 can start in December)", () => {
    expect(isoWeekKey(new Date("2025-12-29T12:00:00Z"))).toBe("2026-W01"); // Mon Dec 29 2025 is ISO 2026-W01
  });
});

describe("runPlatformPulse gating", () => {
  it("is inert without OPERATOR_EMAIL", async () => {
    expect(await runPlatformPulse(new Date("2026-06-15T14:00:00Z"))).toBe("n/a"); // a Monday, but no email set
  });

  it("only fires Mondays after 13:00 UTC", async () => {
    process.env.OPERATOR_EMAIL = "owner@example.com";
    // No Supabase in tests → n/a even on Monday; the day/hour gate is checked first
    // for non-Mondays, so those return not_monday regardless.
    expect(await runPlatformPulse(new Date("2026-06-16T14:00:00Z"))).toBe("not_monday"); // Tuesday
    expect(await runPlatformPulse(new Date("2026-06-15T08:00:00Z"))).toBe("not_monday"); // Monday, too early
  });
});
