import { describe, it, expect } from "vitest";
import { runDigests } from "@/lib/digest";

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
