/* Profiles in Postgres (terminal schema): a Polymarket trader's resolved positions, the /top ranking, an insider's
 * Form 4 trades and a fund's 13F holdings. Server only. */
import { and, asc, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { fundFilings, fundHoldings, funds, insiderTrades, moves, secHistory, trackedWallets, traderPositions, traderRecords } from "@/lib/db/schema";
import type { Close } from "./sec";
import { RECORD_MIN_RESOLVED } from "@/lib/moves/records";
import type { TraderRecord } from "@/lib/moves/types";
import { categoryOf, type ClosedPosition, type MarketResult } from "./trader";

/* ---------- Polymarket traders ---------- */

/** The feed's own tab for markets that were moves (a better category hint than the market's words). */
export async function tabHints(db: Db, marketIds: readonly string[]): Promise<Map<string, "sports" | "markets" | "crypto">> {
  const ids = [...new Set(marketIds)];
  const out = new Map<string, "sports" | "markets" | "crypto">();
  for (let i = 0; i < ids.length; i += 1000) {
    const rs = await db.selectDistinct({ id: moves.marketId, tab: moves.tab }).from(moves).where(inArray(moves.marketId, ids.slice(i, i + 1000)));
    for (const r of rs) if (r.tab !== "stocks") out.set(r.id, r.tab);
  }
  return out;
}

/** Replaces the wallet's stored resolved positions. */
export async function savePositions(db: Db, wallet: string, list: readonly ClosedPosition[], hints: ReadonlyMap<string, "sports" | "markets" | "crypto">): Promise<void> {
  const seen = new Set<string>();
  const values = list.flatMap(p => {
    const k = `${p.marketId}:${p.outcomeIndex}`;
    if (seen.has(k)) return [];
    seen.add(k);
    const c = categoryOf([p.title, p.eventSlug, p.slug], hints.get(p.marketId) ?? null);
    return [{ wallet, marketId: p.marketId, outcomeIndex: p.outcomeIndex, title: p.title.slice(0, 300), outcome: p.outcome, eventSlug: p.eventSlug,
      category: c.category, tab: c.tab, moneyIn: p.moneyIn, pnl: p.pnl, resolvedAt: p.resolvedAt ? new Date(p.resolvedAt) : null }];
  });
  await db.transaction(async tx => {
    await tx.delete(traderPositions).where(eq(traderPositions.wallet, wallet));
    for (let i = 0; i < values.length; i += 500) await tx.insert(traderPositions).values(values.slice(i, i + 500));
  });
}

export async function trackWallets(db: Db, list: ReadonlyArray<{ wallet: string; name: string | null }>, reason: string): Promise<void> {
  for (let i = 0; i < list.length; i += 500) {
    await db.insert(trackedWallets).values(list.slice(i, i + 500).map(w => ({ wallet: w.wallet, name: w.name, reason })))
      .onConflictDoUpdate({ target: trackedWallets.wallet, set: { name: sql`excluded.name` } });
  }
}

/** A wallet's resolved markets (one row per market), for the stats. */
export async function marketsFor(db: Db, wallet: string): Promise<MarketResult[]> {
  const r = await db.execute(sql`select market_id, max(title) as title, max(category) as category, max(tab) as tab,
      sum(money_in)::float as money_in, sum(pnl)::float as pnl, max(resolved_at) as resolved_at
    from terminal.trader_positions where wallet = ${wallet} group by market_id`);
  return (r.rows as Array<Record<string, unknown>>).map(x => ({
    marketId: String(x.market_id), title: String(x.title), category: String(x.category), tab: String(x.tab),
    moneyIn: Number(x.money_in), pnl: Number(x.pnl), resolvedAt: x.resolved_at ? new Date(x.resolved_at as string).getTime() : null,
  }));
}

export type TopWindow = "week" | "month" | "all";
export interface TopRow { wallet: string; name: string | null; resolved: number; won: number; profit: number; best: string | null }

/** /top: wallets with RECORD_MIN_RESOLVED+ resolved markets all-time, ranked by profit over markets that resolved in
 *  the window (and tab). Win rate and best category are over the same markets. */
export async function topRanking(db: Db, window: TopWindow, tab: "sports" | "markets" | null, now: number, limit = 50): Promise<TopRow[]> {
  const since = window === "all" ? null : new Date(now - (window === "week" ? 7 : 30) * 86_400_000);
  const r = await db.execute(sql`with m as (
      select p.wallet, p.market_id, max(p.category) as category, max(p.tab) as tab, sum(p.pnl) as pnl, max(p.resolved_at) as resolved_at
      from terminal.trader_positions p
      join terminal.trader_records t on t.wallet = p.wallet and t.resolved >= ${RECORD_MIN_RESOLVED}
      group by p.wallet, p.market_id
    ), w as (
      select * from m where ${since ? sql`resolved_at >= ${since}` : sql`true`} and ${tab ? sql`tab = ${tab}` : sql`true`}
    ), c as (
      select wallet, category, sum(pnl) as profit, count(*) as n,
        row_number() over (partition by wallet order by sum(pnl) desc) as rk
      from w group by wallet, category
    )
    select w.wallet, max(t.name) as name, count(*)::int as resolved, sum(case when w.pnl > 0 then 1 else 0 end)::int as won,
      sum(w.pnl)::float as profit, max(case when c.rk = 1 and c.profit > 0 then c.category end) as best
    from w join terminal.trader_records t on t.wallet = w.wallet
    left join c on c.wallet = w.wallet and c.rk = 1
    group by w.wallet having sum(w.pnl) > 0
    order by sum(w.pnl) desc limit ${limit}`);
  return (r.rows as Array<Record<string, unknown>>).map(x => ({
    wallet: String(x.wallet), name: (x.name as string | null) ?? null, resolved: Number(x.resolved), won: Number(x.won),
    profit: Math.round(Number(x.profit) * 100) / 100, best: (x.best as string | null) ?? null,
  }));
}

export async function recordOf(db: Db, wallet: string): Promise<TraderRecord | null> {
  const r = await db.select().from(traderRecords).where(eq(traderRecords.wallet, wallet)).limit(1);
  const x = r[0];
  return x ? { wallet: x.wallet, name: x.name, resolved: x.resolved, won: x.won, lost: x.lost, profit: x.profit, biggestWin: x.biggestWin, biggestBet: x.biggestBet, updatedAt: x.updatedAt.getTime() } : null;
}

/* ---------- insiders (SEC Form 4) ---------- */

export type InsiderTrade = typeof insiderTrades.$inferSelect;

export async function insiderTradesFor(db: Db, ownerCik: string, limit = 500): Promise<InsiderTrade[]> {
  return db.select().from(insiderTrades).where(eq(insiderTrades.ownerCik, String(Number(ownerCik))))
    .orderBy(desc(insiderTrades.filedAt), asc(insiderTrades.line)).limit(limit);
}

/* ---------- companies (every insider's Form 4 trades at one issuer) ---------- */

export async function issuerTradesFor(db: Db, issuerCik: string, limit = 1000): Promise<InsiderTrade[]> {
  return db.select().from(insiderTrades).where(eq(insiderTrades.issuerCik, String(Number(issuerCik))))
    .orderBy(desc(insiderTrades.filedAt), asc(insiderTrades.ownerCik), asc(insiderTrades.line)).limit(limit);
}

/** The company a ticker names, from the Form 4s we hold (the most recently filed one, should a ticker move). */
export async function issuerForTicker(db: Db, ticker: string): Promise<{ issuerCik: string; company: string; ticker: string } | null> {
  const r = await db.select({ issuerCik: insiderTrades.issuerCik, company: insiderTrades.company, ticker: insiderTrades.ticker }).from(insiderTrades)
    .where(sql`upper(${insiderTrades.ticker}) = ${ticker.toUpperCase()}`).orderBy(desc(insiderTrades.filedAt)).limit(1);
  return r[0] ? { issuerCik: r[0].issuerCik, company: r[0].company, ticker: (r[0].ticker ?? ticker).toUpperCase() } : null;
}

/** A company's ticker and name by its CIK (for the Following page). */
export async function issuersByCik(db: Db, ciks: readonly string[]): Promise<Map<string, { company: string; ticker: string | null }>> {
  const ids = [...new Set(ciks.map(c => String(Number(c))))];
  if (!ids.length) return new Map();
  const r = await db.execute(sql`select distinct on (issuer_cik) issuer_cik, company, ticker from terminal.insider_trades
    where issuer_cik in (${sql.join(ids.map(i => sql`${i}`), sql`, `)}) order by issuer_cik, filed_at desc`);
  return new Map((r.rows as Array<{ issuer_cik: string; company: string; ticker: string | null }>).map(x => [x.issuer_cik, { company: x.company, ticker: x.ticker }]));
}

/** An insider's filed name and latest role and company by CIK (for the Following page). */
export async function ownersByCik(db: Db, ciks: readonly string[]): Promise<Map<string, { name: string; role: string; company: string }>> {
  const ids = [...new Set(ciks.map(c => String(Number(c))))];
  if (!ids.length) return new Map();
  const r = await db.execute(sql`select distinct on (owner_cik) owner_cik, owner_name, role, company from terminal.insider_trades
    where owner_cik in (${sql.join(ids.map(i => sql`${i}`), sql`, `)}) order by owner_cik, filed_at desc`);
  const out = new Map((r.rows as Array<{ owner_cik: string; owner_name: string; role: string; company: string }>).map(x => [x.owner_cik, { name: x.owner_name, role: x.role, company: x.company }]));
  // Someone whose history is still being read has a name before any trade.
  const missing = ids.filter(i => !out.has(i));
  if (missing.length) {
    for (const h of await db.select({ cik: secHistory.cik, name: secHistory.name }).from(secHistory).where(and(eq(secHistory.kind, "owner"), inArray(secHistory.cik, missing)))) {
      if (h.name) out.set(h.cik, { name: h.name, role: "", company: "" });
    }
  }
  return out;
}

/** The latest close we hold per ticker (terminal.stock_closes; empty until a licensed price source fills it). */
export async function latestCloses(db: Db, tickers: readonly string[]): Promise<Map<string, Close>> {
  const ts = [...new Set(tickers.filter(Boolean).map(t => t.toUpperCase()))];
  if (!ts.length) return new Map();
  const r = await db.execute(sql`select distinct on (ticker) ticker, date, close from terminal.stock_closes
    where ticker in (${sql.join(ts.map(t => sql`${t}`), sql`, `)}) order by ticker, date desc`);
  return new Map((r.rows as Array<{ ticker: string; date: string; close: number }>).map(x => [x.ticker, { ticker: x.ticker, date: x.date, close: Number(x.close) }]));
}

/* ---------- onboarding: who to follow in Stocks ---------- */

/** The insiders and companies with the most open-market buying filed since `since`, and the funds we track (most
 *  quarters on file first), for onboarding's "Who to follow". */
export async function stockSuggestions(db: Db, since: Date, n = 3): Promise<{
  insiders: Array<{ cik: string; name: string; role: string; company: string; bought: number }>;
  companies: Array<{ cik: string; company: string; ticker: string | null; insiders: number; bought: number }>;
  funds: Array<{ cik: string; name: string }>;
}> {
  const [ins, cos, fs] = await Promise.all([
    db.execute(sql`select owner_cik, max(owner_name) as name, max(role) as role, max(company) as company, sum(value)::float as bought from terminal.insider_trades
      where code = 'P' and filed_at >= ${since} group by owner_cik order by sum(value) desc limit ${n}`),
    db.execute(sql`select issuer_cik, max(company) as company, max(ticker) as ticker, count(distinct owner_cik)::int as insiders, sum(value)::float as bought
      from terminal.insider_trades where code = 'P' and filed_at >= ${since} group by issuer_cik order by count(distinct owner_cik) desc, sum(value) desc limit ${n}`),
    db.select({ cik: funds.cik, name: funds.name }).from(funds).orderBy(desc(funds.quartersOnFile)).limit(n),
  ]);
  return {
    insiders: (ins.rows as Array<{ owner_cik: string; name: string; role: string; company: string; bought: number }>).map(x => ({ cik: x.owner_cik, name: x.name, role: x.role, company: x.company, bought: Number(x.bought) })),
    companies: (cos.rows as Array<{ issuer_cik: string; company: string; ticker: string | null; insiders: number; bought: number }>).map(x => ({ cik: x.issuer_cik, company: x.company, ticker: x.ticker, insiders: Number(x.insiders), bought: Number(x.bought) })),
    funds: fs,
  };
}

/* ---------- the sitemap ---------- */

/** Insiders and companies with a Form 4 trade filed since `since`, and every fund we track, for sitemap.xml. */
export async function sitemapSec(db: Db, since: Date, limit = 5000): Promise<{
  insiders: Array<{ cik: string; name: string; at: Date }>; companies: Array<{ ticker: string; at: Date }>; funds: Array<{ cik: string; name: string; at: Date }>;
}> {
  const [ins, cos, fs] = await Promise.all([
    db.execute(sql`select owner_cik, max(owner_name) as name, max(filed_at) as at from terminal.insider_trades where filed_at >= ${since}
      group by owner_cik order by max(filed_at) desc limit ${limit}`),
    db.execute(sql`select upper(ticker) as ticker, max(filed_at) as at from terminal.insider_trades where filed_at >= ${since} and ticker is not null and ticker <> ''
      group by upper(ticker) order by max(filed_at) desc limit ${limit}`),
    db.select({ cik: funds.cik, name: funds.name, at: funds.updatedAt }).from(funds),
  ]);
  return {
    insiders: (ins.rows as Array<{ owner_cik: string; name: string; at: string | Date }>).map(x => ({ cik: x.owner_cik, name: x.name, at: new Date(x.at) })),
    companies: (cos.rows as Array<{ ticker: string; at: string | Date }>).map(x => ({ ticker: x.ticker, at: new Date(x.at) })),
    funds: fs,
  };
}

/* ---------- the Following feed ---------- */

/** Form 4 trades filed by followed insiders or at followed companies since `since`, newest first. */
export async function followedTrades(db: Db, owners: readonly string[], issuers: readonly string[], since: Date, limit = 300): Promise<InsiderTrade[]> {
  const w = [owners.length ? inArray(insiderTrades.ownerCik, [...owners]) : undefined, issuers.length ? inArray(insiderTrades.issuerCik, [...issuers]) : undefined].filter(Boolean);
  if (!w.length) return [];
  return db.select().from(insiderTrades).where(and(or(...w), gte(insiderTrades.filedAt, since))).orderBy(desc(insiderTrades.filedAt), asc(insiderTrades.line)).limit(limit);
}

export async function historyOf(db: Db, kind: "owner" | "issuer", cik: string): Promise<{ completeSince: string | null; pending: number; name: string | null } | null> {
  const r = await db.select().from(secHistory).where(and(eq(secHistory.kind, kind), eq(secHistory.cik, String(Number(cik))))).limit(1);
  return r[0] ? { completeSince: r[0].pending.length ? null : r[0].completeSince, pending: r[0].pending.length, name: r[0].name } : null;
}

/* ---------- funds (13F) ---------- */

export async function fundOf(db: Db, cik: string) {
  const r = await db.select().from(funds).where(eq(funds.cik, String(Number(cik)))).limit(1);
  return r[0] ?? null;
}

/** The fund's complete 13F-HRs we hold (the latest `limit` of them), newest first, each with its holdings. */
export async function fundQuarters(db: Db, cik: string, limit?: number): Promise<Array<{ accession: string; period: string | null; filedOn: string; url: string; holdings: Array<{ cusip: string; company: string; shares: number; value: number }> }>> {
  const id = String(Number(cik));
  const q = db.select().from(fundFilings).where(and(eq(fundFilings.fundCik, id), eq(fundFilings.complete, true))).orderBy(desc(fundFilings.filedOn));
  const fs = limit ? await q.limit(limit) : await q;
  if (!fs.length) return [];
  const hs = await db.select().from(fundHoldings).where(and(eq(fundHoldings.fundCik, id), inArray(fundHoldings.accession, fs.map(f => f.accession))));
  return fs.map(f => ({ accession: f.accession, period: f.period, filedOn: f.filedOn, url: f.url,
    holdings: hs.filter(h => h.accession === f.accession).map(h => ({ cusip: h.cusip, company: h.company, shares: h.shares, value: h.value })) }));
}
