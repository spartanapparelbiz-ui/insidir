/* The wallets leaderboard (/wallets): every wallet up $1M+ all-time Insidir watches, with what a member needs to pick
 * one to follow: all-time profit, its settled record (won, lost, win rate) against the average price it paid (a win
 * rate above the price it pays is an edge; below it, luck or volume), its biggest win, what it bet in the last 7 days
 * and in which category, when it last bet and on what, and whether it passed the proven screen (lib/millionaires/
 * proven.ts: 30+ settled, not a market maker, high-frequency or arbitrage wallet). Short addresses only. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";

export interface LeaderRow {
  wallet: string;
  /** All-time profit (Polymarket's leaderboard). */
  pnl: number;
  /** Passed the proven screen; null while it hasn't been screened yet. */
  proven: boolean | null;
  /** Why it isn't proven (market maker, high frequency, arbitrage, under 30 settled). */
  exclusion: string | null;
  won: number | null;
  lost: number | null;
  /** Average price paid over its resolved markets (0..1), weighted by money in. */
  avgPrice: number | null;
  biggestWin: number | null;
  /** $5K+ bets in the last 7 days: money and count. */
  week: number;
  weekBets: number;
  /** The category it put the most into over the last 30 days. */
  topCategory: string | null;
  last: { at: number; title: string; outcome: string; amount: number } | null;
  followed: boolean;
}

export interface LeaderSummary { wallets: number; proven: number; activeToday: number; weekMoney: number }

export async function leaderboard(db: Db, now: number, userId: string | null, limit = 200): Promise<{ rows: LeaderRow[]; summary: LeaderSummary }> {
  const week = new Date(now - 7 * 86_400_000), month = new Date(now - 30 * 86_400_000), day = new Date(now - 86_400_000);
  const r = await db.execute(sql`
    select w.wallet, w.pnl, w.screened_at, w.exclusion,
      rec.won, rec.lost, rec.avg_price, rec.biggest_win,
      coalesce(wk.money, 0) as week_money, coalesce(wk.n, 0) as week_bets,
      tc.category as top_category,
      lb.at as last_at, lb.market_title as last_title, lb.outcome as last_outcome, lb.amount as last_amount,
      (f.target is not null) as followed
    from terminal.watchlist w
    left join terminal.trader_records rec on rec.wallet = w.wallet
    left join lateral (select sum(amount) as money, count(*) as n from terminal.millionaire_bets b where b.wallet = w.wallet and b.at >= ${week}) wk on true
    left join lateral (select category from terminal.millionaire_bets b where b.wallet = w.wallet and b.at >= ${month} group by category order by sum(amount) desc limit 1) tc on true
    left join lateral (select at, market_title, outcome, amount from terminal.millionaire_bets b where b.wallet = w.wallet order by at desc limit 1) lb on true
    left join terminal.follows f on f.user_id = ${userId ?? ""} and f.kind = 'trader' and f.target = w.wallet
    where w.pnl >= 1000000
    order by w.pnl desc
    limit ${limit}`);
  const rows: LeaderRow[] = (r.rows as Array<Record<string, unknown>>).map(x => ({
    wallet: String(x.wallet),
    pnl: Number(x.pnl),
    proven: x.screened_at ? x.exclusion === null : null,
    exclusion: (x.exclusion as string | null) ?? null,
    won: x.won === null || x.won === undefined ? null : Number(x.won),
    lost: x.lost === null || x.lost === undefined ? null : Number(x.lost),
    avgPrice: x.avg_price === null || x.avg_price === undefined ? null : Number(x.avg_price),
    biggestWin: x.biggest_win === null || x.biggest_win === undefined ? null : Number(x.biggest_win),
    week: Number(x.week_money),
    weekBets: Number(x.week_bets),
    topCategory: (x.top_category as string | null) ?? null,
    last: x.last_at ? { at: new Date(x.last_at as string).getTime(), title: String(x.last_title), outcome: String(x.last_outcome), amount: Number(x.last_amount) } : null,
    followed: Boolean(x.followed),
  }));
  const s = (await db.execute(sql`
    select (select count(*) from terminal.watchlist where pnl >= 1000000)::int as wallets,
      (select count(*) from terminal.watchlist where pnl >= 1000000 and screened_at is not null and exclusion is null)::int as proven,
      (select count(distinct wallet) from terminal.millionaire_bets where at >= ${day} and tier = 'millionaire')::int as active,
      (select coalesce(sum(amount), 0) from terminal.millionaire_bets where at >= ${week} and tier = 'millionaire')::float as week_money`)).rows[0] as Record<string, unknown>;
  return { rows, summary: { wallets: Number(s.wallets), proven: Number(s.proven), activeToday: Number(s.active), weekMoney: Number(s.week_money) } };
}

/** Win rate (0..1) from a record, or null under 10 settled (too few to read). */
export const winRate = (r: Pick<LeaderRow, "won" | "lost">): number | null => {
  const n = (r.won ?? 0) + (r.lost ?? 0);
  return n >= 10 ? (r.won ?? 0) / n : null;
};
