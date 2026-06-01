import { describe, it, expect, beforeEach } from "vitest";
import { quietHoursNow, guardrailConfig } from "@/lib/agent/guardrails";

beforeEach(() => {
  delete process.env.AGENT_QUIET_START_UTC;
  delete process.env.AGENT_QUIET_END_UTC;
  delete process.env.AGENT_TIMEZONE;
});

describe("timezone-aware quiet hours", () => {
  it("interprets the window in UTC by default", () => {
    process.env.AGENT_QUIET_START_UTC = "20";
    process.env.AGENT_QUIET_END_UTC = "23";
    // 22:00 UTC is inside 20–23.
    expect(quietHoursNow(new Date("2026-06-01T22:00:00Z"))).toBe(true);
    expect(quietHoursNow(new Date("2026-06-01T18:00:00Z"))).toBe(false);
  });

  it("shifts the window into AGENT_TIMEZONE when set", () => {
    process.env.AGENT_QUIET_START_UTC = "20";
    process.env.AGENT_QUIET_END_UTC = "23";
    process.env.AGENT_TIMEZONE = "America/New_York"; // June = UTC-4
    // 22:00 UTC = 18:00 ET → outside the 8pm–11pm local window.
    expect(quietHoursNow(new Date("2026-06-01T22:00:00Z"))).toBe(false);
    // 01:00 UTC = 21:00 ET (prev day) → inside the window.
    expect(quietHoursNow(new Date("2026-06-02T01:00:00Z"))).toBe(true);
  });

  it("falls back to UTC on an unknown timezone", () => {
    process.env.AGENT_QUIET_START_UTC = "20";
    process.env.AGENT_QUIET_END_UTC = "23";
    process.env.AGENT_TIMEZONE = "Not/AZone";
    expect(quietHoursNow(new Date("2026-06-01T22:00:00Z"))).toBe(true);
  });

  it("reports the timezone in guardrailConfig", () => {
    process.env.AGENT_QUIET_START_UTC = "20";
    process.env.AGENT_QUIET_END_UTC = "8";
    process.env.AGENT_TIMEZONE = "America/New_York";
    expect(guardrailConfig().quietHours).toBe("20:00–8:00 America/New_York");
  });
});
