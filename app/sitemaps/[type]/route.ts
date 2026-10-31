/* /sitemaps/<type>.xml: one sitemap by type (pages, trackers, companies, insiders, funds, traders, markets). */
import { SITEMAP_TYPES, sitemapUrls, urlsetXml, type SitemapType } from "@/lib/seo/sitemaps";

export const revalidate = 3600;
export async function GET(_req: Request, { params }: { params: Promise<{ type: string }> }) {
  const type = (await params).type.replace(/\.xml$/, "") as SitemapType;
  if (!SITEMAP_TYPES.includes(type)) return new Response("Not found", { status: 404 });
  const urls = await sitemapUrls(type).catch(() => []);
  return new Response(urlsetXml(urls), { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
