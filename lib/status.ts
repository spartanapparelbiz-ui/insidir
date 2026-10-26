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

/** The safety switch: once live data has been paused (no good scan for STALE_MS) for this long, every buy and checkout
 *  button is hidden and checkout refuses, so no one pays while the feed is broken. */
export const CHECKOUT_CLOSE_AFTER_PAUSED_MS = 10 * 60_000;

/** Checkout is open while the newest good scan is at most STALE_MS + 10 minutes old. No scan at all: closed. */
export const checkoutOpenAt = (lastScanAt: number | null, now: number): boolean =>
  lastScanAt !== null && now - lastScanAt <= STALE_MS + CHECKOUT_CLOSE_AFTER_PAUSED_MS;

export const CHECKOUT_CLOSED_TEXT = "Checkout opens when live data is back";

/** Whether anyone may start a checkout right now (reads the scan heartbeats). */
export async function checkoutOpen(now = Date.now()): Promise<boolean> {
  return checkoutOpenAt((await dataStatus(now)).lastScanAt, now);
}

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

/* ---------- /api/health ---------- */

export interface VenueHealth { lastScanAt: string | null; ageSeconds: number | null; ok: boolean | null; error: string | null; paused: boolean }
export interface Health {
  /** The web process is up. Always true here: Railway's health check must not fail when only the worker is down. */
  ok: true;
  /** "not_configured": no DATABASE_URL; "unreachable": the query failed (database down, or migrations not applied). */
  database: "ok" | "not_configured" | "unreachable";
  live: boolean;
  /** The safety switch (checkoutOpenAt): false hides every buy button and makes checkout refuse. */
  checkoutOpen: boolean;
  /** The latest scan heartbeat per exchange. All null = the worker has never written one to this database. */
  venues: Record<Venue, VenueHealth>;
  /** The worker's other jobs (sweep, alerts, whales, settle…): when each last ran and whether it failed. */
  jobs: Record<string, { lastRunAt: string; ok: boolean; error: string | null }>;
  checkedAt: string;
}

const clip = (s: string | null): string | null => (s ? s.slice(0, 200) : null);

export function healthFrom(rows: ReadonlyArray<{ job: string; lastRunAt: number; ok: boolean; error: string | null }>, now: number): Omit<Health, "ok" | "database" | "checkedAt"> {
  const status = statusFrom(rows, now);
  const venues = {} as Record<Venue, VenueHealth>;
  for (const v of ["kalshi", "polymarket", "polymarket_us"] as const) {
    const b = rows.find(r => r.job === "scan:" + v);
    venues[v] = b
      ? { lastScanAt: new Date(b.lastRunAt).toISOString(), ageSeconds: Math.round((now - b.lastRunAt) / 1000), ok: b.ok, error: clip(b.error), paused: status.paused.includes(v) }
      : { lastScanAt: null, ageSeconds: null, ok: null, error: null, paused: false };
  }
  const jobs: Health["jobs"] = {};
  for (const r of rows) if (!r.job.startsWith("scan:") && !r.job.startsWith("e2e:")) jobs[r.job] = { lastRunAt: new Date(r.lastRunAt).toISOString(), ok: r.ok, error: clip(r.error) };
  return { live: status.live, checkoutOpen: checkoutOpenAt(status.lastScanAt, now), venues, jobs };
}

export async function health(now = Date.now()): Promise<Health> {
  const checkedAt = new Date(now).toISOString();
  if (!hasDatabase()) return { ok: true, database: "not_configured", checkedAt, ...healthFrom([], now) };
  try {
    const rows = await getDb().select().from(workerHeartbeats);
    return { ok: true, database: "ok", checkedAt, ...healthFrom(rows.map(r => ({ job: r.job, lastRunAt: r.lastRunAt.getTime(), ok: r.ok, error: r.error })), now) };
  } catch (e) {
    // The message can name internal hosts or the database user; it goes to the logs, not to this public endpoint.
    console.error("health: database query failed:", e instanceof Error ? e.message : e);
    return { ok: true, database: "unreachable", checkedAt, ...healthFrom([], now) };
  }
}
