import { describe, it, expect } from "vitest";
import { timezoneForPhone, prospectLocalHour, prospectLocalTime, outsideCourtesyWindow, COURTESY_START_HOUR, COURTESY_END_HOUR } from "@/lib/calls/local-time";

// June dates: US DST in effect everywhere except Arizona and Hawaii — which is
// exactly what makes the Phoenix/Denver pair below a real correctness check.
const NOON_NY = new Date("2026-06-12T16:00:00Z"); // 12pm New York · 9am LA

describe("timezoneForPhone", () => {
  it("reads NANP numbers in every common format", () => {
    expect(timezoneForPhone("+1 (212) 555-0100")).toBe("America/New_York");
    expect(timezoneForPhone("212-555-0100")).toBe("America/New_York");
    expect(timezoneForPhone("12125550100")).toBe("America/New_York");
    expect(timezoneForPhone("+14155550100")).toBe("America/Los_Angeles");
    expect(timezoneForPhone("(312) 555-0100")).toBe("America/Chicago");
    expect(timezoneForPhone("+13035550100")).toBe("America/Denver");
  });

  it("knows the no-DST and odd-offset zones", () => {
    expect(timezoneForPhone("+16025550100")).toBe("America/Phoenix"); // AZ — no DST
    expect(timezoneForPhone("+18085550100")).toBe("Pacific/Honolulu");
    expect(timezoneForPhone("+19075550100")).toBe("America/Anchorage");
    expect(timezoneForPhone("+13065550100")).toBe("America/Regina"); // SK — no DST
    expect(timezoneForPhone("+17095550100")).toBe("America/St_Johns"); // UTC-2:30 in summer
    expect(timezoneForPhone("+17875550100")).toBe("America/Puerto_Rico");
    expect(timezoneForPhone("+14165550100")).toBe("America/New_York"); // Toronto
  });

  it("returns null when the zone can't be known — toll-free, non-NANP, garbage", () => {
    expect(timezoneForPhone("+18005550100")).toBeNull();
    expect(timezoneForPhone("888-555-0100")).toBeNull();
    expect(timezoneForPhone("+442079460958")).toBeNull(); // UK
    expect(timezoneForPhone("+212522430000")).toBeNull(); // Morocco — +212 must not read as area code 212
    expect(timezoneForPhone("5555550100")).toBeNull(); // unassigned area code
    expect(timezoneForPhone("call me")).toBeNull();
    expect(timezoneForPhone("")).toBeNull();
    expect(timezoneForPhone(null)).toBeNull();
    expect(timezoneForPhone(undefined)).toBeNull();
  });
});

describe("courtesy window (TCPA 8am–9pm prospect-local)", () => {
  const DAWN_WEST = new Date("2026-06-12T12:00:00Z"); // 5am LA · 8am NY

  it("blocks dawn on the west coast while the east coast is already callable", () => {
    expect(outsideCourtesyWindow("+14155550100", DAWN_WEST)).toBe(true); // 5am SF
    expect(outsideCourtesyWindow("+12125550100", DAWN_WEST)).toBe(false); // 8:00am NY — opens exactly at 8
  });

  it("closes at 9pm sharp", () => {
    expect(outsideCourtesyWindow("+12125550100", new Date("2026-06-13T00:59:00Z"))).toBe(false); // 8:59pm NY
    expect(outsideCourtesyWindow("+12125550100", new Date("2026-06-13T01:30:00Z"))).toBe(true); // 9:30pm NY
  });

  it("gets Arizona right in June: 7am Phoenix is too early while 8am Denver is fine", () => {
    const t = new Date("2026-06-12T14:00:00Z");
    expect(outsideCourtesyWindow("+16025550100", t)).toBe(true); // Phoenix — MST year-round
    expect(outsideCourtesyWindow("+13035550100", t)).toBe(false); // Denver — MDT
  });

  it("fails open on unknown zones — org quiet hours still apply, the dialer never refuses to work", () => {
    expect(outsideCourtesyWindow("+18005550100", DAWN_WEST)).toBe(false);
    expect(outsideCourtesyWindow("+442079460958", DAWN_WEST)).toBe(false);
    expect(outsideCourtesyWindow(undefined, DAWN_WEST)).toBe(false);
  });

  it("exports the legal window", () => {
    expect(COURTESY_START_HOUR).toBe(8);
    expect(COURTESY_END_HOUR).toBe(21);
  });
});

describe("prospectLocalTime (the dialer chip)", () => {
  it("renders their wall clock and warns outside the window", () => {
    const lt = prospectLocalTime("+14155550100", new Date("2026-06-12T12:00:00Z"));
    expect(lt).toEqual({ label: "5:00 AM", hour: 5, warn: true });
    const ok = prospectLocalTime("+12125550100", NOON_NY);
    expect(ok).toEqual({ label: "12:00 PM", hour: 12, warn: false });
  });

  it("is null when the zone is unknown", () => {
    expect(prospectLocalTime("+18005550100", NOON_NY)).toBeNull();
    expect(prospectLocalHour("+18005550100", NOON_NY)).toBeNull();
  });
});
