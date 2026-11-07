/* Millionaire bets: every bet of BET_MIN ($5K) or more by a watchlist wallet, from the moves poller's Polymarket fills
 * (lib/moves/poll.ts lastWatchedBets: one wallet, one market and outcome, fills within 10 minutes merged, the same
 * as moves). Stored with the market, side, size, the average price paid then, the wallet's tier when it bet, the
 * category (lib/brand/categories.ts) and the time. A run that grows keeps its id and is updated in place, even when the
 * poller names it after a later fill (saveBets). Settled with the market (lib/moves/store.ts settleMarket). Kalshi
 * trades are anonymous, so millionaire bets are Polymarket's. */
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { betCopies, millionaireBets } from "@/lib/db/schema";
import { categoryOf, ESPORTS_RE } from "@/lib/brand/categories";
import type { Move } from "@/lib/moves/types";
import { BET_MIN } from "@/lib/moves/poll";
import { fromParts, mergeParts, MERGE_WINDOW_MS } from "@/lib/moves/detect";
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
      at: new Date(m.at), lastAt: new Date(m.lastAt), parts: m.parts ?? null,
    });
  }
  return out;
}

/** Saves bets, one row per run (a wallet's buys in one market and outcome, each within 10 minutes of the last). The
 *  poller names a run after its first fill in a 70-minute buffer, so a long run, or one the worker restarted in the
 *  middle of, comes back under a later fill's id: it merges into the open bet already there, by fill id, and keeps
 *  that bet's id, so one bet never pings or opens an Autopilot ticket twice. The tier stays what it was when the bet
 *  was first seen; size, price and last fill follow the run. Returns the rows as stored (ids and sizes after merging),
 *  for the position events. */
export async function saveBets(db: Db, rows: readonly BetRow[]): Promise<BetRow[]> {
  const out: BetRow[] = [];
  for (const row of rows) {
    const at = +row.at, lastAt = +(row.lastAt ?? row.at);
    const same = await db.select().from(millionaireBets).where(and(eq(millionaireBets.wallet, row.wallet), eq(millionaireBets.marketId, row.marketId),
      eq(millionaireBets.outcomeSide, row.outcomeSide), isNull(millionaireBets.result),
      gte(millionaireBets.lastAt, new Date(at - MERGE_WINDOW_MS)), lte(millionaireBets.at, new Date(lastAt + MERGE_WINDOW_MS))))
      .orderBy(millionaireBets.at, millionaireBets.id);
    const keep = same.find(r => r.id === row.id) ?? same[0];
    if (!keep) {
      await db.insert(millionaireBets).values(row).onConflictDoNothing();
      out.push(row);
      continue;
    }
    const parts = mergeParts(...same.map(r => r.parts), row.parts);
    const merged = parts.length ? fromParts(parts) : null;
    // Bets from before fills were kept can't be added up exactly: never show less than the biggest of them.
    const legacy = same.filter(r => !r.parts?.length).reduce((mx, r) => Math.max(mx, r.amount), 0);
    const amount = Math.max(legacy, merged?.amount ?? row.amount), price = merged && merged.amount >= legacy ? merged.avgPrice : row.price;
    const first = new Date(Math.min(at, +keep.at, merged?.at ?? at)), last = new Date(Math.max(lastAt, +keep.lastAt, merged?.lastAt ?? lastAt));
    await db.update(millionaireBets).set({
      amount, price, at: first, lastAt: last, parts: parts.length ? parts : null, url: row.url ?? keep.url,
      // The category is re-read on every run, so a better rule (esports, the Masters) corrects live bets too.
      category: row.category, yesLabel: row.yesLabel ?? keep.yesLabel, noLabel: row.noLabel ?? keep.noLabel,
    }).where(eq(millionaireBets.id, keep.id));
    out.push({ ...row, id: keep.id, tier: keep.tier, amount, price, at: first, lastAt: last, parts });
  }
  return out;
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
