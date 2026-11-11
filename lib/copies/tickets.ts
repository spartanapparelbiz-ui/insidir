/* One-tap copy v1. A copy ticket for one millionaire bet: the bet, the wallet's tier and record, their price against
 * the price now, where to open it (Kalshi for US members, its matched market, else view-only; Polymarket outside the
 * US) and an amount (the member's default from Account). Insidir never places trades, holds funds or keys: the member
 * buys on the venue, then "I placed it" logs it here, and it settles with the market (lib/millionaires/bets.ts
 * settleCopies). Wallets by tier, profit and short address only. Server only. */
import { humanLine } from "@/lib/markets/title";
import type { BetVerify } from "@/lib/millionaires/queries";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { betCopies } from "@/lib/db/schema";
import { shortWallet } from "@/lib/millionaires/watchlist";
import { outcomeNames } from "@/lib/millionaires/queries";
import type { Region } from "@/lib/types";
import { isCategory, type CategorySlug } from "@/lib/brand/categories";
import { kalshiMatchesFull, openFor, yesPrices } from "./store";
import { decision, type Decision } from "@/lib/millionaires/decided";
import { cheaper, type VenuePrices } from "./alerts";
import { venuePrices } from "./alert-store";

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
  /** Settled, closed, or priced 97¢+/3¢- (lib/millionaires/decided.ts): no copy. */
  decided: Decision | null;
  /** Verify's sources, ungated: a page shows it to a visitor only through lockVerify (lib/millionaires/queries.ts). */
  verify: BetVerify;
  /** Copy trading: the wallet, whether it's Verified and its bankroll estimate (lib/verified), the side's price on both
   *  venues, the links this member can use (Kalshi's approved twin; Polymarket outside the US), and the cheaper of those. */
  wallet: string; verified: boolean; walletBankroll: number | null;
  prices: VenuePrices; links: { kalshi: string | null; polymarket: string | null }; best: "kalshi" | "polymarket" | null;
}

