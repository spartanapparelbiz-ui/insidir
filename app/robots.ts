/* robots.txt: every public page is open to crawlers (trackers, companies, insiders, funds, accounts, markets,
 * positions, the feed); admin, account, sign-up and API paths are not. Points at the sitemap index. */
import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/app-url";

export const dynamic = "force-dynamic";

const DISALLOW = ["/api/", "/admin", "/dev/", "/auth/", "/following", "/settings", "/alerts", "/onboarding", "/pnl", "/receipts", "/gaps", "/check/history", "/login", "/start", "/welcome", "/signin", "/reset/", "/research"];

export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/", disallow: DISALLOW }], sitemap: `${appUrl()}/sitemap.xml` };
}
