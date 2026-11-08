/* Millionaire bets: every bet of BET_MIN ($5K) or more by a watchlist wallet, from the moves poller's Polymarket fills
 * (lib/moves/poll.ts lastWatchedBets: one wallet, one market and outcome, fills within 10 minutes merged, the same
 * as moves). Stored with the market, side, size, the average price paid then, the wallet's tier when it bet, the
 * category (lib/brand/categories.ts) and the time. A run that grows keeps its id and is updated in place. Settled with
 * the market (lib/moves/store.ts settleMarket). Kalshi trades are anonymous, so millionaire bets are Polymarket's. */
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { betCopies, millionaireBets } from "@/lib/db/schema";
import { categoryOf, ESPORTS_RE } from "@/lib/brand/categories";
import type { Move } from "@/lib/moves/types";
import { BET_MIN } from "@/lib/moves/poll";
import type { Tier } from "./watchlist";

export { BET_MIN };
export type BetRow = typeof millionaireBets.$inferInsert;

/** Watched moves → bet rows (under BET_MIN, unwatched or anonymous ones dropped). */
export function betsFrom(moves: readonly Move[], tierOf: (wallet: string) => Tier | null, labels?: ReadonlyMap<string, { yesLabel: string; noLabel: string }>): BetRow[] {
  const out: BetRow[] = [];
  for (const m of moves) {
    if (m.source !== "polymarket" || !m.wallet || m.amount < BET_MIN) continue;
    const tier = tierOf(m.wallet);
    if (!tier) continue;
    out.push({
      id: m.id, wallet: m.wallet.toLowerCase(), tier, source: "polymarket", marketId: m.marketId, eventTitle: m.eventTitle, marketTitle: m.marketTitle,
      outcome: m.outcome, outcomeSide: m.outcomeSide, amount: m.amount, price: m.avgPrice,
      category: categoryOf({ title: m.marketTitle, event: m.eventTitle, venueCategory: m.category, tab: m.tab, league: m.league, url: m.url }),
      url: m.url, yesLabel: labels?.get(m.marketId)?.yesLabel ?? null, noLabel: labels?.get(m.marketId)?.noLabel ?? null,
      at: new Date(m.at), lastAt: new Date(m.lastAt),
      // Provenance (Verify): the fills' Polygon transactions, their raw trades and when they were fetched.
      transactionHash: m.sourceRefs?.[0] ?? null, txHashes: m.sourceRefs?.length ? m.sourceRefs : null,
      raw: m.rawFills && Object.keys(m.rawFills).length ? m.rawFills : null, fetchedAt: new Date(),
    });
  }
  return out;
}

/** A position's size and average price from every fill it ever had (its stored raw trades, by fill id), not just the
 *  fills still in the poller's buffer: a position that kept buying past the buffer's window was undercounted. Fills
 *  are the Data API trades the poller saw (keys "<tx>:<wallet>:<market>:<outcome>:<ms>"); dollars are size × price, as
 *  the board shows them (Polymarket's fee is on top, on chain). */
export async function sizeFromFills(db: Db, ids: readonly string[]): Promise<void> {
  if (!ids.length) return;
  await db.execute(sql`update terminal.millionaire_bets b set amount = round(f.usd::numeric, 2)::float8, price = f.usd / f.shares
    from (select b2.id, sum((e.value->>'size')::float8 * (e.value->>'price')::float8) as usd, sum((e.value->>'size')::float8) as shares
          from terminal.millionaire_bets b2, jsonb_each(b2.raw) e
          where b2.id in (${sql.join(ids.map(i => sql`${i}`), sql`, `)}) and e.key ~ '^0x[0-9a-fA-F]{64}:' and e.value->>'side' = 'BUY'
          group by b2.id) f
    where b.id = f.id and f.shares > 0 and f.usd >= b.amount`);
}

