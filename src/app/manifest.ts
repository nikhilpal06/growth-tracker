import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Growth Tracker",
    short_name: "Growth",
    description: "Track a child's stature and weight on the CDC 2 to 20 years growth charts.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f5f7",
    theme_color: "#0f6f9b",
    icons: [{ src: "/apple-icon.png", sizes: "180x180", type: "image/png" }, { src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
