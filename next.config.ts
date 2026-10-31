import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // next/image is only used for trader pictures (components/v2/Avatar.tsx): Polymarket's own image host (lib/moves/avatar.ts
  // AVATAR_HOST, checked by test/avatar.test.ts). Photos are plain <img>s straight from Unsplash's image CDN, which crops and
  // sizes them itself (components/Photo.tsx); it's listed here so any next/image use of a photo is allowed too.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "polymarket-upload.s3.us-east-2.amazonaws.com", port: "", pathname: "/**" },
      { protocol: "https", hostname: "images.unsplash.com", port: "", pathname: "/photo-*" },
    ],
    formats: ["image/webp"],
    deviceSizes: [96, 192],
    imageSizes: [40, 80],
    minimumCacheTTL: 86_400,
    dangerouslyAllowSVG: false,
  },
  // The worker, the scan script and xray/ are not part of the web build.
  outputFileTracingExcludes: { "*": ["xray/**", "worker/**", "scripts/**", "qa/**"] },
  // The share cards' embedded fonts and photo texture (lib/share-card.tsx reads them from disk).
  outputFileTracingIncludes: { "/api/share/**": ["./lib/og-assets/**"], "/dev/**": ["./lib/og-assets/**"], "/receipts/**": ["./lib/og-assets/**"], "/opengraph-image": ["./lib/og-assets/**"], "/trackers/**": ["./lib/og-assets/**"], "/market/**": ["./lib/og-assets/**"], "/p/**": ["./lib/og-assets/**"], "/insider-trading/**": ["./lib/og-assets/**"] },
  // Title and description always in <head> (not streamed in later), for every visitor and link preview.
  htmlLimitedBots: /.*/,
  // Pages a visitor has already seen (or that were prefetched) open instantly on the way back, for 30 seconds.
  experimental: { staleTimes: { dynamic: 30, static: 180 } },
  // How it works became Methodology.
  async redirects() {
    return [
      { source: "/how-it-works", destination: "/methodology", permanent: true },
      // A bare ticker (/NVDA, crawled from old links) is that company's insider trading page.
      { source: "/:ticker([A-Z][A-Z.]{0,5})", destination: "/insider-trading/:ticker", permanent: true },
    ];
  },
  // Apple Pay's domain verification file (from Whop, public/.well-known): exactly as is, as plain text.
  async headers() {
    return [{ source: "/.well-known/apple-developer-merchantid-domain-association", headers: [{ key: "Content-Type", value: "text/plain; charset=utf-8" }, { key: "Cache-Control", value: "public, max-age=3600" }] }];
  },
};

export default config;
