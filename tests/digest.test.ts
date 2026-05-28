import { describe, it, expect } from "vitest";
import { runDigests } from "@/lib/digest";

// No email provider configured in tests, so sends use the "log" transport and
// the built-in seed (which has users with emails) supplies recipients.
describe("scheduled digests", () => {
  it("sends opted-in digests once per day, dedups same day, resends next day", async () => {
    const first = await runDigests(new Date("2026-05-28T08:00:00Z"));
    expect(first.sent).toContain("daily_digest");
    expect(first.recipients).toBeGreaterThan(0);

    // Same calendar day: nothing should go out again.
    const same = await runDigests(new Date("2026-05-28T20:00:00Z"));
    expect(same.sent).toEqual([]);

    // New day: the digest is due again.
    const next = await runDigests(new Date("2026-05-29T08:00:00Z"));
    expect(next.sent).toContain("daily_digest");
  });
});
