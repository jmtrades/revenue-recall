import { describe, it, expect, beforeEach } from "vitest";
import { appendEmailCompliance, appendSmsCompliance, complianceConfig } from "@/lib/compliance";
import { isHardOptOut } from "@/lib/agent/guardrails";

beforeEach(() => {
  delete process.env.OUTBOUND_COMPLIANCE;
  delete process.env.OUTBOUND_ORG_NAME;
  delete process.env.NEXT_PUBLIC_ORG_NAME;
  delete process.env.COMPLIANCE_ADDRESS;
});

describe("email compliance footer", () => {
  it("adds an unsubscribe line (and org + address when set)", () => {
    process.env.OUTBOUND_ORG_NAME = "Acme Realty";
    process.env.COMPLIANCE_ADDRESS = "1 Main St, Springfield";
    const out = appendEmailCompliance("Hey Jordan, quick one.");
    expect(out).toContain("Hey Jordan, quick one.");
    expect(out.toLowerCase()).toContain("unsubscribe");
    expect(out).toContain("Acme Realty");
    expect(out).toContain("1 Main St, Springfield");
  });

  it("is idempotent — won't double-append when opt-out language already present", () => {
    const body = "Hey — reply unsubscribe to opt out.";
    expect(appendEmailCompliance(body)).toBe(body);
  });

  it("can be disabled", () => {
    process.env.OUTBOUND_COMPLIANCE = "false";
    expect(appendEmailCompliance("hi")).toBe("hi");
  });

  it("per-org override wins over env (multi-tenant identity)", () => {
    process.env.OUTBOUND_ORG_NAME = "Global Co";
    process.env.COMPLIANCE_ADDRESS = "1 Global Plaza";
    const cfg = complianceConfig({ orgName: "Tenant Realty", address: "9 Tenant Way" });
    expect(cfg.orgName).toBe("Tenant Realty");
    expect(cfg.address).toBe("9 Tenant Way");
    const out = appendEmailCompliance("Hi.", null, cfg);
    expect(out).toContain("Tenant Realty");
    expect(out).toContain("9 Tenant Way");
    expect(out).not.toContain("Global Co");
  });

  it("falls back to env when the org override is empty", () => {
    process.env.OUTBOUND_ORG_NAME = "Global Co";
    expect(complianceConfig({}).orgName).toBe("Global Co");
    expect(complianceConfig({ orgName: "" }).orgName).toBe("Global Co");
  });
});

describe("sms compliance", () => {
  it('appends "Reply STOP to opt out" once', () => {
    const out = appendSmsCompliance("hey jordan, free thursday?");
    expect(out.toLowerCase()).toContain("stop");
    // idempotent
    expect(appendSmsCompliance(out)).toBe(out);
  });

  it("respects the disable flag", () => {
    process.env.OUTBOUND_COMPLIANCE = "false";
    expect(appendSmsCompliance("hi")).toBe("hi");
  });

  it("defaults to enabled", () => {
    expect(complianceConfig().enabled).toBe(true);
  });
});

describe("standard SMS opt-out keywords are honored", () => {
  it("treats bare STOP / UNSUBSCRIBE / CANCEL / QUIT / END as a hard opt-out", () => {
    for (const kw of ["STOP", "stop", "Stop.", "unsubscribe", "CANCEL", "quit", "end", "STOPALL", "remove"]) {
      expect(isHardOptOut(kw), kw).toBe(true);
    }
  });

  it("honors opt-out keywords wrapped in politeness or repeated (real STOP replies)", () => {
    for (const msg of [
      "STOP please",
      "please STOP",
      "STOP STOP STOP",
      "unsubscribe me thanks",
      "cancel pls",
      "stop now",
      "STOP!",
      "please unsubscribe me",
    ]) {
      expect(isHardOptOut(msg), msg).toBe(true);
    }
  });

  it("does not over-trigger on normal sentences containing those words", () => {
    expect(isHardOptOut("don't stop sending these, they're great")).toBe(false);
    expect(isHardOptOut("can we end the call with next steps?")).toBe(false);
    expect(isHardOptOut("not interested right now")).toBe(false); // soft decline, re-engageable
    expect(isHardOptOut("stop by my office at 3pm")).toBe(false); // "stop" mid-sentence, a real lead
    expect(isHardOptOut("can you remove the typo on the quote?")).toBe(false);
  });
});
