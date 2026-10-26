import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  // When insidir.com forwards only the page paths to this service, ASSET_PREFIX (this service's own origin)
  // makes the browser load /_next assets from here directly. Unset, assets load from the same origin.
  assetPrefix: process.env.ASSET_PREFIX || undefined,
};

export default config;
