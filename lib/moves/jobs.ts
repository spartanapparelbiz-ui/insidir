/* The worker's V2 jobs (wired in worker/index.ts):
 *   moves      every MOVES_MS (15s): Polymarket and Kalshi polls → moves (new ones also go on the live stream)
 *   moves:settle  every 10 min: markets with unsettled moves → won / lost / void
 *   moves:records every 5 min: wallets seen moving this week (and the leaderboard's) → their record and resolved
 *                 positions (the profile stats)
 *   moves:leaderboard every 6 h: Polymarket's public leaderboard → wallets to record (for /top)
 * Each writes a heartbeat (moves:polymarket, moves:kalshi) that the feed's status line reads. */
import type { Db } from "@/lib/db";
import type { KalshiClient, PolymarketClient } from "@/lib/exchanges";
import type { VMarket } from "@/lib/types";
import type { WalletTrade } from "./detect";
import { MarketDirectory } from "./directory";
import { MovesPoller } from "./poll";
import { recordFrom } from "./records";
import { readLeaderboard } from "./sources";
import { movesToRealize, saveRealized, saveRecord, settleMarket, unsettledMarkets, upsertMoves, walletsToRecord } from "./store";
import { readWalletFills, realizeMove } from "./realize";
import { readClosedRows, type ClosedPosition } from "@/lib/profiles/trader";
import { savePositions, tabHints, trackWallets } from "@/lib/profiles/store";
import { rows } from "@/lib/exchanges/parse";

export const MOVES_MS = Number(process.env.MOVES_MS ?? 15_000);
export const RECORD_STALE_MS = 12 * 3_600_000;
/** Closed-position pages read per wallet (50 each). A wallet with more history than this gets no record rather than
 *  a partial one. */
export const RECORD_MAX_PAGES = 100;

export function movesPoller(poly: PolymarketClient, kalshi: KalshiClient): MovesPoller {
  return new MovesPoller({
    polyTradesPage: offset => poly.getTradesPage({ filterAmount: Number(process.env.WHALE_FILL_MIN ?? 500), offset, priority: "hot" }),
    polyWalletTrades: async (wallet, sinceMs): Promise<WalletTrade[]> =>
      (await poly.getActivity(wallet, { type: "TRADE", start: sinceMs, maxPages: 1, priority: "normal" }))
        .filter(a => a.conditionId && a.side)
        .map(a => ({ marketId: a.conditionId!, outcomeSide: a.outcomeIndex === 1 ? "no" : "yes", side: a.side!, at: a.timestamp })),
    polyWalletIsNew: async (wallet, beforeMs) =>
      (await poly.getActivity(wallet, { end: beforeMs - 1000, maxPages: 1, limit: 1, priority: "normal" })).length === 0,
    kalshiTradesPage: (minTsSec, cursor) => kalshi.getTradesPage({ minTsSec, cursor }),
  });
}

/** One poll of both venues. Market details come from the directory (database first, then the venue), so the worker
 *  never holds the full market list. */
export async function movesOnce(db: Db, poller: MovesPoller, directory: MarketDirectory, now: number,
  beat: (job: string, ok: boolean, err?: string) => Promise<void>): Promise<string[]> {
  const fresh: string[] = [];
  try {
    fresh.push(...await upsertMoves(db, await poller.pollPolymarket(now, ids => directory.lookup("polymarket", ids, now))));
    await beat("moves:polymarket", true);
  } catch (e) { await beat("moves:polymarket", false, e instanceof Error ? e.message : String(e)); }
  try {
    fresh.push(...await upsertMoves(db, await poller.pollKalshi(now, ids => directory.lookup("kalshi", ids, now))));
    await beat("moves:kalshi", true);
  } catch (e) { await beat("moves:kalshi", false, e instanceof Error ? e.message : String(e)); }
  return fresh;
}

