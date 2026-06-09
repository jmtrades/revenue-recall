import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { clickToken, verifyClickToken, trackLinks } from "@/lib/tracking";
import { GET as redirect } from "@/app/api/t/route";

beforeEach(() => {
  process.env.ENCRYPTION_KEY = "test-key-at-least-16-chars-long";
  process.env.NEXT_PUBLIC_SITE_URL = "https://www.recall-touch.com";
});
afterEach(() => {
  delete process.env.ENCRYPTION_KEY;
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

describe("click tracking", () => {
  it("round-trips a signed token and rejects tampering", () => {
    const t = clickToken("https://example.com/case-study", { orgId: "o1", contactId: "c1", channel: "email" })!;
    const p = verifyClickToken(t)!;
    expect(p.u).toBe("https://example.com/case-study");
    expect(p.orgId).toBe("o1");
    expect(verifyClickToken(t.slice(0, -2) + "zz")).toBeNull();
    expect(verifyClickToken("garbage")).toBeNull();
  });

  it("cannot be used as an open redirect — only signed destinations resolve", async () => {
    const evil = Buffer.from(JSON.stringify({ u: "https://evil.example.com" })).toString("base64url");
    const res = await redirect(new Request(`https://www.recall-touch.com/api/t?d=${evil}.deadbeef`));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://www.recall-touch.com/"); // home, not the unsigned target
  });

  it("redirects a valid token to its destination", async () => {
    const t = clickToken("https://example.com/pricing", { orgId: "o1" })!;
    const res = await redirect(new Request(`https://www.recall-touch.com/api/t?d=${t}`));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://example.com/pricing");
  });

  it("rewrites body links but never our own machine links; no-ops unconfigured", () => {
    const body = "See https://example.com/deck and unsubscribe https://www.recall-touch.com/api/unsubscribe?t=x";
    const out = trackLinks(body, { orgId: "o1" });
    expect(out).toContain("https://www.recall-touch.com/api/t?d=");
    expect(out).toContain("/api/unsubscribe?t=x"); // untouched
    delete process.env.NEXT_PUBLIC_SITE_URL;
    expect(trackLinks(body, { orgId: "o1" })).toBe(body); // graceful no-op
  });
});
