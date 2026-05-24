import { describe, it, expect } from "vitest";
import { safeEqual, authorizeSecret } from "@/lib/security";

describe("safeEqual", () => {
  it("matches identical strings and rejects differences", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false); // length mismatch
  });
});

describe("authorizeSecret", () => {
  const make = (headers: Record<string, string> = {}, url = "https://x.test/api") =>
    new Request(url, { headers });

  it("denies when no secret is configured", () => {
    expect(authorizeSecret(make({ authorization: "Bearer anything" }), undefined)).toBe(false);
  });

  it("accepts a correct Bearer token", () => {
    expect(authorizeSecret(make({ authorization: "Bearer s3cret" }), "s3cret")).toBe(true);
  });

  it("accepts a correct ?token= query param", () => {
    expect(authorizeSecret(make({}, "https://x.test/api?token=s3cret"), "s3cret")).toBe(true);
  });

  it("rejects a wrong token", () => {
    expect(authorizeSecret(make({ authorization: "Bearer nope" }), "s3cret")).toBe(false);
  });
});
