import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.recall-touch.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/dashboard", "/settings", "/recall", "/pipeline", "/leads", "/inbox", "/dialer", "/calendar", "/tasks", "/sequences", "/templates", "/automations", "/reports", "/forecast", "/deals"],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
