import { describe, it, expect } from "vitest";
import { acquireCronLock, releaseCronLock } from "@/lib/cron-lock";

describe("cron lock", () => {
  it("acquires as a no-op without a database (single-process demo must not block cadences)", async () => {
    expect(await acquireCronLock("cadence:test")).toBe(true);
    await releaseCronLock("cadence:test"); // must not throw without a DB
  });
});
