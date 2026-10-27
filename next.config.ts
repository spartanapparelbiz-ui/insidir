import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  // The worker, the scan script and xray/ are not part of the web build.
  outputFileTracingExcludes: { "*": ["xray/**", "worker/**", "scripts/**", "qa/**"] },
  // The share card's embedded font (lib/share-card.tsx reads it from disk).
  outputFileTracingIncludes: { "/api/share/**": ["./lib/og-fonts/**"], "/dev/**": ["./lib/og-fonts/**"], "/receipts/**": ["./lib/og-fonts/**"] },
  // Title and description always in <head> (not streamed in later), for every visitor and link preview.
  htmlLimitedBots: /.*/,
};

export default config;
