import { describe, it, expect, beforeEach } from "vitest";
import { personalizeFromDescription } from "@/lib/ai/onboard";

// No AI key → deterministic keyword fallback (the path that runs with no key).
beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe("personalizeFromDescription (keyword fallback)", () => {
  it("maps a real-estate description to the right industry", async () => {
    const p = await personalizeFromDescription("I'm a realtor helping buyers and sellers with home listings in Austin.");
    expect(p.industryId).toBe("real_estate");
    expect(p.ai).toBe(false);
    expect(p.monthlyQuota).toBeGreaterThan(0);
    expect(p.voiceTone.length).toBeGreaterThan(0);
  });

  it("maps SaaS / mortgage / insurance / auto / home services / agency", async () => {
    expect((await personalizeFromDescription("we sell B2B software, a SaaS platform with free trials")).industryId).toBe("saas");
    expect((await personalizeFromDescription("I'm a loan officer doing mortgage refinance")).industryId).toBe("mortgage");
    expect((await personalizeFromDescription("independent insurance agent, auto and home policies")).industryId).toBe("insurance");
    expect((await personalizeFromDescription("car dealership, test drives and trade-ins")).industryId).toBe("auto");
    expect((await personalizeFromDescription("HVAC and plumbing contractor, home estimates")).industryId).toBe("home_services");
    expect((await personalizeFromDescription("marketing agency doing client retainers")).industryId).toBe("agency");
  });

  it("falls back to generic when nothing matches", async () => {
    const p = await personalizeFromDescription("we do interesting things for interesting people");
    expect(p.industryId).toBe("generic");
  });

  it("lifts an org name when stated", async () => {
    const p = await personalizeFromDescription("We're Acme Realty, a real estate brokerage.");
    expect(p.orgName.toLowerCase()).toContain("acme");
    expect(p.industryId).toBe("real_estate");
  });

  it("extracts a real company name and ignores common-word phrases", async () => {
    // "called X" is a strong signal → the actual name.
    expect((await personalizeFromDescription("I run a brokerage in Austin called Lone Star Homes.")).orgName).toContain("Lone Star Homes");
    // No proper noun after the cue → empty, not junk like "a boutique real estate".
    expect((await personalizeFromDescription("I run a boutique real estate brokerage helping buyers.")).orgName).toBe("");
  });

  it("handles an empty description without throwing", async () => {
    const p = await personalizeFromDescription("");
    expect(p.industryId).toBe("generic");
    expect(p.sells).toBe("");
  });

  it("never returns an invalid industry id", async () => {
    const valid = new Set(["real_estate", "mortgage", "insurance", "saas", "agency", "auto", "home_services", "generic"]);
    for (const text of ["random", "a plumber", "selling software", ""]) {
      expect(valid.has((await personalizeFromDescription(text)).industryId)).toBe(true);
    }
  });
});
