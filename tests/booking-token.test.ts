import { describe, it, expect, beforeEach } from "vitest";
import { bookingToken, verifyBookingToken, hostedBookingUrl, bookingEmbedSnippet } from "@/lib/meetings/token";
import { isPublicRoute } from "@/lib/route-access";

beforeEach(() => {
  process.env.UNSUBSCRIBE_SECRET = "test-secret";
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

describe("booking token", () => {
  it("verifies its own token and rejects tampering / cross-org reuse", () => {
    const t = bookingToken("org_1");
    expect(t).toBeTruthy();
    expect(verifyBookingToken("org_1", t)).toBe(true);
    expect(verifyBookingToken("org_1", t + "x")).toBe(false);
    expect(verifyBookingToken("org_2", t)).toBe(false); // a token for one org can't book another
    expect(verifyBookingToken("org_1", null)).toBe(false);
    expect(verifyBookingToken("", t)).toBe(false);
  });

  it("is distinct from the form token (different domain separation tag)", async () => {
    const { formToken } = await import("@/lib/forms");
    expect(bookingToken("org_1")).not.toBe(formToken("org_1"));
  });

  it("fails closed in production when no secret is configured (no forgeable constant)", () => {
    const prevEnv = process.env.NODE_ENV;
    delete process.env.UNSUBSCRIBE_SECRET;
    delete process.env.INBOUND_TOKEN;
    delete process.env.CRON_SECRET;
    process.env.NODE_ENV = "production";
    try {
      expect(bookingToken("org_1")).toBeNull();
      expect(verifyBookingToken("org_1", "anything")).toBe(false);
      expect(hostedBookingUrl("org_1")).toBeNull();
    } finally {
      process.env.NODE_ENV = prevEnv;
      process.env.UNSUBSCRIBE_SECRET = "test-secret";
    }
  });

  it("builds hosted URL + embed only when a public base is set", () => {
    expect(hostedBookingUrl("org_1")).toBeNull();
    expect(bookingEmbedSnippet("org_1")).toBeNull();
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com/";
    expect(hostedBookingUrl("org_1")).toContain("https://app.example.com/book/org_1?k=");
    // A meeting-type slug deep-links to that type.
    expect(hostedBookingUrl("org_1", "intro")).toContain("&t=intro");
    expect(bookingEmbedSnippet("org_1")).toContain("<iframe");
  });
});

describe("booking routes are publicly reachable (token-authed, not session-gated)", () => {
  it("the booking page and submit endpoint are public; the app stays gated", () => {
    expect(isPublicRoute("/book/org_1")).toBe(true);
    expect(isPublicRoute("/api/bookings/create")).toBe(true);
    // The in-app scheduling admin endpoints are NOT public.
    expect(isPublicRoute("/api/meetings/types")).toBe(false);
    expect(isPublicRoute("/dashboard")).toBe(false); // control
  });
});
