/* Everything the visitors' home page shows (components/open/Landing.tsx), read in parallel. A part that fails or has
 * no data comes back empty and its section is left out; every number is read from the database, never made up.
 *   board     the Millionaires' board, VISITOR_DELAY_MS late (members see it live on /board)
 *   stats     big bets tracked, $1M+ wallets tracked, $1M+ money moved in the last 24 hours
 *   featured  a real Read of tonight's top market (lib/nx/featured.ts)
 *   ticker    the last 24 hours' biggest bets, newest first (the marquee)
 *   record    the trackers' followable records by window, and how the millionaire pings did */
import type { Db } from "@/lib/db";
import { memo } from "@/lib/memo";
import { electionMode, recordWindows, type Clients, type RecordRow, type RecordWindow } from "@/lib/nx/data";
import { featuredRead, type Featured } from "@/lib/nx/featured";
import { skyBets, type SkyBet } from "@/lib/sky/skyline";
import { boardRows, boardStats, lastHourCount, VISITOR_DELAY_MS, type BoardRow, type BoardStats } from "@/lib/millionaire/board";
import { pingReceipts } from "@/lib/millionaire/pings";

export interface OpenLanding {
  now: number; election: boolean; us: boolean;
  board: BoardRow[]; hour: number; stats: BoardStats | null; featured: Featured | null; ticker: SkyBet[];
  record: Record<RecordWindow, RecordRow[]>; receipts: { won: number; lost: number; open: number } | null;
}

export const EMPTY_RECORD = (): Record<RecordWindow, RecordRow[]> => ({ "1w": [], "1m": [], "3m": [], all: [] });
export const emptyLanding = (now: number, us: boolean): OpenLanding => ({ now, election: electionMode(now), us, board: [], hour: 0, stats: null, featured: null, ticker: [], record: EMPTY_RECORD(), receipts: null });

export async function openLanding(db: Db, clients: Clients, now: number, us: boolean): Promise<OpenLanding> {
  const [board, hour, stats, featured, sky, record, receipts] = await Promise.all([
    memo("open:board:late", 60_000, () => boardRows(db, now, { delayMs: VISITOR_DELAY_MS, limit: 8 })).catch(() => [] as BoardRow[]),
    memo("open:hour", 30_000, () => lastHourCount(db, now)).catch(() => 0),
    memo("open:stats", 60_000, () => boardStats(db, now)).catch(() => null),
    featuredRead(db, clients, now).catch(() => null),
    memo("sky:landing:sky", 20_000, () => skyBets(db, now)).catch(() => [] as SkyBet[]),
    memo("sky:landing:record", 5 * 60_000, () => recordWindows(db, now, 6)).catch(EMPTY_RECORD),
    memo("open:receipts", 5 * 60_000, () => pingReceipts(db)).catch(() => null),
  ]);
  const ticker = [...sky].sort((a, b) => b.at - a.at).slice(0, 16);
  // The wallet address never goes into the page for visitors.
  return { now, election: electionMode(now), us, board: board.map(b => ({ ...b, wallet: "", short: "" })), hour, stats, featured, ticker, record, receipts };
}
