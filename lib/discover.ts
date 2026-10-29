/* Discover, the members' home (app/discover): the biggest bets today, the markets with the most big money in the last
 * hour, and tonight's games with big money on them (start times from terminal.market_info). Every row is from
 * terminal.moves on the viewer's clock. Server only. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { liveTabs } from "@/lib/features";
import { notComboSql } from "@/lib/moves/combos";
import { listMoves } from "@/lib/moves/store";
import type { Move } from "@/lib/moves/types";

const ET_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
/** Midnight in New York at the start of `now`'s day, ms (DST-safe: the offset is read for that day). */
export function startOfEtDay(now: number): number {
  const day = ET_DAY.format(new Date(now));
  for (const off of [4, 5]) {
    const t = Date.parse(`${day}T0${off}:00:00Z`);
    if (ET_DAY.format(new Date(t)) === day && ET_DAY.format(new Date(t - 3_600_000)) !== day) return t;
  }
  return Date.parse(`${day}T05:00:00Z`);
}

export function biggestToday(db: Db, now: number, until: number, limit = 8): Promise<Move[]> {
  return listMoves(db, { since: startOfEtDay(now), until, byAmount: true, limit });
}

export interface MarketRow { source: "polymarket" | "kalshi"; marketId: string; title: string; event: string; tab: string; total: number; moves: number; lastAt: number; startAt?: number | null }

const tabs = () => sql.join(liveTabs().map(t => sql`${t}`), sql`, `);

/** Markets with the most big money in [since, until], biggest first. */
export async function trendingMarkets(db: Db, since: number, until: number, limit = 8): Promise<MarketRow[]> {
  const r = await db.execute(sql`select source, market_id, max(market_title) as title, max(event_title) as event, max(tab) as tab,
      sum(amount)::float as total, count(*)::int as n, max(at) as last_at
    from terminal.moves where source in ('polymarket', 'kalshi') and hidden_at is null and ${notComboSql} and tab in (${tabs()})
      and at >= ${new Date(since)} and at <= ${new Date(until)}
    group by source, market_id order by total desc limit ${limit}`);
  return (r.rows as Array<{ source: "polymarket" | "kalshi"; market_id: string; title: string; event: string; tab: string; total: number; n: number; last_at: string }>)
    .map(x => ({ source: x.source, marketId: x.market_id, title: x.title, event: x.event, tab: x.tab, total: Number(x.total), moves: Number(x.n), lastAt: new Date(x.last_at).getTime() }));
}

/** Sports games starting between now and 6 a.m. New York tomorrow, with the big money on each (start times as the
 *  venue states them, terminal.market_info). */
export async function tonightsGames(db: Db, now: number, until: number, limit = 10): Promise<MarketRow[]> {
  const end = startOfEtDay(now) + 30 * 3_600_000;
  const r = await db.execute(sql`select m.source, m.market_id, max(m.market_title) as title, max(m.event_title) as event, max(m.tab) as tab,
      sum(m.amount)::float as total, count(*)::int as n, max(m.at) as last_at, max(i.start_at) as start_at
    from terminal.moves m join terminal.market_info i on i.source = m.source and i.market_id = m.market_id
    where m.tab = 'sports' and m.hidden_at is null and m.at <= ${new Date(until)} and i.start_at >= ${new Date(now - 3 * 3_600_000)} and i.start_at < ${new Date(end)}
    group by m.source, m.market_id order by max(i.start_at) asc, total desc limit ${limit}`);
  return (r.rows as Array<{ source: "polymarket" | "kalshi"; market_id: string; title: string; event: string; tab: string; total: number; n: number; last_at: string; start_at: string }>)
    .map(x => ({ source: x.source, marketId: x.market_id, title: x.title, event: x.event, tab: x.tab, total: Number(x.total), moves: Number(x.n), lastAt: new Date(x.last_at).getTime(), startAt: new Date(x.start_at).getTime() }));
}
