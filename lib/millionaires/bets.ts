/* Millionaire bets: every bet of BET_MIN ($5K) or more by a watchlist wallet, from the moves poller's Polymarket fills
 * (lib/moves/poll.ts lastWatchedBets: one wallet, one market and outcome, fills within 10 minutes merged, the same
 * as moves). Stored with the market, side, size, the average price paid then, the wallet's tier when it bet, the
 * category (lib/brand/categories.ts) and the time. A run that grows keeps its id and is updated in place. Settled with
 * the market (lib/moves/store.ts settleMarket). Kalshi trades are anonymous, so millionaire bets are Polymarket's. */
import { and, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { betCopies, millionaireBets } from "@/lib/db/schema";
import { categoryOf } from "@/lib/brand/categories";
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
    });
  }
  return out;
}

/** Upserts bets. The tier stays what it was when the bet was first seen; size, price and last fill follow the run. */
export async function saveBets(db: Db, rows: readonly BetRow[]): Promise<number> {
  if (!rows.length) return 0;
  await db.insert(millionaireBets).values([...rows]).onConflictDoUpdate({
    target: millionaireBets.id,
    set: { amount: sql`excluded.amount`, price: sql`excluded.price`, lastAt: sql`excluded.last_at`, url: sql`coalesce(excluded.url, ${millionaireBets.url})`,
      yesLabel: sql`coalesce(excluded.yes_label, ${millionaireBets.yesLabel})`, noLabel: sql`coalesce(excluded.no_label, ${millionaireBets.noLabel})` },
  });
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
