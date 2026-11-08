/* The record job (worker record:refresh every 15 minutes, and a nightly full pass at 3 AM ET): keeps the public record
 * (terminal.record_log, /record) complete and current. It only ever adds rows, adds flags and moves price, result and
 * exit forward; nothing is filtered out or deleted.
 *   1. log     every position on the board (terminal.millionaire_bets) not logged yet, flagged with its tier; the
 *              provenance of open rows follows the position (a hash found later, fills added)
 *   2. unusual every unusual bet (a wallet new to Polymarket putting $5K+ on a long shot at 25¢ or less, lib/brand/
 *              pulse.ts unusualBet's rule), flagged "unusual"
 *   3. disagree the open millionaire positions on the side that holds 70%+ of a market's millionaire money while that
 *              side is priced at 50¢ or less (lib/brand/pulse.ts disagreements), flagged "disagreement"
 *   4. sources positions with no transaction hash yet: the wallet's Polymarket activity around the bet (a few per run)
 *   5. sold    an open position the wallet exited (sold 90%+ of it) before its market settled: closed at the exit price
 *   6. prices  open rows' price now from Polymarket (the side they took), and their settlement and result
 *   7. settle  results Insidir already recorded (millionaire_bets / moves settle jobs)
 * The nightly pass reads every open market (the 15-minute run reads the ones flagged in the last 14 days first, up to
 * a cap). */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { disagreements } from "@/lib/brand/pulse";
import { marketMoney } from "@/lib/millionaires/queries";
import type { PolymarketClient } from "@/lib/exchanges";

export const RECORD_MS = 15 * 60_000;
/** Markets read per 15-minute run (the nightly pass reads them all). */
const MARKETS_PER_RUN = 400;
/** Positions whose missing transaction is looked up per run. */
const SOURCES_PER_RUN = 25;

export interface RecordRun { logged: number; unusual: number; disagreement: number; sourced: number; sold: number; priced: number; settled: number }

type Poly = Pick<PolymarketClient, "getMarketsById" | "getActivity">;

