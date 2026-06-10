import type { MetadataRoute } from "next";
import { INDUSTRIES } from "@/lib/industries";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.recall-touch.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: BASE, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/signup`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/login`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/docs/api`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/industries`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    ...INDUSTRIES.filter((i) => i.id !== "generic").map((i) => ({
      url: `${BASE}/industries/${i.id.replace(/_/g, "-")}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    { url: `${BASE}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/security`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
