import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { parseReferralCode, isAttributableReferral, referralLink, referralReward, REFERRAL_COOKIE } from "@/lib/referrals";

const UUID = "3b9a1c2d-4e5f-6a7b-8c9d-0e1f2a3b4c5d";

describe("parseReferralCode", () => {
  it("accepts a real org uuid (normalized to lowercase)", () => {
    expect(parseReferralCode(UUID)).toBe(UUID);
    expect(parseReferralCode(`  ${UUID.toUpperCase()}  `)).toBe(UUID);
  });
  it("rejects junk / non-uuid / empty so it can never reach a query", () => {
    for (const v of ["", "abc", "123", "<script>", UUID + "x", null, undefined]) {
      expect(parseReferralCode(v as string)).toBeNull();
    }
  });
});

describe("isAttributableReferral", () => {
  it("is true for a valid code that isn't the org referring itself", () => {
    expect(isAttributableReferral(UUID, "00000000-0000-0000-0000-000000000001")).toBe(true);
  });
  it("rejects self-referral (case-insensitive) and junk", () => {
    expect(isAttributableReferral(UUID, UUID)).toBe(false);
    expect(isAttributableReferral(UUID.toUpperCase(), UUID)).toBe(false);
    expect(isAttributableReferral("nope", "x")).toBe(false);
  });
});

describe("referralLink", () => {
  it("builds a /signup?ref= link on the given base", () => {
    expect(referralLink(UUID, "https://recall-touch.com")).toBe(`https://recall-touch.com/signup?ref=${UUID}`);
    expect(referralLink(UUID, "https://x.com/")).toBe(`https://x.com/signup?ref=${UUID}`); // trailing slash trimmed
  });
});

describe("referralReward", () => {
  const KEYS = ["REFERRAL_REWARD_REFERRER", "REFERRAL_REWARD_REFEREE"];
  beforeEach(() => KEYS.forEach((k) => delete process.env[k]));
  afterEach(() => KEYS.forEach((k) => delete process.env[k]));

  it("has conservative defaults (referrer gets more than the referee)", () => {
    const r = referralReward();
    expect(r.referrer).toBe(2000);
    expect(r.referee).toBe(1000);
  });
  it("is env-tunable", () => {
    process.env.REFERRAL_REWARD_REFERRER = "500";
    process.env.REFERRAL_REWARD_REFEREE = "0";
    expect(referralReward()).toEqual({ referrer: 500, referee: 0 });
  });
  it("ignores invalid env and falls back", () => {
    process.env.REFERRAL_REWARD_REFERRER = "-5";
    process.env.REFERRAL_REWARD_REFEREE = "abc";
    expect(referralReward()).toEqual({ referrer: 2000, referee: 1000 });
  });
});

describe("cookie name", () => {
  it("is stable", () => expect(REFERRAL_COOKIE).toBe("rr_ref"));
});
