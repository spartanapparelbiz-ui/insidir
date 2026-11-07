import type { NextConfig } from "next";

/** Retired routes and where each one goes now. /insiders is live again (docs/INSIDIR-V3.md §3): the old per-person
 *  pages (/insiders/<cik>-<name>) go to it until People (§3, step 4) has a page of its own. /check/<id>, /read/<id> and /read/open resolve the market (app/check,
 *  app/read). Query strings carry over (/welcome?status=succeeded lands on /go?status=succeeded). */
export const RETIRED: ReadonlyArray<readonly [string, string]> = [
  ["/check", "/board"], ["/check/history", "/board"], ["/check/:id/:rest+", "/board"], ["/read/:id/:rest+", "/board"],
  ["/trader/:wallet", "/wallet/:wallet"], ["/p/:id", "/wallet/:id"], ["/top", "/wallets"], ["/whales", "/wallets"],
  ["/trackers", "/wallets"], ["/trackers/:slug*", "/wallets"], ["/sports", "/board?cat=sports"],
  ["/stocks", "/board"], ["/company/:t*", "/board"], ["/insider-trading/:t*", "/board"], ["/insiders/:id+", "/insiders"],
  ["/funds/:id*", "/board"], ["/deal/:id*", "/board"], ["/terminal", "/board"], ["/research", "/board"],
  ["/discover", "/markets"], ["/feed", "/board"], ["/gaps", "/board"], ["/splits", "/board"], ["/splits/:rest*", "/board"],
  ["/open", "/board"], ["/position/:id*", "/board"], ["/pnl", "/copies"], ["/receipts", "/results"], ["/receipts/:rest*", "/results"],
  ["/library", "/copies"], ["/following", "/copies"], ["/alerts", "/settings"], ["/onboarding", "/settings"],
  ["/start", "/go"], ["/welcome", "/go"], ["/signin", "/login"],
];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // next/image serves the brand photos (public/brand/*.jpg, lib/brand/images.ts) as AVIF or WebP at the width each
  // screen needs, and trader pictures from Polymarket's own image host (lib/moves/avatar.ts AVATAR_HOST, checked by
  // test/avatar.test.ts). Older pages' photos are plain <img>s from Unsplash's image CDN (components/Photo.tsx).
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "polymarket-upload.s3.us-east-2.amazonaws.com", port: "", pathname: "/**" },
      { protocol: "https", hostname: "images.unsplash.com", port: "", pathname: "/photo-*" },
    ],
    formats: ["image/avif", "image/webp"],
    // 96/192 for avatars; the rest for cards and thumbnails. Never above 3840: the full-bleed stages use the pre-generated
    // AVIF/WebP at 1920/2880/3840 (scripts/brand-images.ts, components/brand/BrandPicture.tsx), so the optimizer never
    // builds a 5K or 6K image on request.
    deviceSizes: [96, 192, 390, 640, 828, 1080, 1280, 1672, 1920, 2560, 2880, 3840],
    imageSizes: [40, 80, 160, 320],
    qualities: [55, 60, 66, 75, 85, 90],
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
      // Retired routes (the old product). Every one is a 301; see test/routes.test.ts for the keep list.
      ...RETIRED.map(([source, destination]) => ({ source, destination, statusCode: 301 as const })),
    ];
  },
  // Apple Pay's domain verification file (from Whop, public/.well-known): exactly as is, as plain text.
  async headers() {
    return [{ source: "/.well-known/apple-developer-merchantid-domain-association", headers: [{ key: "Content-Type", value: "text/plain; charset=utf-8" }, { key: "Cache-Control", value: "public, max-age=3600" }] }];
  },
};

export default config;
