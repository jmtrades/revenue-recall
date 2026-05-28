import type { MetadataRoute } from "next";
import { INDUSTRY_CATALOG } from "@/lib/industries/catalog";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://revenue-recall.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const industries: MetadataRoute.Sitemap = INDUSTRY_CATALOG.map((e) => ({
    url: `${BASE}/industries/${e.slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));
  return [
    { url: BASE, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/pricing`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE}/industries`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE}/signup`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    ...industries,
    { url: `${BASE}/security`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/login`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];
}
