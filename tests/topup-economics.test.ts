import { describe, it, expect } from "vitest";
import { TOPUP_PACKS, perMessageCents, centsPerMessage, getTopupPack } from "@/lib/billing/topups";

describe("top-up per-message economics", () => {
  it("computes cents per message and shows the volume discount", () => {
    // 1k pack: $29 / 1000 = 2.9¢; 5k: $99 / 5000 = ~2.0¢; 25k: $399 / 25000 = ~1.6¢.
    expect(centsPerMessage(getTopupPack("1k")!)).toBe(2.9);
    expect(centsPerMessage(getTopupPack("5k")!)).toBe(2.0);
    expect(centsPerMessage(getTopupPack("25k")!)).toBe(1.6);
    // Bigger packs are strictly cheaper per message.
    const rates = TOPUP_PACKS.map(centsPerMessage);
    for (let i = 1; i < rates.length; i++) expect(rates[i]).toBeLessThan(rates[i - 1]);
  });

  it("is safe on degenerate input", () => {
    expect(perMessageCents(29, 0)).toBe(0);
    expect(perMessageCents(0, 1000)).toBe(0);
  });
});
