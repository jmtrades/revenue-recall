import { describe, it, expect } from "vitest";
import { parseInviteEmails, normalizeRole, inviteToken, INVITE_ROLES } from "@/lib/invites";

describe("parseInviteEmails", () => {
  it("splits on commas, semicolons, and whitespace/newlines", () => {
    expect(parseInviteEmails("a@x.com, b@x.com; c@x.com\nd@x.com")).toEqual(["a@x.com", "b@x.com", "c@x.com", "d@x.com"]);
  });

  it("lowercases, trims, and de-duplicates", () => {
    expect(parseInviteEmails("  Pat@Acme.com \n pat@acme.com")).toEqual(["pat@acme.com"]);
  });

  it("drops invalid addresses", () => {
    expect(parseInviteEmails("good@x.com, not-an-email, also bad@, @bad.com")).toEqual(["good@x.com"]);
  });

  it("caps the batch size", () => {
    const many = Array.from({ length: 80 }, (_, i) => `u${i}@x.com`).join(",");
    expect(parseInviteEmails(many, 50)).toHaveLength(50);
  });

  it("is safe on empty / nullish input", () => {
    expect(parseInviteEmails("")).toEqual([]);
    expect(parseInviteEmails(undefined as unknown as string)).toEqual([]);
  });
});

describe("normalizeRole", () => {
  it("passes through valid roles", () => {
    for (const r of INVITE_ROLES) expect(normalizeRole(r)).toBe(r);
  });
  it("falls back to the safest role for anything else", () => {
    expect(normalizeRole("owner")).toBe("rep"); // owner is reserved, not invitable
    expect(normalizeRole("superadmin")).toBe("rep");
    expect(normalizeRole(undefined)).toBe("rep");
    expect(normalizeRole(42)).toBe("rep");
  });
});

describe("inviteToken", () => {
  it("is long, url-safe, and unique", () => {
    const a = inviteToken();
    const b = inviteToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[a-f0-9]+$/);
    expect(a.length).toBeGreaterThanOrEqual(32);
  });
});
