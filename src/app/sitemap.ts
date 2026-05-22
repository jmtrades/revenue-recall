import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://revenue-recall.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: BASE, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/login`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/signup`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
  ];
}
