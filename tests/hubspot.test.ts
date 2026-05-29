import { describe, it, expect, afterEach } from "vitest";
import { HubspotProvider, hubspotStageType, hubspotAmount } from "@/lib/crm/providers/hubspot";

describe("hubspotStageType", () => {
  it("maps an open stage with a decimal probability", () => {
    expect(hubspotStageType({ isClosed: "false", probability: "0.4" })).toEqual({ type: "open", probability: 0.4 });
  });

  it("maps closed-won and closed-lost", () => {
    expect(hubspotStageType({ isClosed: "true", probability: "1.0" })).toEqual({ type: "won", probability: 1 });
    expect(hubspotStageType({ isClosed: "true", probability: "0.0" })).toEqual({ type: "lost", probability: 0 });
  });

  it("clamps and defaults missing/garbage metadata", () => {
    expect(hubspotStageType(undefined)).toEqual({ type: "open", probability: 0.5 });
    expect(hubspotStageType({ isClosed: "false", probability: "2" })).toEqual({ type: "open", probability: 1 });
    expect(hubspotStageType({ isClosed: "false", probability: "nope" })).toEqual({ type: "open", probability: 0.5 });
  });
});

describe("hubspotAmount", () => {
  it("parses a string amount in major units", () => {
    expect(hubspotAmount("5000")).toBe(5000);
    expect(hubspotAmount("1234.56")).toBe(1234.56);
  });
  it("is 0 for missing/garbage", () => {
    expect(hubspotAmount(null)).toBe(0);
    expect(hubspotAmount(undefined)).toBe(0);
    expect(hubspotAmount("n/a")).toBe(0);
  });
});

describe("HubspotProvider readiness", () => {
  const original = process.env.HUBSPOT_ACCESS_TOKEN;
  afterEach(() => {
    if (original === undefined) delete process.env.HUBSPOT_ACCESS_TOKEN;
    else process.env.HUBSPOT_ACCESS_TOKEN = original;
  });

  it("is not ready without a token, ready with one", () => {
    delete process.env.HUBSPOT_ACCESS_TOKEN;
    expect(new HubspotProvider().info().ready).toBe(false);
    process.env.HUBSPOT_ACCESS_TOKEN = "pat-test-123";
    const info = new HubspotProvider().info();
    expect(info.ready).toBe(true);
    expect(info.id).toBe("hubspot");
    expect(info.capabilities.write).toBe(true);
  });
});
