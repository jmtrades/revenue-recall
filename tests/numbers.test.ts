import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { numbersConfigured, numbersProviderId, listOwnedNumbers, searchNumbers, buyNumber, outboundFromNumber, setNumberProvider } from "@/lib/numbers";

beforeEach(() => {
  delete process.env.NUMBERS_WEBHOOK_URL;
  delete process.env.OUTBOUND_FROM_NUMBER;
  setNumberProvider(null);
});
afterEach(() => setNumberProvider(null));

describe("phone numbers — BYO + provider seam", () => {
  it("reports not-configured with nothing connected", () => {
    expect(numbersConfigured()).toBe(false);
    expect(numbersProviderId()).toBe("none");
  });

  it("treats a bring-your-own number as owned even without a provider", async () => {
    process.env.OUTBOUND_FROM_NUMBER = "+15551230000";
    expect(outboundFromNumber()).toBe("+15551230000");
    const owned = await listOwnedNumbers();
    expect(owned).toHaveLength(1);
    expect(owned[0].number).toBe("+15551230000");
  });

  it("search/buy throw a clear error until a provider is connected", async () => {
    await expect(searchNumbers({ areaCode: "415" })).rejects.toThrow(/provider/i);
    await expect(buyNumber("+15551112222")).rejects.toThrow(/provider/i);
  });

  it("a registered provider powers search, buy, and list", async () => {
    setNumberProvider({
      id: "mine",
      available: () => true,
      search: async (o) => [{ number: `+1${o.areaCode}5550100`, status: "available", monthlyCostUsd: 2 }],
      buy: async (n) => ({ number: n, status: "owned" }),
      listOwned: async () => [{ number: "+15550000001", status: "owned" }],
    });
    expect(numbersConfigured()).toBe(true);
    expect(numbersProviderId()).toBe("mine");
    expect((await searchNumbers({ areaCode: "415" }))[0].number).toContain("415");
    expect((await buyNumber("+15551112222")).status).toBe("owned");
    expect(await listOwnedNumbers()).toHaveLength(1);
  });

  it("falls back to the webhook provider when its URL is set", () => {
    process.env.NUMBERS_WEBHOOK_URL = "https://hooks.example.com/numbers";
    expect(numbersConfigured()).toBe(true);
    expect(numbersProviderId()).toBe("webhook");
  });
});