export async function recordOnce(db: Db, poly: Poly | null, now: number, o: { full?: boolean } = {}): Promise<RecordRun> {
  const out: RecordRun = { logged: 0, unusual: 0, disagreement: 0, sourced: 0, sold: 0, priced: 0, settled: 0 };

  // 1. Every position on the board, once; open rows keep the position's latest size, price and provenance.
  out.logged = (await db.execute(sql`insert into terminal.record_log (id, flagged_at, flags, source, market_id, market_title, event_title, category, wallet, tier,
      outcome, outcome_side, entry_price, size, transaction_hash, tx_hashes, market_url, kalshi_url, fetched_at, raw, result, closed_at)
    select b.id, b.at, array[b.tier], b.source, b.market_id, b.market_title, b.event_title, b.category, b.wallet, b.tier, b.outcome, b.outcome_side, b.price, b.amount,
      b.transaction_hash, b.tx_hashes, b.url, b.kalshi_url, b.fetched_at, b.raw, b.result, b.settled_at
    from terminal.millionaire_bets b where not exists (select 1 from terminal.record_log r where r.id = b.id)
    on conflict (id) do nothing`)).rowCount ?? 0;
  // Size and entry follow the position on every row, settled ones included: a correction (a fill found later), never a
  // filter.
  await db.execute(sql`update terminal.record_log r set entry_price = b.price, size = b.amount
    from terminal.millionaire_bets b where b.id = r.id and (r.size is distinct from b.amount or r.entry_price is distinct from b.price)`);
  await db.execute(sql`update terminal.record_log r set category = b.category,
      transaction_hash = coalesce(r.transaction_hash, b.transaction_hash), tx_hashes = coalesce(b.tx_hashes, r.tx_hashes), raw = coalesce(b.raw, r.raw),
      fetched_at = coalesce(b.fetched_at, r.fetched_at), market_url = coalesce(b.url, r.market_url), kalshi_url = coalesce(b.kalshi_url, r.kalshi_url)
    from terminal.millionaire_bets b where b.id = r.id and r.result is null
      and (r.size is distinct from b.amount or r.transaction_hash is null and b.transaction_hash is not null or r.tx_hashes is distinct from b.tx_hashes)`);

  // 2. Unusual bets (new wallets, big long shots), from the moves table; a position already logged gains the flag.
  const since = new Date(o.full ? 0 : now - 3 * 86_400_000);
  out.unusual = (await db.execute(sql`insert into terminal.record_log (id, flagged_at, flags, source, market_id, market_title, event_title, category, wallet, tier,
      outcome, outcome_side, entry_price, size, transaction_hash, tx_hashes, market_url, fetched_at, raw, result, closed_at)
    select m.id, m.at, array['unusual'], m.source, m.market_id, m.market_title, m.event_title, m.category, m.wallet, 'new', m.outcome, m.outcome_side, m.avg_price, m.amount,
      m.source_refs->>0, m.source_refs, m.url, m.last_at, jsonb_build_object('source', 'moves.parts', 'parts', coalesce(m.parts, '[]'::jsonb)), m.result, m.settled_at
    from terminal.moves m
    where m.source = 'polymarket' and m.new_wallet and m.hidden_at is null and m.avg_price > 0.01 and m.avg_price <= 0.25 and m.amount >= 5000 and m.at > ${since}
    on conflict (id) do update set flags = (select array(select distinct unnest(terminal.record_log.flags || array['unusual'])))
      where not ('unusual' = any(terminal.record_log.flags))`)).rowCount ?? 0;

  // 3. Disagreement: millionaire money on a side the market prices at 50¢ or less.
  const open = await marketMoney(db, { since: now - 14 * 86_400_000, limit: 400, now }).catch(() => []);
  for (const d of disagreements(open)) {
    out.disagreement += (await db.execute(sql`update terminal.record_log set flags = flags || array['disagreement']
      where market_id = ${d.marketId} and outcome_side = ${d.side} and tier = 'millionaire' and result is null and not ('disagreement' = any(flags))`)).rowCount ?? 0;
  }

  // 4. Positions with no transaction hash yet (bets under the moves table's $10K floor): the wallet's own activity.
  if (poly) {
    const pending = (await db.execute(sql`select b.id, b.wallet, b.market_id, b.outcome_side, b.at, b.last_at from terminal.millionaire_bets b
      where b.transaction_hash is null and b.at > ${new Date(now - 30 * 86_400_000)} order by b.at desc limit ${SOURCES_PER_RUN}`)).rows as Array<{ id: string; wallet: string; market_id: string; outcome_side: string; at: string; last_at: string }>;
    for (const p of pending) {
      const at = new Date(p.at).getTime(), last = new Date(p.last_at).getTime();
      const acts = await poly.getActivity(p.wallet, { type: "TRADE", start: at - 120_000, end: last + 120_000, maxPages: 1, priority: "normal" }).catch(() => []);
      const mine = acts.filter(a => a.conditionId === p.market_id && a.side === "BUY" && a.txHash && (a.outcomeIndex === 1 ? "no" : "yes") === p.outcome_side);
      if (!mine.length) continue;
      const hashes = [...new Set(mine.map(a => a.txHash!))];
      const raw = Object.fromEntries(mine.map(a => [`${a.txHash}:${a.timestamp}`, { source: "data-api/activity", conditionId: a.conditionId, side: a.side, size: a.size, usdcSize: a.usdcSize, price: a.price, outcome: a.outcome, outcomeIndex: a.outcomeIndex, timestamp: a.timestamp, transactionHash: a.txHash }]));
      await db.execute(sql`update terminal.millionaire_bets set transaction_hash = ${hashes[0]}, tx_hashes = ${JSON.stringify(hashes)}::jsonb,
        raw = coalesce(raw, '{}'::jsonb) || ${JSON.stringify(raw)}::jsonb, fetched_at = ${new Date(now)} where id = ${p.id} and transaction_hash is null`);
      await db.execute(sql`update terminal.record_log set transaction_hash = ${hashes[0]}, tx_hashes = ${JSON.stringify(hashes)}::jsonb,
        raw = coalesce(raw, '{}'::jsonb) || ${JSON.stringify(raw)}::jsonb, fetched_at = ${new Date(now)} where id = ${p.id} and transaction_hash is null`);
      out.sourced++;
    }
  }

  // 5. Sold: the wallet exited before the market settled; closed at its exit price.
  out.sold = (await db.execute(sql`update terminal.record_log r set result = 'sold', exit_price = e.price, closed_at = e.at, price_now = e.price, price_at = e.at
    from (select distinct on (r2.id) r2.id, e2.price, e2.at from terminal.record_log r2 join terminal.position_events e2
            on e2.wallet = r2.wallet and e2.market_id = r2.market_id and e2.outcome_side = r2.outcome_side and e2.kind = 'exit' and e2.at > r2.flagged_at
          where r2.result is null order by r2.id, e2.at) e
    where e.id = r.id and r.result is null`)).rowCount ?? 0;

  // 6. Price now and settlement, from Polymarket.
  if (poly) {
    const ids = ((await db.execute(sql`select market_id from terminal.record_log where result is null
      group by market_id order by max(flagged_at) desc ${o.full ? sql`` : sql`limit ${MARKETS_PER_RUN}`}`)).rows as Array<{ market_id: string }>).map(r => r.market_id);
    for (let i = 0; i < ids.length; i += 50) {
      const got = await poly.getMarketsById(ids.slice(i, i + 50)).catch(() => new Map());
      for (const [id, m] of got) {
        const yes = typeof m.yesPrice === "number" ? m.yesPrice : null;
        if (m.result) {
          out.settled += (await db.execute(sql`update terminal.record_log set
              result = case when ${m.result}::text = 'void' then 'void' when outcome_side = ${m.result}::text then 'won' else 'lost' end,
              price_now = case when ${m.result}::text = 'void' then coalesce(price_now, ${yes}::float8) when outcome_side = ${m.result}::text then 1 else 0 end,
              price_at = ${new Date(now)}, closed_at = ${new Date(now)}
            where market_id = ${id} and result is null`)).rowCount ?? 0;
        } else if (yes !== null) {
          out.priced += (await db.execute(sql`update terminal.record_log set price_now = case when outcome_side = 'yes' then ${yes}::float8 else 1 - ${yes}::float8 end, price_at = ${new Date(now)}
            where market_id = ${id} and result is null`)).rowCount ?? 0;
        }
      }
    }
  }

  // 7. Results Insidir recorded elsewhere (the bets' and moves' own settle jobs).
  out.settled += (await db.execute(sql`update terminal.record_log r set result = b.result, closed_at = b.settled_at,
      price_now = case b.result when 'won' then 1 when 'lost' then 0 else r.price_now end, price_at = coalesce(b.settled_at, r.price_at)
    from terminal.millionaire_bets b where b.id = r.id and b.result is not null and r.result is null`)).rowCount ?? 0;
  out.settled += (await db.execute(sql`update terminal.record_log r set result = m.result, closed_at = m.settled_at,
      price_now = case m.result when 'won' then 1 when 'lost' then 0 else r.price_now end, price_at = coalesce(m.settled_at, r.price_at)
    from terminal.moves m where m.id = r.id and r.tier = 'new' and m.result is not null and r.result is null`)).rowCount ?? 0;
  return out;
}

/** The nightly full pass runs once a day, at 3 AM ET or the first run after it. */
export function nightlyDue(now: number, lastDay: string | null): { due: boolean; day: string } {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date(now));
  const get = (t: string) => p.find(x => x.type === t)!.value;
  const day = `${get("year")}-${get("month")}-${get("day")}`;
  return { due: Number(get("hour")) >= 3 && day !== lastDay, day };
}
