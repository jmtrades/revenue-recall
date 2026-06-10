import { describe, it, expect } from "vitest";
import { generateStaticParams, generateMetadata } from "@/app/industries/[slug]/page";
import { INDUSTRIES } from "@/lib/industries";
import sitemap from "@/app/sitemap";
import { isPublicRoute } from "@/lib/route-access";

const listed = INDUSTRIES.filter((i) => i.id !== "generic");

describe("per-industry landing pages", () => {
  it("generates a static param for every non-generic industry (hyphen slugs)", () => {
    const params = generateStaticParams();
    expect(params.length).toBe(listed.length);
    for (const i of listed) expect(params.some((p) => p.slug === i.id.replace(/_/g, "-"))).toBe(true);
    // No underscores leak into URLs.
    expect(params.every((p) => !p.slug.includes("_"))).toBe(true);
  });

  it("builds rich metadata per industry and empty for an unknown slug", () => {
    const m = generateMetadata({ params: { slug: "real-estate" } });
    expect(m.title).toMatch(/Real Estate/);
    expect(typeof m.description).toBe("string");
    expect(m.alternates?.canonical).toMatch(/\/industries\/real-estate$/);
    expect(generateMetadata({ params: { slug: "does-not-exist" } })).toEqual({});
  });

  it("lists every industry page in the sitemap", () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls.some((u) => u.endsWith("/industries"))).toBe(true);
    for (const i of listed) expect(urls.some((u) => u.endsWith(`/industries/${i.id.replace(/_/g, "-")}`))).toBe(true);
  });

  it("the industry pages are publicly reachable (not gated)", () => {
    expect(isPublicRoute("/industries")).toBe(true);
    expect(isPublicRoute("/industries/real-estate")).toBe(true);
    expect(isPublicRoute("/dashboard")).toBe(false); // control: app routes stay gated
  });
});
