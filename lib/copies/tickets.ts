/* One-tap copy v1. A copy ticket for one millionaire bet: the bet, the wallet's tier and record, their price against
 * the price now, where to open it (Kalshi for US members, its matched market, else view-only; Polymarket outside the
 * US) and an amount (the member's default from Account). Insidir never places trades, holds funds or keys: the member
 * buys on the venue, then "I placed it" logs it here, and it settles with the market (lib/millionaires/bets.ts
 * settleCopies). Wallets by tier, profit and short address only. Server only. */
import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { betCopies } from "@/lib/db/schema";
import { shortWallet } from "@/lib/millionaires/watchlist";
import { outcomeNames } from "@/lib/millionaires/queries";
import type { Region } from "@/lib/types";
import { isCategory, type CategorySlug } from "@/lib/brand/categories";
import { kalshiMatchesFull, openFor, yesPrices } from "./store";

export interface Ticket {
  betId: string;
  marketId: string;
  title: string;
  category: CategorySlug;
  outcome: string;
  side: "yes" | "no";
  amount: number;
  at: number;
  tier: "millionaire" | "pro";
  short: string;
  /** The wallet's all-time profit and its resolved record (null when we haven't read it yet). */
  pnl: number | null;
  record: { won: number; lost: number } | null;
  theirPrice: number;
  /** The price on Polymarket now (the side they took), for "their price vs now". */
  priceNow: number | null;
  /** Where the member would buy it and at what price; null open = view-only (no Kalshi match for a US member). */
  open: { venue: "kalshi" | "polymarket"; href: string } | null;
  yourPrice: number | null;
  settled: "won" | "lost" | "void" | null;
}

export async function ticketFor(db: Db, betId: string, region: Region | null): Promise<Ticket | null> {
  const r = await db.execute(sql`select b.id, b.wallet, b.tier, b.market_id, b.market_title, b.outcome, b.outcome_side, b.amount::float as amount,
      b.price::float as price, b.at, b.url, b.result, b.yes_label, b.no_label, b.category, w.pnl::float as pnl, t.won, t.lost
    from terminal.millionaire_bets b left join terminal.watchlist w on w.wallet = b.wallet left join terminal.trader_records t on t.wallet = b.wallet
    where b.id = ${betId}`);
  const b = r.rows[0] as Record<string, unknown> | undefined;
  if (!b) return null;
  const marketId = String(b.market_id), side = b.outcome_side === "no" ? "no" : "yes";
  const names = outcomeNames(String(b.market_title), String(b.yes_label ?? "Yes"), String(b.no_label ?? "No"));
  const [matches, poly] = await Promise.all([kalshiMatchesFull(db, [marketId]), yesPrices(db, "polymarket", [marketId])]);
  const match = matches.get(marketId);
  const kalshi = match ? await yesPrices(db, "kalshi", [match.kalshiId]) : new Map<string, number>();
  const o = openFor({ source: "polymarket", url: (b.url as string | null) ?? null, marketId, outcomeSide: side }, region, match, poly, kalshi);
  const yes = poly.get(marketId);
  return {
    betId: String(b.id), marketId, title: String(b.market_title), category: isCategory(b.category) ? b.category : "markets", outcome: side === "yes" ? names.yesLabel : names.noLabel, side,
    amount: Number(b.amount), at: new Date(b.at as string).getTime(), tier: b.tier === "millionaire" ? "millionaire" : "pro", short: shortWallet(String(b.wallet)),
    pnl: b.pnl === null || b.pnl === undefined ? null : Number(b.pnl),
    record: b.won === null || b.won === undefined ? null : { won: Number(b.won), lost: Number(b.lost) },
    theirPrice: Number(b.price), priceNow: yes === undefined ? null : side === "yes" ? yes : 1 - yes,
    open: o.open, yourPrice: o.yourPrice, settled: (b.result as Ticket["settled"]) ?? null,
  };
}

export const MIN_COPY = 1, MAX_COPY = 100_000;

/** "I placed it": logs the member's copy at the price the ticket showed them (their venue's, else Polymarket's now,
 *  else the wallet's). Once per member and bet; a settled bet can't be logged. */
export async function logCopy(db: Db, userId: string, t: Ticket, amount: number): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  if (t.settled) return { ok: false, error: "That market has settled." };
  if (!Number.isFinite(amount) || amount < MIN_COPY || amount > MAX_COPY) return { ok: false, error: `Enter an amount from $${MIN_COPY} to $${MAX_COPY.toLocaleString("en-US")}.` };
  const price = t.yourPrice ?? t.priceNow ?? t.theirPrice;
  const row = await db.insert(betCopies).values({
    userId, betId: t.betId, marketId: t.marketId, title: t.title.slice(0, 300), outcome: t.outcome, outcomeSide: t.side, tier: t.tier,
    theirPrice: t.theirPrice, price, amount: Math.round(amount * 100) / 100, venue: t.open?.venue ?? "polymarket",
  }).onConflictDoNothing().returning({ id: betCopies.id });
  return row[0] ? { ok: true, id: row[0].id } : { ok: false, error: "You already logged this one." };
}

export interface YourCopy { id: number; betId: string; title: string; outcome: string; amount: number; price: number; theirPrice: number; venue: string; at: number; result: "won" | "lost" | "void" | null; pnl: number | null }
export interface YourCopies { list: YourCopy[]; settled: number; won: number; lost: number; net: number; open: number }

export async function yourCopies(db: Db, userId: string, limit = 100): Promise<YourCopies> {
  const rows = await db.select().from(betCopies).where(eq(betCopies.userId, userId)).orderBy(desc(betCopies.createdAt)).limit(limit);
  const list = rows.map(r => ({ id: r.id, betId: r.betId, title: r.title, outcome: r.outcome, amount: r.amount, price: r.price, theirPrice: r.theirPrice, venue: r.venue,
    at: r.createdAt.getTime(), result: r.result ?? null, pnl: r.pnl ?? null }));
  const done = list.filter(c => c.result === "won" || c.result === "lost");
  return { list, settled: done.length, won: done.filter(c => c.result === "won").length, lost: done.filter(c => c.result === "lost").length,
    net: Math.round(list.reduce((s, c) => s + (c.pnl ?? 0), 0) * 100) / 100, open: list.filter(c => c.result === null).length };
}

export async function hasCopied(db: Db, userId: string, betId: string): Promise<boolean> {
  return (await db.select({ id: betCopies.id }).from(betCopies).where(and(eq(betCopies.userId, userId), eq(betCopies.betId, betId))).limit(1)).length > 0;
}
