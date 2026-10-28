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
import { collapsePosition, duplicatePositions, movesToRealize, saveRealized, saveRecord, settleMarket, unsettledMarkets, upsertMoves, walletsToRecord } from "./store";
import { readWalletFills, realizeMove } from "./realize";
import { fromParts, MERGE_WINDOW_MS, sortParts } from "./detect";
import { readPolymarketFills } from "./sources";
import { moves } from "@/lib/db/schema";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { classify, sportsLeagueOf } from "./classify";
import type { FillPart } from "./types";
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

/** Polymarket moves filed under Markets that are really sports (esports, totals, spreads, football "Will X FC win"):
 *  each market is read again with its tags and the moves are moved to Sports, with their league. Idempotent. */
let reclassifyOffset = 0;
export async function reclassifyOnce(db: Db, poly: PolymarketClient, perRun = 200): Promise<number> {
  // Walks every Markets-tab Polymarket market a page per run (newest first), then starts over.
  const rows = await db.selectDistinct({ marketId: moves.marketId, eventTitle: moves.eventTitle, marketTitle: moves.marketTitle }).from(moves)
    .where(and(eq(moves.source, "polymarket"), eq(moves.tab, "markets"))).orderBy(moves.marketId).limit(perRun).offset(reclassifyOffset);
  reclassifyOffset = rows.length < perRun ? 0 : reclassifyOffset + perRun;
  if (!rows.length) return 0;
  let fresh = new Map<string, VMarket>();
  try { fresh = await poly.getMarketsById(rows.map(r => r.marketId)); } catch { /* words alone this time */ }
  let n = 0;
  for (const r of rows) {
    const m = fresh.get(r.marketId);
    const c = classify(m?.category ?? "other", [r.eventTitle, r.marketTitle, m?.eventTitle ?? null, m?.title ?? null, m?.seriesId ?? null]);
    if (c.tab !== "sports") continue;
    await db.update(moves).set({ tab: "sports", league: c.league, category: "sports" }).where(and(eq(moves.source, "polymarket"), eq(moves.marketId, r.marketId)));
    n++;
  }
  return n;
}

let leagueOffset = 0;
/** Sports moves saved without a league (or "other") get one from their titles: a competition or club they name
 *  (lib/moves/leagues.ts). Walks them a page per run, then starts over. */
export async function leagueBackfillOnce(db: Db, perRun = 500): Promise<number> {
  const rows = await db.select({ id: moves.id, eventTitle: moves.eventTitle, marketTitle: moves.marketTitle, marketId: moves.marketId }).from(moves)
    .where(and(eq(moves.tab, "sports"), or(isNull(moves.league), eq(moves.league, "other")))).orderBy(moves.id).limit(perRun).offset(leagueOffset);
  let n = 0;
  for (const r of rows) {
    const league = sportsLeagueOf([r.eventTitle, r.marketTitle, r.marketId]);
    if (league === "other") continue;
    await db.update(moves).set({ league }).where(eq(moves.id, r.id));
    n++;
  }
  // Updated rows leave the set this walks, so the next page skips only the ones still without a league.
  leagueOffset = rows.length < perRun ? 0 : leagueOffset + rows.length - n;
  return n;
}

/** Positions saved as several moves before moves merged by position: each group becomes one move, rebuilt from the
 *  wallet's own BUY fills in that market and outcome over the group's time span (same fill ids as the live feed).
 *  Idempotent: nothing to do once there are no duplicates. */
export async function dedupeOnce(db: Db, poly: PolymarketClient, perRun = 20): Promise<number> {
  let n = 0;
  for (const g of await duplicatePositions(db, perRun)) {
    let parts: FillPart[] | null = null;
    try {
      const rows = await db.select({ at: moves.at, lastAt: moves.lastAt }).from(moves).where(inArray(moves.id, g.ids));
      const from = Math.min(...rows.map(r => r.at.getTime())) - 1000, to = Math.max(...rows.map(r => r.lastAt.getTime())) + MERGE_WINDOW_MS;
      const idx = g.outcomeSide === "no" ? 1 : 0;
      parts = readPolymarketFills(await poly.getWalletMarketTradesAll(g.wallet, g.marketId))
        .filter(f => f.wallet === g.wallet && f.marketId === g.marketId && f.side === "BUY" && (f.outcomeSide === "no" ? 1 : 0) === idx && f.at >= from && f.at <= to)
        .map(f => ({ id: f.id, c: f.contracts, p: f.price, at: f.at }));
      parts = sortParts(parts);
    } catch { parts = null; }
    await collapsePosition(db, g.ids, parts);
    n++;
  }
  return n;
}

/** Moves merged before their fills were put in time order (the dedupe of 2026-10-28 kept the Data API's newest-first
 *  order): their start and end came out swapped, so the record job counted only the last buy and the accuracy
 *  check found no fills between them. Each is rebuilt from its own fills in order, its record worked out again
 *  (realized_at cleared), and it's shown again if that bug is what hid it. Nothing to do once all are fixed. */
export async function repairSwappedOnce(db: Db, perRun = 200): Promise<number> {
  const rows = (await db.execute(sql`select id, parts, hidden_reason from terminal.moves where parts is not null and jsonb_array_length(parts) > 1 and last_at < at limit ${perRun}`)).rows as Array<{ id: string; parts: FillPart[]; hidden_reason: string | null }>;
  for (const r of rows) {
    const parts = sortParts(r.parts), f = fromParts(parts);
    const unhide = r.hidden_reason === "no matching fills at the source" || (r.hidden_reason ?? "").startsWith("Not a new bet") || (r.hidden_reason ?? "").startsWith("amount ");
    await db.update(moves).set({ amount: f.amount, avgPrice: f.avgPrice, at: new Date(f.at), lastAt: new Date(f.lastAt), fills: f.fills,
      sourceRefs: sql`${JSON.stringify(f.sourceRefs ?? [])}::jsonb`, parts: sql`${JSON.stringify(parts)}::jsonb`, realizedAt: null, pnl: null, soldShare: null,
      ...(unhide ? { hiddenAt: null, hiddenReason: null } : {}) }).where(eq(moves.id, r.id));
  }
  return rows.length;
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
