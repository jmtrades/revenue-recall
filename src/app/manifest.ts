import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Revenue Recall",
    short_name: "Revenue Recall",
    description: "Autonomous outbound that recovers the revenue you're about to lose — for any CRM, any industry.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0a0b0a",
    theme_color: "#0a0b0a",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
