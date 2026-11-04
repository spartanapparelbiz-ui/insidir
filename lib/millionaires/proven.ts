/* Proven wallets: the ones Insidir follows. A wallet is proven when it is up $1M+ all time (the watchlist), has
 * PROVEN_MIN_SETTLED or more settled positions (its record, terminal.trader_records), and its last SCREEN_DAYS of trades
 * show it isn't one of these, which win without picking sides:
 *   market maker    it bought both sides of the same market within an hour, in MM_MARKETS or more markets
 *   high frequency  MAX_TRADES_PER_DAY or more trades in a day
 *   arbitrage       it holds both sides in ARB_SHARE or more of the markets it traded (ARB_MIN_MARKETS or more)
 * Screened once a day, a few wallets a run (worker millionaires:screen). Only proven wallets keep the "millionaire" tier,
 * so pings, Autopilot and the board's default follow them only; a wallet not screened yet keeps its tier until it is.
 * /methodology lists who is excluded and why, by short address. */
import { and, asc, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { watchlist } from "@/lib/db/schema";
import { MAX_TRADES_PER_DAY } from "@/lib/moves/detect";

export const PROVEN_MIN_SETTLED = 30;
export const SCREEN_DAYS = 14;
export const MM_WINDOW_MS = 3_600_000;
export const MM_MARKETS = 3;
export const ARB_SHARE = 0.4;
export const ARB_MIN_MARKETS = 10;

export type Exclusion = "market maker" | "high frequency" | "arbitrage" | "under 30 settled";
export interface Trade { marketId: string; outcomeSide: "yes" | "no"; side: "BUY" | "SELL"; at: number }
export interface Screen { reason: Exclusion | null; trades: number; markets: number; bothSides: number; mmMarkets: number; busiestDay: number }

/** A wallet's recent trades → why it isn't a picker, or null. Pure. */
export function screenTrades(trades: readonly Trade[]): Screen {
  const byDay = new Map<number, number>();
  for (const t of trades) { const d = Math.floor(t.at / 86_400_000); byDay.set(d, (byDay.get(d) ?? 0) + 1); }
  const busiestDay = Math.max(0, ...byDay.values());
  const markets = new Map<string, { yes: number[]; no: number[] }>();
  for (const t of trades) {
    if (t.side !== "BUY") continue;
    const m = markets.get(t.marketId) ?? { yes: [], no: [] };
    m[t.outcomeSide].push(t.at);
    markets.set(t.marketId, m);
  }
  let bothSides = 0, mmMarkets = 0;
  for (const m of markets.values()) {
    if (!m.yes.length || !m.no.length) continue;
    bothSides++;
    if (m.yes.some(a => m.no.some(b => Math.abs(a - b) <= MM_WINDOW_MS))) mmMarkets++;
  }
  const reason: Exclusion | null = busiestDay >= MAX_TRADES_PER_DAY ? "high frequency"
    : mmMarkets >= MM_MARKETS ? "market maker"
    : markets.size >= ARB_MIN_MARKETS && bothSides / markets.size >= ARB_SHARE ? "arbitrage" : null;
  return { reason, trades: trades.length, markets: markets.size, bothSides, mmMarkets, busiestDay };
}

/** Proven from the screen and the record: the reason it isn't, or null when it is. */
export function provenReason(screen: Screen | null, settled: number | null): Exclusion | null {
  if (screen?.reason) return screen.reason;
  if (settled === null || settled < PROVEN_MIN_SETTLED) return "under 30 settled";
  return null;
}

export interface ScreenSource { trades(wallet: string, sinceMs: number): Promise<Trade[]> }

/** Screens the $1M+ wallets screened longest ago (or never), `perRun` at a time, each at most once a day. */
export async function screenWallets(db: Db, src: ScreenSource, now: number, perRun = 15): Promise<{ screened: number; proven: number; excluded: number }> {
  const due = await db.select({ wallet: watchlist.wallet }).from(watchlist)
    .where(and(sql`${watchlist.pnl} >= 1000000`, or(isNull(watchlist.screenedAt), lt(watchlist.screenedAt, new Date(now - 86_400_000)))))
    .orderBy(asc(sql`coalesce(${watchlist.screenedAt}, 'epoch')`)).limit(perRun);
  let proven = 0, excluded = 0;
  for (const { wallet } of due) {
    let s: Screen;
    try { s = screenTrades(await src.trades(wallet, now - SCREEN_DAYS * 86_400_000)); } catch { continue; }
    const rec = (await db.execute(sql`select resolved from terminal.trader_records where wallet = ${wallet}`)).rows[0] as { resolved: number } | undefined;
    const settled = rec ? Number(rec.resolved) : null;
    const reason = provenReason(s, settled);
    await db.update(watchlist).set({ screenedAt: new Date(now), exclusion: reason, settled, screen: s, tier: reason ? "pro" : "millionaire" }).where(eq(watchlist.wallet, wallet));
    if (reason) excluded++; else proven++;
  }
  return { screened: due.length, proven, excluded };
}

/** Who is excluded and why (/methodology), and how many are proven. */
export async function exclusions(db: Db): Promise<{ proven: number; screened: number; excluded: Array<{ wallet: string; reason: Exclusion; pnl: number }>; byReason: Record<string, number> }> {
  const r = (await db.execute(sql`select wallet, exclusion as excluded, pnl from terminal.watchlist where pnl >= 1000000 and screened_at is not null order by pnl desc`)).rows as Array<{ wallet: string; excluded: Exclusion | null; pnl: number }>;
  const excluded = r.filter(x => x.excluded).map(x => ({ wallet: x.wallet, reason: x.excluded!, pnl: Number(x.pnl) }));
  const byReason: Record<string, number> = {};
  for (const e of excluded) byReason[e.reason] = (byReason[e.reason] ?? 0) + 1;
  return { proven: r.length - excluded.length, screened: r.length, excluded, byReason };
}
