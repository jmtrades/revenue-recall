import { describe, it, expect } from "vitest";
import { topupPacksFor, perMessageCents, centsPerMessage, getTopupPack } from "@/lib/billing/topups";

describe("top-up per-unit economics", () => {
  it("computes cents per message and shows the volume discount", () => {
    // 1k pack: $29 / 1000 = 2.9¢; 5k: $99 / 5000 = ~2.0¢; 25k: $399 / 25000 = ~1.6¢.
    expect(centsPerMessage(getTopupPack("1k")!)).toBe(2.9);
    expect(centsPerMessage(getTopupPack("5k")!)).toBe(2.0);
    expect(centsPerMessage(getTopupPack("25k")!)).toBe(1.6);
    // The volume discount holds WITHIN each unit pool — messages and minutes
    // are different units, so their rates aren't comparable across pools.
    for (const unit of ["messages", "minutes"] as const) {
      const rates = topupPacksFor(unit).map(centsPerMessage);
      for (let i = 1; i < rates.length; i++) expect(rates[i], `${unit}[${i}]`).toBeLessThan(rates[i - 1]);
    }
  });

  it("is safe on degenerate input", () => {
    expect(perMessageCents(29, 0)).toBe(0);
    expect(perMessageCents(0, 1000)).toBe(0);
  });
});
