import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  // The worker, the scan script and xray/ are not part of the web build.
  outputFileTracingExcludes: { "*": ["xray/**", "worker/**", "scripts/**", "qa/**"] },
  // The share cards' embedded fonts and photo texture (lib/share-card.tsx reads them from disk).
  outputFileTracingIncludes: { "/api/share/**": ["./lib/og-assets/**"], "/dev/**": ["./lib/og-assets/**"], "/receipts/**": ["./lib/og-assets/**"], "/opengraph-image": ["./lib/og-assets/**"] },
  // Title and description always in <head> (not streamed in later), for every visitor and link preview.
  htmlLimitedBots: /.*/,
};

export default config;