/** Upserts bets. The tier stays what it was when the bet was first seen; size, price and last fill follow the run. */
export async function saveBets(db: Db, rows: readonly BetRow[]): Promise<number> {
  if (!rows.length) return 0;
  await db.insert(millionaireBets).values([...rows]).onConflictDoUpdate({
    target: millionaireBets.id,
    set: { amount: sql`excluded.amount`, price: sql`excluded.price`, lastAt: sql`excluded.last_at`, url: sql`coalesce(excluded.url, ${millionaireBets.url})`,
      // The category is re-read on every run, so a better rule (esports, the Masters) corrects live bets too.
      category: sql`excluded.category`,
      yesLabel: sql`coalesce(excluded.yes_label, ${millionaireBets.yesLabel})`, noLabel: sql`coalesce(excluded.no_label, ${millionaireBets.noLabel})`,
      // Provenance accumulates: every transaction and raw fill ever seen for the position, the first hash kept.
      transactionHash: sql`coalesce(${millionaireBets.transactionHash}, excluded.transaction_hash)`,
      txHashes: sql`(select jsonb_agg(distinct x) from jsonb_array_elements(coalesce(${millionaireBets.txHashes}, '[]'::jsonb) || coalesce(excluded.tx_hashes, '[]'::jsonb)) x)`,
      raw: sql`case when excluded.raw is null then ${millionaireBets.raw} else coalesce(${millionaireBets.raw}, '{}'::jsonb) || excluded.raw end`,
      fetchedAt: sql`excluded.fetched_at` },
  });
  await sizeFromFills(db, rows.map(r => r.id));
  return rows.length;
}

/** Marks a settled market's bets won / lost (void when refunded). */
export async function settleBets(db: Db, marketId: string, result: "yes" | "no" | "void", at: Date): Promise<void> {
  const w = and(eq(millionaireBets.marketId, marketId), isNull(millionaireBets.result));
  if (result === "void") await db.update(millionaireBets).set({ result: "void", settledAt: at }).where(w);
  else await db.update(millionaireBets).set({ result: sql`case when ${millionaireBets.outcomeSide} = ${result} then 'won' else 'lost' end`, settledAt: at }).where(w);
  await settleCopies(db, marketId, result, at);
}

/** Members' logged copies (one-tap copy) settle with the market: a win pays amount ÷ price at the member's own price,
 *  a loss is the whole amount, a void returns it. */
export async function settleCopies(db: Db, marketId: string, result: "yes" | "no" | "void", at: Date): Promise<void> {
  const w = and(eq(betCopies.marketId, marketId), isNull(betCopies.result));
  if (result === "void") { await db.update(betCopies).set({ result: "void", pnl: 0, settledAt: at }).where(w); return; }
  await db.update(betCopies).set({
    result: sql`case when ${betCopies.outcomeSide} = ${result} then 'won' else 'lost' end`,
    pnl: sql`case when ${betCopies.outcomeSide} = ${result} then round((${betCopies.amount} / nullif(${betCopies.price}, 0) - ${betCopies.amount})::numeric, 2)::float else -${betCopies.amount} end`,
    settledAt: at,
  }).where(w);
}

/** Re-reads the category of stored bets from their own titles and links (the exchange's series first, lib/brand/
 *  categories.ts), for bets of the last `days`: esports filed under Golf or Tennis by keyword luck move to Esports.
 *  Idempotent; returns how many rows changed. */
export async function recategorizeBets(db: Db, now: number, days = 30): Promise<number> {
  const rows = (await db.execute(sql`select id, market_title, event_title, url, category from terminal.millionaire_bets where at > ${new Date(now - days * 86_400_000)}`)).rows as Array<{ id: string; market_title: string; event_title: string; url: string | null; category: string }>;
  let changed = 0;
  for (const r of rows) {
    const esports = /polymarket\.com\/event\/(dota2|cs2|csgo|lol|val|valorant|rl|cod|ow|r6|esports)-/i.test(r.url ?? "") || ESPORTS_RE.test(`${r.event_title} \n ${r.market_title}`);
    if (esports && r.category !== "esports") { await db.execute(sql`update terminal.millionaire_bets set category = 'esports' where id = ${r.id}`); changed++; }
  }
  return changed;
}
