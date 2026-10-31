/* /sitemap.xml: the index of the sitemaps by type (lib/seo/sitemaps.ts), refreshed hourly. */
import { indexXml } from "@/lib/seo/sitemaps";

export const revalidate = 3600;
export function GET() {
  return new Response(indexXml(), { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
