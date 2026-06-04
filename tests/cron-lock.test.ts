import { describe, it, expect } from "vitest";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-lock";

describe("cron lock", () => {
  it("acquires (returns a fence) as a no-op without a database — must not block cadences", async () => {
    const fence = await acquireCronLock("cadence:test");
    expect(typeof fence).toBe("string"); // fence token, not null
    await releaseCronLock("cadence:test", fence as string); // must not throw without a DB
  });
});
