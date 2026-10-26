/* The worker's V2 jobs (wired in worker/index.ts):
 *   moves      every MOVES_MS (15s): Polymarket and Kalshi polls → moves (new ones also go on the live stream)
 *   moves:settle  every 10 min: markets with unsettled moves → won / lost / void
 *   moves:records every 5 min: wallets seen moving this week → their record from real resolved positions
 * Each writes a heartbeat (moves:polymarket, moves:kalshi) that the feed's status line reads. */
import type { Db } from "@/lib/db";
import type { KalshiClient, PolymarketClient } from "@/lib/exchanges";
import type { VMarket } from "@/lib/types";
import type { WalletTrade } from "./detect";
import { MarketDirectory } from "./directory";
import { MovesPoller } from "./poll";
import { recordFrom, type ResolvedPosition } from "./records";
import { readClosedPositions } from "./sources";
import { saveRecord, settleMarket, unsettledMarkets, upsertMoves, walletsToRecord } from "./store";
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

export async function recordsOnce(db: Db, poly: PolymarketClient, now: number, perRun = 10): Promise<number> {
  let n = 0;
  for (const w of await walletsToRecord(db, now, RECORD_STALE_MS, perRun)) {
    const positions: ResolvedPosition[] = [];
    let complete = false;
    for (let page = 0; page < RECORD_MAX_PAGES; page++) {
      const raw = await poly.getClosedPositionsPage(w.wallet, { limit: 50, offset: page * 50 });
      positions.push(...readClosedPositions(raw));
      if (rows(raw).length < 50) { complete = true; break; }
    }
    if (!complete) continue;
    await saveRecord(db, recordFrom(w.wallet, w.name, positions, now));
    n++;
  }
  return n;
}
