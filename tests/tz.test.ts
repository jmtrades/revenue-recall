import { describe, it, expect } from "vitest";
import { hourInZone, dayInZone, isValidTimeZone } from "@/lib/tz";

describe("timezone helpers", () => {
  it("hourInZone returns the local hour, UTC fallback when no tz", () => {
    const t = new Date("2026-05-28T23:30:00Z");
    expect(hourInZone(t)).toBe(23); // no tz → UTC
    expect(hourInZone(t, "Asia/Tokyo")).toBe(8); // UTC+9 → next morning
    expect(hourInZone(t, "America/Los_Angeles")).toBe(16); // UTC-7 (DST)
    expect(hourInZone(t, "Not/AZone")).toBe(23); // bad tz → UTC fallback
  });

  it("dayInZone returns the LOCAL calendar day (the dedup key)", () => {
    const t = new Date("2026-05-28T23:30:00Z");
    expect(dayInZone(t)).toBe("2026-05-28"); // no tz → UTC day
    // 23:30Z is already the NEXT day in Tokyo — the reason UTC-day dedup is wrong.
    expect(dayInZone(t, "Asia/Tokyo")).toBe("2026-05-29");
    expect(dayInZone(t, "America/Los_Angeles")).toBe("2026-05-28");
  });

  it("isValidTimeZone accepts IANA zones and rejects junk", () => {
    expect(isValidTimeZone("Europe/London")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});
