import { describe, it, expect } from "vitest";
import { resolveBookingUrl } from "@/lib/voice";

/**
 * Which booking link the AI offers in outreach. An explicit custom link always
 * wins; otherwise the org's native booking page is used, but only once they've
 * turned scheduling on (≥1 enabled meeting type).
 */
describe("resolveBookingUrl (outreach booking-link precedence)", () => {
  const native = "https://app.example.com/book/org_1?k=abc";

  it("uses an explicit custom link above everything", () => {
    expect(resolveBookingUrl("https://calendly.com/sam", native, true)).toBe("https://calendly.com/sam");
    // A custom link is honored even if native scheduling isn't enabled.
    expect(resolveBookingUrl("https://calendly.com/sam", null, false)).toBe("https://calendly.com/sam");
  });

  it("falls back to the native link only when scheduling is enabled", () => {
    expect(resolveBookingUrl(undefined, native, true)).toBe(native);
    expect(resolveBookingUrl(undefined, native, false)).toBeUndefined(); // not opted in → no link
  });

  it("offers nothing when there's no link to offer", () => {
    expect(resolveBookingUrl(undefined, null, true)).toBeUndefined(); // enabled but no public URL configured
    expect(resolveBookingUrl(undefined, null, false)).toBeUndefined();
    expect(resolveBookingUrl("", native, false)).toBeUndefined(); // empty custom is not a link
  });
});
