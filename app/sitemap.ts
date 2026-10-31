/* sitemap.xml: the public pages, plus the SEC pages with something to show (lib/profiles/store.ts sitemapSec):
 * every insider and company with a Form 4 trade filed in the last year, and every fund we track. Read on request,
 * so a new filing's pages are listed as soon as it's stored. */
import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/app-url";
import { getDb, hasDatabase } from "@/lib/db";
import { isReady } from "@/lib/features";
import { memo } from "@/lib/memo";
import { companyHref, fundHref, insiderHref } from "@/lib/profiles/name";
import { sitemapSec } from "@/lib/profiles/store";
import { trackerHref, TRACKERS } from "@/lib/trackers";

export const dynamic = "force-dynamic";

/** Pages anyone can open (no log-in), newest content first in importance. */
const PUBLIC_PATHS = ["/", "/trackers", ...TRACKERS.map(t => trackerHref(t.slug)), "/sports", "/markets", "/results", "/methodology", "/pricing", "/faq", "/help", "/about", "/data", "/status", "/security", "/disclosures", "/credits", "/changelog", "/privacy", "/terms"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appUrl();
  const out: MetadataRoute.Sitemap = [...PUBLIC_PATHS, ...(isReady("stocks") ? ["/stocks"] : [])].map(p => ({ url: `${base}${p}`, changeFrequency: "daily", priority: p === "/" ? 1 : 0.7 }));
  if (!hasDatabase()) return out;
  const sec = await memo("sitemap:sec", 10 * 60_000, () => sitemapSec(getDb(), new Date(Date.now() - 365 * 86_400_000))).catch(() => null);
  if (!sec) return out;
  for (const c of sec.companies) out.push({ url: `${base}${companyHref(c.ticker)}`, lastModified: c.at, changeFrequency: "daily", priority: 0.6 });
  for (const i of sec.insiders) out.push({ url: `${base}${insiderHref(i.cik, i.name)}`, lastModified: i.at, changeFrequency: "weekly", priority: 0.5 });
  for (const f of sec.funds) out.push({ url: `${base}${fundHref(f.cik, f.name)}`, lastModified: f.at, changeFrequency: "weekly", priority: 0.5 });
  return out;
}
