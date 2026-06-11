import { describe, it, expect } from "vitest";
import { runDigests, buildDailyDigest, wonBackLine } from "@/lib/digest";
import { getRecallOutcomes } from "@/lib/queries";

// No email provider configured in tests, so sends use the "log" transport and
// the built-in seed (which has users with emails) supplies recipients.
describe("scheduled digests", () => {
  it("sends opted-in digests once per day, dedups same day, resends next day", async () => {
    // After the morning send-hour (default 13:00 UTC).
    const first = await runDigests(new Date("2026-05-28T14:00:00Z"));
    expect(first.sent).toContain("daily_digest");
    expect(first.recipients).toBeGreaterThan(0);

    // Same calendar day: nothing should go out again.
    const same = await runDigests(new Date("2026-05-28T20:00:00Z"));
    expect(same.sent).toEqual([]);

    // New day: the digest is due again.
    const next = await runDigests(new Date("2026-05-29T14:00:00Z"));
    expect(next.sent).toContain("daily_digest");
  });

  it("does not send before the morning hour, so an hourly cron never emails at midnight", async () => {
    const early = await runDigests(new Date("2026-05-31T03:00:00Z")); // before the 13:00 UTC window
    expect(early.sent).toEqual([]);
  });
});

describe("won-back proof line", () => {
  it("formats realized wins with the in-play suffix", () => {
    expect(wonBackLine({ wonBack: 1, recoveredValue: 12000, inProgress: 0 }, "USD")).toBe(
      "  Won back: $12,000 across 1 deal recalled",
    );
    expect(wonBackLine({ wonBack: 3, recoveredValue: 47500, inProgress: 2 }, "USD")).toBe(
      "  Won back: $47,500 across 3 deals recalled — 2 more in play",
    );
  });

  it("returns null when nothing's been won back — an empty brag reads as a miss", () => {
    expect(wonBackLine({ wonBack: 0, recoveredValue: 0, inProgress: 5 }, "USD")).toBeNull();
    expect(wonBackLine(null, "USD")).toBeNull();
  });

  it("is wired into the daily digest exactly when outcomes have wins", async () => {
    const [{ body }, outcomes] = await Promise.all([buildDailyDigest("Acme"), getRecallOutcomes()]);
    if (outcomes.wonBack > 0) expect(body).toContain("Won back:");
    else expect(body).not.toContain("Won back:");
  });
});
