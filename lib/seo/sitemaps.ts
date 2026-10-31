/* The sitemaps, split by type (/sitemap.xml is the index, /sitemaps/<type>.xml each list), read from the database and
 * refreshed hourly. Only pages anyone can open with something to show: trackers, companies, insiders and funds with a
 * filing in the last year, accounts with a verified record, markets with large positions in the last 30 days. */
import { sql } from "drizzle-orm";
import { appUrl } from "@/lib/app-url";
import { getDb, hasDatabase } from "@/lib/db";
import { isReady } from "@/lib/features";
import { memo } from "@/lib/memo";
import { RECORD_MIN_RESOLVED } from "@/lib/moves/records";
import { companyHref, fundHref, insiderHref } from "@/lib/profiles/name";
import { sitemapSec } from "@/lib/profiles/store";
import { trackerHref, TRACKERS } from "@/lib/trackers";

export const SITEMAP_TYPES = ["pages", "trackers", "companies", "insiders", "funds", "traders", "markets"] as const;
export type SitemapType = (typeof SITEMAP_TYPES)[number];
export interface Url { loc: string; lastmod?: Date; changefreq?: "hourly" | "daily" | "weekly"; priority?: number }

const HOUR = 3_600_000;
const PAGES = ["/", "/trackers", "/open", "/top", "/results", "/feed", "/sports", "/markets", "/stocks", "/pricing", "/methodology", "/data", "/status", "/security", "/disclosures", "/about", "/help", "/faq", "/changelog", "/credits", "/terms", "/privacy"];

export async function sitemapUrls(type: SitemapType, now = Date.now()): Promise<Url[]> {
  const base = appUrl();
  if (type === "pages") return PAGES.filter(p => p !== "/stocks" || isReady("stocks")).map(p => ({ loc: `${base}${p}`, changefreq: p === "/" || p === "/open" || p === "/feed" ? "hourly" : "daily", priority: p === "/" ? 1 : 0.7 }));
  if (type === "trackers") return TRACKERS.filter(t => !t.needs || isReady(t.needs)).map(t => ({ loc: `${base}${trackerHref(t.slug)}`, changefreq: "hourly", priority: 0.8 }));
  if (!hasDatabase()) return [];
  const db = getDb();
  if (type === "companies" || type === "insiders" || type === "funds") {
    const sec = await memo("sitemap:sec", HOUR, () => sitemapSec(db, new Date(now - 365 * 86_400_000)));
    if (type === "companies") return sec.companies.map(c => ({ loc: `${base}${companyHref(c.ticker)}`, lastmod: c.at, changefreq: "daily", priority: 0.6 }));
    if (type === "insiders") return sec.insiders.map(i => ({ loc: `${base}${insiderHref(i.cik, i.name)}`, lastmod: i.at, changefreq: "weekly", priority: 0.5 }));
    return sec.funds.map(f => ({ loc: `${base}${fundHref(f.cik, f.name)}`, lastmod: f.at, changefreq: "weekly", priority: 0.5 }));
  }
  if (type === "traders") {
    const r = await memo("sitemap:traders", HOUR, async () => (await db.execute(sql`select wallet, updated_at from terminal.trader_records where resolved >= ${RECORD_MIN_RESOLVED} order by profit desc limit 20000`)).rows as Array<{ wallet: string; updated_at: string }>);
    return r.map(x => ({ loc: `${base}/p/${x.wallet}`, lastmod: new Date(x.updated_at), changefreq: "daily", priority: 0.5 }));
  }
  const r = await memo("sitemap:markets", HOUR, async () => (await db.execute(sql`select market_id, max(at) as at from terminal.moves where hidden_at is null and source in ('polymarket', 'kalshi') and at > ${new Date(now - 30 * 86_400_000)}
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
