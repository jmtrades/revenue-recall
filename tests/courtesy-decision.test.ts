import { describe, it, expect } from "vitest";
import { courtesyCallDecision } from "@/lib/calls/local-time";

// 2026-06-12T07:00:00Z → 03:00 in New York (EDT), 00:00 in Los Angeles (PDT).
const NIGHT_US = new Date("2026-06-12T07:00:00Z");
// 2026-06-12T16:00:00Z → 12:00 in New York, 09:00 in Los Angeles.
const MIDDAY_US = new Date("2026-06-12T16:00:00Z");

describe("courtesyCallDecision — the hard 8am–9pm gate every dial path shares", () => {
  it("blocks a known prospect zone outside the window", () => {
    const d = courtesyCallDecision("+12125551234", "America/Chicago", NIGHT_US);
    expect(d.allowed).toBe(false);
    expect(d.basis).toBe("prospect");
    expect(d.hour).toBe(3);
  });

  it("allows a known prospect zone inside the window", () => {
    const d = courtesyCallDecision("+12125551234", undefined, MIDDAY_US);
    expect(d.allowed).toBe(true);
    expect(d.basis).toBe("prospect");
  });

  it("prospect zone wins over the org zone (NY org dialing SF at 9am NY = 6am SF)", () => {
    // 13:00Z → 09:00 New York, 06:00 Los Angeles.
    const d = courtesyCallDecision("+14155551234", "America/New_York", new Date("2026-06-12T13:00:00Z"));
    expect(d.allowed).toBe(false);
    expect(d.basis).toBe("prospect");
    expect(d.hour).toBe(6);
  });

  it("unknown zones fall back to the ORG clock — never open", () => {
    // +44 (UK) number: no NANP zone. Org in LA where it's midnight → blocked.
    const d = courtesyCallDecision("+442071234567", "America/Los_Angeles", NIGHT_US);
    expect(d.allowed).toBe(false);
    expect(d.basis).toBe("org");
    expect(d.hour).toBe(0);
  });

  it("unknown zone + org clock inside the window allows", () => {
    const d = courtesyCallDecision("+442071234567", "America/New_York", MIDDAY_US);
    expect(d.allowed).toBe(true);
    expect(d.basis).toBe("org");
  });

  it("unknown zone with no org timezone falls back to UTC, still gated", () => {
    const blocked = courtesyCallDecision("+442071234567", undefined, NIGHT_US); // 07:00 UTC
    expect(blocked.allowed).toBe(false);
    expect(blocked.basis).toBe("utc");
    const ok = courtesyCallDecision("+442071234567", null, MIDDAY_US); // 16:00 UTC
    expect(ok.allowed).toBe(true);
  });

  it("no phone at all gates on the org clock (never open)", () => {
    expect(courtesyCallDecision(undefined, "America/New_York", NIGHT_US).allowed).toBe(false);
    expect(courtesyCallDecision(null, "America/New_York", MIDDAY_US).allowed).toBe(true);
  });
});
