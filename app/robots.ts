/* robots.txt: the public pages are open to crawlers; the app, the API and account pages are not. Points at sitemap.xml. */
import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/app-url";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/dev/", "/feed", "/following", "/settings", "/alerts", "/onboarding", "/pnl", "/p/", "/login", "/start", "/welcome", "/auth/"] }],
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
