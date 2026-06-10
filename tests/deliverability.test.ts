import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({ txt: {} as Record<string, string[][]>, fail: false }));

vi.mock("node:dns", () => ({
  promises: {
    resolveTxt: vi.fn(async (name: string) => {
      if (h.fail) throw new Error("ENOTFOUND");
      const v = h.txt[name];
      if (!v) throw new Error("ENODATA");
      return v;
    }),
  },
}));

import { sendingAddress, sendingDomain, expectedRecords, checkDomainAuth } from "@/lib/deliverability";

beforeEach(() => {
  h.txt = {};
  h.fail = false;
  delete process.env.EMAIL_FROM;
});
afterEach(() => {
  delete process.env.EMAIL_FROM;
});

describe("sendingAddress / sendingDomain", () => {
  it("parses a bare address and a 'Name <addr>' form", () => {
    process.env.EMAIL_FROM = "hi@acme.com";
    expect(sendingAddress()).toBe("hi@acme.com");
    expect(sendingDomain()).toBe("acme.com");
    process.env.EMAIL_FROM = "Acme Sales <Sales@Acme.com>";
    expect(sendingDomain()).toBe("acme.com"); // lowercased
  });

  it("returns null for missing or malformed EMAIL_FROM", () => {
    expect(sendingDomain()).toBeNull();
    process.env.EMAIL_FROM = "not-an-email";
    expect(sendingAddress()).toBeNull();
    expect(sendingDomain()).toBeNull();
  });
});

describe("expectedRecords", () => {
  it("tailors the SPF include to the provider and always includes SPF/DKIM/DMARC", () => {
    const resend = expectedRecords("acme.com", "resend");
    expect(resend.map((r) => r.label)).toEqual(["SPF", "DKIM", "DMARC"]);
    expect(resend.find((r) => r.label === "SPF")!.value).toContain("include:amazonses.com");
    expect(expectedRecords("acme.com", "sendgrid").find((r) => r.label === "SPF")!.value).toContain("include:sendgrid.net");
    expect(resend.find((r) => r.label === "DMARC")!.value).toContain("v=DMARC1");
    expect(resend.find((r) => r.label === "DMARC")!.host).toBe("_dmarc");
  });

  it("falls back to a generic SPF when the provider is unknown", () => {
    expect(expectedRecords("acme.com", "log").find((r) => r.label === "SPF")!.value).toBe("v=spf1 ~all");
  });
});

describe("checkDomainAuth", () => {
  it("detects SPF and DMARC when present", async () => {
    h.txt["acme.com"] = [["v=spf1 include:sendgrid.net ~all"]];
    h.txt["_dmarc.acme.com"] = [["v=DMARC1; p=none"]];
    const s = await checkDomainAuth("acme.com");
    expect(s.spf.ok).toBe(true);
    expect(s.spf.record).toContain("v=spf1");
    expect(s.dmarc.ok).toBe(true);
    expect(s.unavailable).toBe(false);
  });

  it("reports missing records when the TXT exists but lacks them", async () => {
    h.txt["acme.com"] = [["some-other-verification=abc"]];
    h.txt["_dmarc.acme.com"] = [["not-dmarc"]];
    const s = await checkDomainAuth("acme.com");
    expect(s.spf.ok).toBe(false);
    expect(s.dmarc.ok).toBe(false);
    expect(s.unavailable).toBe(false);
  });

  it("flags unavailable (not 'missing') when DNS can't be reached", async () => {
    h.fail = true;
    const s = await checkDomainAuth("acme.com");
    expect(s.spf.ok).toBe(false);
    expect(s.unavailable).toBe(true);
  });

  it("joins multi-string TXT chunks before matching", async () => {
    h.txt["acme.com"] = [["v=spf1 ", "include:amazonses.com ~all"]];
    h.txt["_dmarc.acme.com"] = [["v=DMARC1; p=reject"]];
    const s = await checkDomainAuth("acme.com");
    expect(s.spf.ok).toBe(true);
    expect(s.spf.record).toBe("v=spf1 include:amazonses.com ~all");
  });
});
