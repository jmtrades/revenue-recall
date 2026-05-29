import { describe, it, expect, afterEach } from "vitest";
import { SalesforceProvider, salesforceStageType, soqlEscape } from "@/lib/crm/providers/salesforce";

describe("soqlEscape", () => {
  it("escapes single quotes and backslashes (SOQL-injection guard)", () => {
    expect(soqlEscape("O'Brien")).toBe("O\\'Brien");
    expect(soqlEscape("a\\b")).toBe("a\\\\b");
    // A malicious id can't break out of the string literal.
    expect(soqlEscape("x' OR Name != '")).toBe("x\\' OR Name != \\'");
  });
  it("leaves clean ids untouched", () => {
    expect(soqlEscape("0065g00000ABCDEAA3")).toBe("0065g00000ABCDEAA3");
  });
});

describe("salesforceStageType", () => {
  it("maps won, lost, and open", () => {
    expect(salesforceStageType({ IsWon: true, IsClosed: true })).toEqual({ type: "won", probability: 1 });
    expect(salesforceStageType({ IsWon: false, IsClosed: true })).toEqual({ type: "lost", probability: 0 });
    expect(salesforceStageType({ IsClosed: false, DefaultProbability: 60 })).toEqual({ type: "open", probability: 0.6 });
  });
  it("defaults/clamps an open stage's probability", () => {
    expect(salesforceStageType({ IsClosed: false, DefaultProbability: null })).toEqual({ type: "open", probability: 0.5 });
    expect(salesforceStageType({ IsClosed: false, DefaultProbability: 150 })).toEqual({ type: "open", probability: 1 });
  });
});

describe("SalesforceProvider readiness", () => {
  const tok = process.env.SALESFORCE_ACCESS_TOKEN;
  const inst = process.env.SALESFORCE_INSTANCE_URL;
  afterEach(() => {
    process.env.SALESFORCE_ACCESS_TOKEN = tok ?? "";
    process.env.SALESFORCE_INSTANCE_URL = inst ?? "";
    if (tok === undefined) delete process.env.SALESFORCE_ACCESS_TOKEN;
    if (inst === undefined) delete process.env.SALESFORCE_INSTANCE_URL;
  });

  it("needs BOTH a token and an instance URL to be ready", () => {
    delete process.env.SALESFORCE_ACCESS_TOKEN;
    delete process.env.SALESFORCE_INSTANCE_URL;
    expect(new SalesforceProvider().info().ready).toBe(false);
    process.env.SALESFORCE_ACCESS_TOKEN = "tok";
    expect(new SalesforceProvider().info().ready).toBe(false); // no instance
    process.env.SALESFORCE_INSTANCE_URL = "https://x.my.salesforce.com";
    expect(new SalesforceProvider().info().ready).toBe(true);
  });
});