export async function settleMovesOnce(db: Db, clients: { polymarket: PolymarketClient; kalshi: KalshiClient }, now: number): Promise<number> {
  const due = await unsettledMarkets(db, new Date(now - 3_600_000));
  let n = 0;
  for (const source of ["polymarket", "kalshi"] as const) {
    const ids = due.filter(d => d.source === source).map(d => d.marketId);
    if (!ids.length) continue;
    const got = await clients[source].getMarketsById(ids);
    for (const [id, m] of got) if (m.result) { await settleMarket(db, source, id, m.result, new Date(now)); n++; }
  }
  return n;
}

/** Settled Polymarket moves → what each really made, from the wallet's own trades in that market (sells before the
 *  result included). Runs after settling; also catches up moves settled before this existed, biggest first. */
export async function realizeOnce(db: Db, poly: PolymarketClient, now: number, perRun = 30): Promise<number> {
  const due = await movesToRealize(db, perRun);
  const fills = new Map<string, ReturnType<typeof readWalletFills>>();
  let n = 0;
  for (const m of due) {
    if (!m.wallet || !m.result) continue;
    const key = `${m.wallet}|${m.marketId}`;
    if (!fills.has(key)) {
      try { fills.set(key, readWalletFills(await poly.getWalletMarketTradesAll(m.wallet, m.marketId))); } catch { continue; }
    }
    const result = m.result === "void" ? "void" : m.result === "won" ? m.outcomeSide : m.outcomeSide === "yes" ? "no" : "yes";
    await saveRealized(db, m.id, realizeMove(m, fills.get(key)!, result, m.settledAt ?? now), new Date(now));
    n++;
  }
  return n;
}

/** Each due wallet: every resolved position (kept for the profile), its record, and its biggest bet ever (closed
 *  positions' money in and open positions' initial value). */
export async function recordsOnce(db: Db, poly: PolymarketClient, now: number, perRun = 10): Promise<number> {
  let n = 0;
  for (const w of await walletsToRecord(db, now, RECORD_STALE_MS, perRun)) {
    const closed: ClosedPosition[] = [];
    let complete = false;
    for (let page = 0; page < RECORD_MAX_PAGES; page++) {
      const raw = await poly.getClosedPositionsPage(w.wallet, { limit: 50, offset: page * 50 });
      closed.push(...readClosedRows(raw));
      if (rows(raw).length < 50) { complete = true; break; }
    }
    if (!complete) continue;
    const open = await poly.getPositions(w.wallet, { sizeThreshold: 0 });
    const biggestBet = Math.max(0, ...closed.map(p => p.moneyIn), ...open.map(p => p.initialValue ?? 0));
    const record = recordFrom(w.wallet, w.name, closed.map(p => ({ marketId: p.marketId, realizedPnl: p.pnl })), now);
    await savePositions(db, w.wallet, closed, await tabHints(db, closed.map(p => p.marketId)));
    await saveRecord(db, { ...record, biggestBet: Math.round(biggestBet * 100) / 100 });
    n++;
  }
  return n;
}

/** LEADERBOARD_WALLETS per window from Polymarket's public leaderboard, so /top covers the real top traders. Their
 *  records are built from their own resolved positions like everyone else's. */
export const LEADERBOARD_WALLETS = 100;
export async function leaderboardOnce(db: Db, poly: PolymarketClient): Promise<number> {
  const seen = new Map<string, string | null>();
  for (const timePeriod of ["ALL", "MONTH", "WEEK"] as const) {
    for (const category of ["OVERALL", "SPORTS"]) {
      for (let offset = 0; offset < LEADERBOARD_WALLETS; offset += 50) {
        const raw = await poly.getLeaderboardPage({ timePeriod, category, limit: 50, offset });
        const got = readLeaderboard(raw);
        for (const r of got) if (!seen.has(r.wallet)) seen.set(r.wallet, r.name);
        if (got.length < 50) break;
      }
    }
  }
  if (seen.size) await trackWallets(db, [...seen].map(([wallet, name]) => ({ wallet, name })), "leaderboard");
  return seen.size;
}
