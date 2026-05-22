import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Revenue Recall",
    short_name: "Revenue Recall",
    description: "The universal sales OS that recovers the revenue you're about to lose.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0b0e14",
    theme_color: "#0b0e14",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
