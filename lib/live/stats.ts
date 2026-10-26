/* Numbers the live elements quote, all computed from the database: how long a deal usually stays open, how often
 * one shows up, and the running total of profit flagged since launch. A null means "not enough data yet": the page
 * hides the line instead of guessing. Server only. */
import { sql } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { allowedVenues } from "@/lib/region";
import type { Region, Venue } from "@/lib/types";

/** The stake the running total assumes for every green deal. */
export const FLAG_STAKE = 500;
const WINDOW_DAYS = 7;

export const median = (xs: readonly number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Median minutes between consecutive finds, from first-seen times (any order). Null with fewer than 3 finds. */
export function medianGapMin(foundAt: readonly number[]): number | null {
  if (foundAt.length < 3) return null;
  const s = [...foundAt].sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < s.length; i++) gaps.push((s[i]! - s[i - 1]!) / 60_000);
  return median(gaps);
}

/** Profit flagged on one green deal at FLAG_STAKE: its after-fee profit, scaled to what $500 buys (capped at what
 *  the books could fill). */
export function flaggedAtStake(o: { profit: number; cost: number; fees: number }, stake = FLAG_STAKE): number {
  const outlay = o.cost + o.fees;
  if (!(outlay > 0) || !(o.profit > 0)) return 0;
  return o.profit * (Math.min(stake, outlay) / outlay);
}

export interface LiveStats {
  medianLifeMin: number | null;
  medianGapMin: number | null;
  /** Green deals found today (UTC), on the viewer's clock (free: 30 minutes late). */
  foundToday: number;
  flagged: { total: number; since: number } | null;
}

const venueFilter = (region: Region | null) => {
  const allowed = new Set<Venue>(allowedVenues(region));
  const banned = (["kalshi", "polymarket", "polymarket_us"] as Venue[]).filter(v => !allowed.has(v));
  return banned.length
    ? sql`and not exists (select 1 from jsonb_array_elements(r.snapshot->'legs') l where l->>'venue' = any(${banned}))`
    : sql``;
};

/** The live numbers for one viewer: `delayMs` is their plan's feed delay, `region` their region. */
export async function liveStats(region: Region | null, delayMs: number, now = Date.now()): Promise<LiveStats> {
  const empty: LiveStats = { medianLifeMin: null, medianGapMin: null, foundToday: 0, flagged: null };
  if (!hasDatabase()) return empty;
  try {
    const db = getDb();
    const clock = new Date(now - delayMs);
    const since = new Date(now - WINDOW_DAYS * 86_400_000);
    const today = new Date(Date.UTC(clock.getUTCFullYear(), clock.getUTCMonth(), clock.getUTCDate()));
    const vf = venueFilter(region);
    const [life, finds, totals] = await Promise.all([
      db.execute(sql`select percentile_cont(0.5) within group (order by extract(epoch from (last_seen_at - first_seen_at)) / 60) as m, count(*)::int as n
        from terminal.opportunities where active = false and kind <> 'second_opinion' and first_seen_at >= ${since}`),
      db.execute(sql`select extract(epoch from r.detected_at) * 1000 as t from terminal.receipts r
        where r.safety = 'green' and r.kind <> 'second_opinion' and r.detected_at >= ${since} and r.detected_at <= ${clock} ${vf} order by r.detected_at`),
      db.execute(sql`select coalesce(sum(
          ((r.snapshot->>'profit')::float8) * least(${FLAG_STAKE}::float8, (r.snapshot->>'cost')::float8 + (r.snapshot->>'fees')::float8)
          / nullif((r.snapshot->>'cost')::float8 + (r.snapshot->>'fees')::float8, 0)), 0) as total,
          min(r.detected_at) as since, count(*)::int as n
        from terminal.receipts r where r.safety = 'green' and r.kind <> 'second_opinion' and (r.snapshot->>'profit')::float8 > 0
          and r.detected_at <= ${clock} ${vf}`),
    ]);
    const lifeRow = life.rows[0] as { m: number | null; n: number } | undefined;
    const findTimes = (finds.rows as Array<{ t: number | string }>).map(r => Number(r.t));
    const tot = totals.rows[0] as { total: number | string; since: Date | string | null; n: number } | undefined;
    return {
      medianLifeMin: lifeRow && lifeRow.n >= 3 && lifeRow.m !== null ? Number(lifeRow.m) : null,
      medianGapMin: medianGapMin(findTimes),
      foundToday: findTimes.filter(t => t >= today.getTime()).length,
      flagged: tot && tot.n > 0 && tot.since ? { total: Number(tot.total), since: new Date(tot.since).getTime() } : null,
    };
  } catch (e) {
    console.error("liveStats failed:", e instanceof Error ? e.message : e);
    return empty;
  }
}
