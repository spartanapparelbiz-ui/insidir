import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  // The worker, the scan script and xray/ are not part of the web build.
  outputFileTracingExcludes: { "*": ["xray/**", "worker/**", "scripts/**"] },
};

export default config;
