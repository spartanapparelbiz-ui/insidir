/* Company pages open fast for the companies people actually look at: every 10 minutes the companies on members'
 * watchlists, then the most-searched large companies, are read ahead into the same caches the company page uses
 * (insider filings, the SEC filing list, financial facts and the company profile). Bounded per run, one company at a
 * time, and it stops as soon as people are waiting on the shared SEC request queue. Nothing here changes data; it
 * only fills caches that would otherwise be filled by the first visitor. */
import { query as queryDb } from "./db.mjs";
import { secBacklogMs } from "./sec.mjs";
import { getCompanyInsiders } from "./insiders.mjs";
import { resolveCompany, companyFactChanges, tickerIndex, tickerRecord } from "./intelligence.mjs";
import { getCompanyProfile } from "./company-profile.mjs";

export const POPULAR = Object.freeze(["NVDA", "AAPL", "MSFT", "GOOGL", "AMZN", "META", "TSLA", "AVGO", "JPM", "LLY", "V", "WMT", "XOM", "KO", "NFLX", "COST"]);

export async function warmCompanies({ run = queryDb, limit = 30, deadlineMs = 4 * 60_000, maxBacklogMs = 2000,
  load = { insiders: t => getCompanyInsiders(t), company: t => resolveCompany(t), facts: cik => companyFactChanges(cik), profile: cik => getCompanyProfile(cik), index: () => tickerIndex() } } = {}) {
  const until = Date.now() + deadlineMs, stats = { warmed: 0, failed: 0, yielded: false };
  const followed = (await run(`SELECT ticker,count(*)::int AS n FROM watchlist GROUP BY ticker ORDER BY n DESC,ticker LIMIT $1`, [limit]).catch(() => ({ rows: [] }))).rows.map(r => r.ticker);
  const tickers = [...new Set([...followed, ...POPULAR])].filter(t => /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(String(t || ""))).slice(0, limit);
  let index = null;
  try { index = await load.index(); } catch { return { ...stats, reason: "ticker index unavailable" }; }
  for (const t of tickers) {
    if (Date.now() > until || secBacklogMs() > maxBacklogMs) { stats.yielded = true; break; }
    const record = tickerRecord(index, t);
    if (!record) continue;
    const parts = await Promise.allSettled([load.insiders(t), load.company(t), load.facts(record.cik), load.profile(record.cik)]);
    if (parts.some(p => p.status === "rejected")) stats.failed++; else stats.warmed++;
  }
  return { ...stats, of: tickers.length };
}
