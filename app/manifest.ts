import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Spitzer's Express",
    short_name: "Spitzer's",
    start_url: "/",
    display: "standalone",
    background_color: "#fffbe3",
    theme_color: "#ef4c23",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
