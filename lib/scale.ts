/* The real scale line: "Scanning 41,203 markets across 2 apps right now." Counts the markets the worker's last
 * sweeps saw (terminal.markets rows refreshed in the last SCALE_WINDOW_MS) on the venues this viewer may see whose
 * scans are healthy. Nothing to say (scanner paused, no fresh markets) is null, and the line is hidden. Server only. */
import { gte, sql } from "drizzle-orm";
import { getDb, hasDatabase } from "./db";
import { markets } from "./db/schema";
import { allowedVenues } from "./region";
import type { DataStatus } from "./status";
import type { Region, Venue } from "./types";

/** Five full sweeps (one a minute by default): a market the venue stopped listing drops out of the count. */
export const SCALE_WINDOW_MS = 5 * 60_000;

export interface Scale { markets: number; apps: number }

export function scaleFrom(counts: ReadonlyArray<{ venue: Venue; n: number }>, region: Region | null, status: DataStatus): Scale | null {
  if (!status.live) return null;
  const venues = allowedVenues(region).filter(v => !status.paused.includes(v));
  const mine = counts.filter(c => venues.includes(c.venue) && c.n > 0);
  const total = mine.reduce((s, c) => s + c.n, 0);
  return total > 0 ? { markets: total, apps: mine.length } : null;
}

export async function scanScale(region: Region | null, status: DataStatus, now = Date.now()): Promise<Scale | null> {
  if (!hasDatabase() || !status.live) return null;
  try {
    const rows = await getDb().select({ venue: markets.venue, n: sql<number>`count(*)::int` }).from(markets)
      .where(gte(markets.updatedAt, new Date(now - SCALE_WINDOW_MS))).groupBy(markets.venue);
    return scaleFrom(rows, region, status);
  } catch (e) {
    console.error("scanScale failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

export const scaleText = (s: Scale): string =>
  `Scanning ${s.markets.toLocaleString("en-US")} ${s.markets === 1 ? "market" : "markets"} ${s.apps === 1 ? "on 1 app" : `across ${s.apps} apps`} right now`;
