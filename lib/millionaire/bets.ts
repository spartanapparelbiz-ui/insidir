/* Millionaire bets (terminal.millionaire_bets): every bet of WATCH_MIN+ by a watchlist wallet with $100K+ all-time
 * profit, with that wallet's pnl when it bet. Two ways in, both idempotent (a bet keeps its first id):
 *   - the big-trade poller's own fills (lib/moves/poll.ts watchMoves), so $5K–$10K bets count too;
 *   - the tracked big moves (terminal.moves) of watchlist wallets, which also fills in history.
 * Settled from the moves' results. Server only. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import type { Move } from "@/lib/moves/types";
import { WATCH_MIN } from "@/lib/moves/poll";
import { TIER_MIN } from "./tiers";

export async function saveWatchMoves(db: Db, list: readonly Move[], pnl: ReadonlyMap<string, number>): Promise<number> {
  let n = 0;
  for (const m of list) {
    const p = m.wallet ? pnl.get(m.wallet) : undefined;
    if (!m.wallet || p === undefined || p < TIER_MIN.pro || m.amount < WATCH_MIN) continue;
    // One row per position (wallet, market, side) and run of fills: more buys in the same run grow it.
    const r = await db.execute(sql`insert into terminal.millionaire_bets (id, wallet, market_id, event_title, market_title, outcome, outcome_side, amount, price, pnl, tab, league, category, at)
      values (${m.id}, ${m.wallet}, ${m.marketId}, ${m.eventTitle}, ${m.marketTitle}, ${m.outcome}, ${m.outcomeSide}, ${m.amount}, ${m.avgPrice}, ${p}, ${m.tab}, ${m.league}, ${m.category ?? null}, ${new Date(m.at)})
      on conflict (id) do update set amount = greatest(terminal.millionaire_bets.amount, excluded.amount), price = excluded.price
      returning (xmax = 0) as inserted`);
    if ((r.rows[0] as { inserted: boolean } | undefined)?.inserted) n++;
  }
  return n;
}

/** Copies watchlist wallets' tracked moves (any age) in, and settles open millionaire bets from their moves. */
export async function syncMillionaireBets(db: Db): Promise<number> {
  const r = await db.execute(sql`insert into terminal.millionaire_bets (id, wallet, market_id, event_title, market_title, outcome, outcome_side, amount, price, pnl, tab, league, category, at, result, settled_at)
      select m.id, m.wallet, m.market_id, m.event_title, m.market_title, m.outcome, m.outcome_side, m.amount, m.avg_price, w.pnl, m.tab, m.league, m.category, m.at, m.result, m.settled_at
      from terminal.moves m join terminal.millionaire_wallets w on w.wallet = m.wallet and w.pnl >= ${TIER_MIN.pro}
      where m.source = 'polymarket' and m.hidden_at is null and m.amount >= ${WATCH_MIN}
    on conflict (id) do nothing`);
  // A bet's market settled (its moves carry the result): the same result for every bet on that side.
  await db.execute(sql`update terminal.millionaire_bets b set result = s.result, settled_at = s.settled_at
    from (select distinct on (market_id, outcome_side) market_id, outcome_side, result, settled_at from terminal.moves
          where source = 'polymarket' and result in ('won', 'lost', 'void') order by market_id, outcome_side, settled_at desc) s
    where b.result is null and s.market_id = b.market_id and s.outcome_side = b.outcome_side`);
  return r.rowCount ?? 0;
}
