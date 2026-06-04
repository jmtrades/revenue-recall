import { describe, it, expect } from "vitest";
import nextConfig from "../next.config.mjs";

/**
 * Locks the framing policy: the embeddable lead form (/f/*) must be framable on
 * any site (no X-Frame-Options, CSP frame-ancestors *), while every other route
 * keeps the locked-down SAMEORIGIN default. A regression here either breaks the
 * embed (#81) or opens the whole app to clickjacking.
 */
describe("security header framing policy", () => {
  it("makes /f/* framable anywhere but keeps the app SAMEORIGIN", async () => {
    const rules = await nextConfig.headers();
    const form = rules.find((r: { source: string }) => r.source.startsWith("/f/"));
    const general = rules.find((r: { source: string }) => r.source.includes("(?!f/)"));
    expect(form).toBeTruthy();
    expect(general).toBeTruthy();

    const formHeaders = Object.fromEntries(form.headers.map((h: { key: string; value: string }) => [h.key, h.value]));
    const generalHeaders = Object.fromEntries(general.headers.map((h: { key: string; value: string }) => [h.key, h.value]));

    // Form: no XFO, and CSP allows any ancestor.
    expect(formHeaders["X-Frame-Options"]).toBeUndefined();
    expect(formHeaders["Content-Security-Policy"]).toContain("frame-ancestors *");

    // App: SAMEORIGIN + CSP frame-ancestors 'self'.
    expect(generalHeaders["X-Frame-Options"]).toBe("SAMEORIGIN");
    expect(generalHeaders["Content-Security-Policy"]).toContain("frame-ancestors 'self'");

    // Both keep the core hardening headers.
    for (const h of [formHeaders, generalHeaders]) {
      expect(h["X-Content-Type-Options"]).toBe("nosniff");
      expect(h["Strict-Transport-Security"]).toContain("max-age=");
    }
  });
});
