import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { runDigests } from "@/lib/digest";

// The demo org (no Supabase) takes its timezone from AGENT_TIMEZONE. Use a zone
// well ahead of UTC (Tokyo, UTC+9) to prove the digest fires at LOCAL morning and
// dedups per LOCAL day — so it never double-sends when the UTC date rolls over in
// the middle of the org's local day.
beforeAll(() => {
  delete process.env.ANTHROPIC_API_KEY;
  process.env.AGENT_TIMEZONE = "Asia/Tokyo";
});
afterAll(() => {
  delete process.env.AGENT_TIMEZONE;
});

describe("timezone-aware digest", () => {
  it("sends at the org's local morning and dedups per LOCAL day", async () => {
    // 23:30Z = 08:30 Tokyo (the next local day) → fires (local hour 8 ≥ 8).
    const fires = await runDigests(new Date("2026-06-08T23:30:00Z"));
    expect(fires.sent).toContain("daily_digest");
    expect(fires.recipients).toBeGreaterThan(0);

    // 00:30Z = 09:30 Tokyo — the UTC date rolled over, but it's the SAME Tokyo day,
    // so a UTC-date dedup would wrongly re-send. The local-day dedup must not.
    const sameLocalDay = await runDigests(new Date("2026-06-09T00:30:00Z"));
    expect(sameLocalDay.sent).toEqual([]);

    // 22:00Z = 07:00 Tokyo the next local day — before the 8am local window.
    const tooEarly = await runDigests(new Date("2026-06-09T22:00:00Z"));
    expect(tooEarly.sent).toEqual([]);
  });
});
