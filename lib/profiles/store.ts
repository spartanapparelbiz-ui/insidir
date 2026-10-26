/* Profiles in Postgres (terminal schema): a Polymarket trader's resolved positions, the /top ranking, an insider's
 * Form 4 trades and a fund's 13F holdings. Server only. */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { fundFilings, fundHoldings, funds, insiderTrades, moves, secHistory, trackedWallets, traderPositions, traderRecords } from "@/lib/db/schema";
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

export async function historyOf(db: Db, kind: "owner" | "issuer", cik: string): Promise<{ completeSince: string | null; pending: number; name: string | null } | null> {
  const r = await db.select().from(secHistory).where(and(eq(secHistory.kind, kind), eq(secHistory.cik, String(Number(cik))))).limit(1);
  return r[0] ? { completeSince: r[0].pending.length ? null : r[0].completeSince, pending: r[0].pending.length, name: r[0].name } : null;
}

/* ---------- funds (13F) ---------- */

export async function fundOf(db: Db, cik: string) {
  const r = await db.select().from(funds).where(eq(funds.cik, String(Number(cik)))).limit(1);
  return r[0] ?? null;
}

/** The fund's complete 13F-HRs we hold, newest first, each with its holdings. */
export async function fundQuarters(db: Db, cik: string): Promise<Array<{ accession: string; period: string | null; filedOn: string; url: string; holdings: Array<{ cusip: string; company: string; shares: number; value: number }> }>> {
  const id = String(Number(cik));
  const fs = await db.select().from(fundFilings).where(and(eq(fundFilings.fundCik, id), eq(fundFilings.complete, true))).orderBy(desc(fundFilings.filedOn));
  if (!fs.length) return [];
  const hs = await db.select().from(fundHoldings).where(and(eq(fundHoldings.fundCik, id), inArray(fundHoldings.accession, fs.map(f => f.accession))));
  return fs.map(f => ({ accession: f.accession, period: f.period, filedOn: f.filedOn, url: f.url,
    holdings: hs.filter(h => h.accession === f.accession).map(h => ({ cusip: h.cusip, company: h.company, shares: h.shares, value: h.value })) }));
}