export async function ticketFor(db: Db, betId: string, region: Region | null): Promise<Ticket | null> {
  const r = await db.execute(sql`select b.id, b.wallet, b.tier, b.market_id, b.market_title, b.outcome, b.outcome_side, b.amount::float as amount,
      b.price::float as price, b.at, b.url, b.result, b.yes_label, b.no_label, b.category, w.pnl::float as pnl, t.won, t.lost, coalesce(i.closed, false) as closed,
      b.transaction_hash, b.fetched_at, i.updated_at as price_at, v.verified, v.bankroll::float as wallet_bankroll, coalesce((select tw.kalshi_url from terminal.market_twins tw where tw.polymarket_id = b.market_id and tw.status = 'approved'), b.kalshi_url) as kalshi_url
    from terminal.millionaire_bets b left join terminal.watchlist w on w.wallet = b.wallet left join terminal.trader_records t on t.wallet = b.wallet
    left join terminal.market_info i on i.source = 'polymarket' and i.market_id = b.market_id
    left join terminal.wallet_verification v on v.wallet = b.wallet
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
  const prices = (await venuePrices(db, [{ marketId, side }]).catch(() => new Map())).get(`${marketId}:${side}`) ?? { polymarket: null, kalshi: null };
  const links = { kalshi: (b.kalshi_url as string | null) ?? match?.url ?? null, polymarket: region === "non_us" ? (b.url as string | null) ?? null : null };
  const usable: VenuePrices = { kalshi: links.kalshi ? prices.kalshi : null, polymarket: links.polymarket ? prices.polymarket : null };
  const best = cheaper(usable) ?? (links.kalshi ? "kalshi" : links.polymarket ? "polymarket" : null);
  return {
    wallet: String(b.wallet), verified: b.verified === true, walletBankroll: b.wallet_bankroll === null || b.wallet_bankroll === undefined ? null : Number(b.wallet_bankroll), prices, links, best,
    betId: String(b.id), marketId, title: humanLine({ title: String(b.market_title) }), category: isCategory(b.category) ? b.category : "markets", outcome: side === "yes" ? names.yesLabel : names.noLabel, side,
    amount: Number(b.amount), at: new Date(b.at as string).getTime(), tier: b.tier === "millionaire" ? "millionaire" : "pro", short: shortWallet(String(b.wallet)),
    pnl: b.pnl === null || b.pnl === undefined ? null : Number(b.pnl),
    record: b.won === null || b.won === undefined ? null : { won: Number(b.won), lost: Number(b.lost) },
    theirPrice: Number(b.price), priceNow: yes === undefined ? null : side === "yes" ? yes : 1 - yes,
    open: o.open, yourPrice: o.yourPrice, settled: (b.result as Ticket["settled"]) ?? null,
    decided: decision({ result: (b.result as string | null) ?? null, closed: Boolean(b.closed), priceNow: yes === undefined ? null : side === "yes" ? yes : 1 - yes }),
    verify: { tx: (b.transaction_hash as string | null) ?? null, address: String(b.wallet), kalshi: (b.kalshi_url as string | null) ?? null, polymarket: Boolean(b.url),
      fetchedAt: b.price_at ? new Date(b.price_at as string).getTime() : b.fetched_at ? new Date(b.fetched_at as string).getTime() : null, locked: false },
  };
}

export const MIN_COPY = 1, MAX_COPY = 100_000;

/** "I placed it": logs the member's copy at the price the ticket showed them (their venue's, else Polymarket's now,
 *  else the wallet's). Once per member and bet; a settled bet can't be logged. */
export async function logCopy(db: Db, userId: string, t: Ticket, amount: number, o: { venue?: "kalshi" | "polymarket"; status?: "copied" | "placed" } = {}): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  if (t.settled) return { ok: false, error: "That market has settled." };
  if (t.decided) return { ok: false, error: "That market is decided: nothing left to copy." };
  if (!Number.isFinite(amount) || amount < MIN_COPY || amount > MAX_COPY) return { ok: false, error: `Enter an amount from $${MIN_COPY} to $${MAX_COPY.toLocaleString("en-US")}.` };
  // The venue they chose (a usable one), at its price; else the ticket's own venue and price.
  const venue = o.venue && t.links[o.venue] ? o.venue : t.best ?? t.open?.venue ?? "polymarket";
  const price = t.prices[venue] ?? t.yourPrice ?? t.priceNow ?? t.theirPrice;
  const row = await db.insert(betCopies).values({
    userId, betId: t.betId, marketId: t.marketId, title: t.title.slice(0, 300), outcome: t.outcome, outcomeSide: t.side, tier: t.tier,
    theirPrice: t.theirPrice, price, amount: Math.round(amount * 100) / 100, venue, status: o.status ?? "copied", wallet: t.wallet, theirAmount: t.amount,
  }).onConflictDoNothing().returning({ id: betCopies.id });
  if (row[0]) return { ok: true, id: row[0].id };
  // Tapped before: the same copy (Copy twice opens the market twice, one row).
  const had = await db.select({ id: betCopies.id }).from(betCopies).where(and(eq(betCopies.userId, userId), eq(betCopies.betId, t.betId))).limit(1);
  return had[0] ? { ok: true, id: had[0].id } : { ok: false, error: "That didn't save. Try again." };
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

/** The member's copy of a trade, if they tapped Copy on it: its id and what they marked. */
export async function copyRow(db: Db, userId: string, betId: string): Promise<{ id: number; status: "copied" | "placed" | "skipped" } | null> {
  const r = await db.select({ id: betCopies.id, status: betCopies.status }).from(betCopies).where(and(eq(betCopies.userId, userId), eq(betCopies.betId, betId))).limit(1);
  return r[0] ? { id: r[0].id, status: r[0].status } : null;
}

export async function hasCopied(db: Db, userId: string, betId: string): Promise<boolean> {
  return (await db.select({ id: betCopies.id }).from(betCopies).where(and(eq(betCopies.userId, userId), eq(betCopies.betId, betId))).limit(1)).length > 0;
}
