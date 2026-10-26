/* Is live data flowing? The worker writes a heartbeat per venue after every scan (terminal.worker_heartbeats,
 * job "scan:<venue>"). When a venue's last good scan is older than STALE_MS, or the worker isn't running, pages show
 * "Live data paused, retrying" and nothing is presented as live. Deals not re-confirmed within FRESH_MS are greyed. */
import { like } from "drizzle-orm";
import { getDb, hasDatabase } from "./db";
import { workerHeartbeats } from "./db/schema";
import type { Venue } from "./types";

/** A deal not re-confirmed by a scan within this long is shown greyed out, never as live. */
export const FRESH_MS = 60_000;
/** A venue whose last good scan is older than this is "paused". */
export const STALE_MS = 2 * 60_000;

export interface DataStatus { live: boolean; paused: Venue[]; lastScanAt: number | null }

export function statusFrom(beats: ReadonlyArray<{ job: string; lastRunAt: number; ok: boolean }>, now: number): DataStatus {
  const venues: Venue[] = ["kalshi", "polymarket", "polymarket_us"];
  const paused: Venue[] = [];
  let last: number | null = null;
  for (const v of venues) {
    const b = beats.find(x => x.job === "scan:" + v);
    if (b?.ok) last = Math.max(last ?? 0, b.lastRunAt);
    // A venue that has never been configured (no heartbeat at all) isn't "paused"; one that failed or went quiet is.
    if (b && (!b.ok || now - b.lastRunAt > STALE_MS)) paused.push(v);
  }
  const live = last !== null && now - last <= STALE_MS;
  return { live, paused, lastScanAt: last };
}

export async function dataStatus(now = Date.now()): Promise<DataStatus> {
  if (!hasDatabase()) return { live: false, paused: [], lastScanAt: null };
  try {
    const rows = await getDb().select().from(workerHeartbeats).where(like(workerHeartbeats.job, "scan:%"));
    return statusFrom(rows.map(r => ({ job: r.job, lastRunAt: r.lastRunAt.getTime(), ok: r.ok })), now);
  } catch { return { live: false, paused: [], lastScanAt: null }; }
}
