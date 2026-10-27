/* The installable PWA manifest, served at /manifest.webmanifest (app/layout.tsx links it). */
import type { MetadataRoute } from "next";
import { WHAT_IS } from "@/lib/copy";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Insidir",
    short_name: "Insidir",
    description: WHAT_IS,
    start_url: "/feed",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0b0b12",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
