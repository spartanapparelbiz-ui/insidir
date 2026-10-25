/* The installable PWA manifest, served at /manifest.webmanifest (app/layout.tsx links it). */
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Insidir Terminal",
    short_name: "Insidir",
    description: "Prices on Polymarket and Kalshi that lock in a profit after fees, if both sides fill and both markets settle the same way.",
    start_url: "/terminal",
    scope: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
