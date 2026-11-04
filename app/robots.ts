/* robots.txt: every public page is open to crawlers (the board, the election, markets, categories, wallets, the text
 * pages); admin, account, sign-up and API paths are not. Points at the sitemap index. */
import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/app-url";

export const dynamic = "force-dynamic";

const DISALLOW = ["/api/", "/admin", "/dev/", "/auth/", "/settings", "/copies", "/copy/", "/login", "/go", "/reset/"];

export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: "/", disallow: DISALLOW }], sitemap: `${appUrl()}/sitemap.xml` };
}
