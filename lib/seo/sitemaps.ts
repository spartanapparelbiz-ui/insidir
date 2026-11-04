/* The sitemaps, split by type (/sitemap.xml is the index, /sitemaps/<type>.xml each list), read from the database and
 * refreshed hourly. Only pages anyone can open with something to show: the main pages and every category, markets
 * with a millionaire bet or a large position in the last 30 days, and wallets on the watchlist. */
import { sql } from "drizzle-orm";
import { appUrl } from "@/lib/app-url";
import { getDb, hasDatabase } from "@/lib/db";
import { memo } from "@/lib/memo";
import { CATEGORIES } from "@/lib/brand/categories";

export const SITEMAP_TYPES = ["pages", "markets", "wallets"] as const;
export type SitemapType = (typeof SITEMAP_TYPES)[number];
export interface Url { loc: string; lastmod?: Date; changefreq?: "hourly" | "daily" | "weekly"; priority?: number }

const HOUR = 3_600_000;
/** Every public page on the keep list (test/routes.test.ts), and every category. */
export const PAGES = ["/", "/election", "/board", "/markets", ...CATEGORIES.map(c => `/markets/${c.slug}`), "/wallets", "/results", "/pricing",
  "/faq", "/methodology", "/data", "/status", "/security", "/disclosures", "/about", "/help", "/changelog", "/credits", "/terms", "/privacy"];

export async function sitemapUrls(type: SitemapType, now = Date.now()): Promise<Url[]> {
  const base = appUrl();
  if (type === "pages") return PAGES.map(p => ({ loc: `${base}${p}`, changefreq: p === "/" || p === "/board" ? "hourly" : "daily", priority: p === "/" ? 1 : 0.7 }));
  if (!hasDatabase()) return [];
  const db = getDb();
  if (type === "wallets") {
    const r = await memo("sitemap:wallets", HOUR, async () => (await db.execute(sql`select wallet, refreshed_at from terminal.watchlist order by pnl desc limit 20000`)).rows as Array<{ wallet: string; refreshed_at: string }>);
    return r.map(x => ({ loc: `${base}/wallet/${x.wallet}`, lastmod: new Date(x.refreshed_at), changefreq: "daily", priority: 0.5 }));
  }
  const r = await memo("sitemap:markets", HOUR, async () => (await db.execute(sql`select market_id, max(at) as at from (
      select market_id, at from terminal.millionaire_bets where at > ${new Date(now - 30 * 86_400_000)}
      union all
      select market_id, at from terminal.moves where hidden_at is null and source in ('polymarket', 'kalshi') and at > ${new Date(now - 30 * 86_400_000)}) x
    group by market_id order by max(at) desc limit 20000`)).rows as Array<{ market_id: string; at: string }>);
  return r.map(x => ({ loc: `${base}/market/${encodeURIComponent(x.market_id)}`, lastmod: new Date(x.at), changefreq: "hourly", priority: 0.5 }));
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export function urlsetXml(urls: Url[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `<url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod.toISOString()}</lastmod>` : ""}${u.changefreq ? `<changefreq>${u.changefreq}</changefreq>` : ""}${u.priority !== undefined ? `<priority>${u.priority}</priority>` : ""}</url>`).join("\n")}\n</urlset>\n`;
}
export function indexXml(now = Date.now()): string {
  const base = appUrl(), at = new Date(Math.floor(now / HOUR) * HOUR).toISOString();
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${SITEMAP_TYPES.map(t => `<sitemap><loc>${base}/sitemaps/${t}.xml</loc><lastmod>${at}</lastmod></sitemap>`).join("\n")}\n</sitemapindex>\n`;
}
