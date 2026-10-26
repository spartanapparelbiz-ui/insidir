/* Server-side extras for the Terminal table: each paid row's 30-minute gap sparkline (from real price ticks), today's
 * totals on the viewer's clock, and how many deals closed today before the free feed could show them. Server only. */
import { and, eq, gte, inArray } from "drizzle-orm";
import { getDb, hasDatabase } from "./db";
import { liveEvents } from "./db/schema";
import { HISTORY_MS, historyFrom } from "./deal-view";
import type { FeedRow, StoredOpp } from "./feed";
import type { RawPriceTick } from "./live/types";
import type { ReceiptRow } from "./queries";
import { allowedVenues, venuesOk } from "./region";
import type { Region } from "./types";

/** Adds `spark` to every unlocked lock row (one query for all of them). */
export async function withSparks(rows: FeedRow[], opps: readonly StoredOpp[], now: number): Promise<FeedRow[]> {
  const ids = rows.filter(r => !r.locked && r.kind !== "second_opinion").map(r => r.id);
  if (!ids.length || !hasDatabase()) return rows;
  const byId = new Map(opps.map(o => [o.live.id, o]));
  const ticks = new Map<string, Array<{ at: number; legs: Array<{ avgPrice: number }>; roi: number }>>();
  try {
    const got = await getDb().select({ oppId: liveEvents.oppId, data: liveEvents.data, at: liveEvents.at }).from(liveEvents)
      .where(and(eq(liveEvents.type, "price_tick"), inArray(liveEvents.oppId, ids), gte(liveEvents.at, new Date(now - HISTORY_MS))))
      .orderBy(liveEvents.id).limit(5000);
    for (const t of got) {
      const d = t.data as unknown as RawPriceTick;
      const list = ticks.get(t.oppId ?? "") ?? [];
      list.push({ at: t.at.getTime(), legs: d.legs, roi: d.roi });
      ticks.set(t.oppId ?? "", list);
    }
  } catch { /* sparklines are extras: rows still render */ }
  return rows.map(r => {
    const s = byId.get(r.id);
    return s && !r.locked && r.kind !== "second_opinion" ? { ...r, spark: historyFrom(s, ticks.get(r.id) ?? [], now)?.points ?? null } : r;
  });
}

export interface TodayTotals { found: number; bestRoi: number | null }

/** Deals found today (UTC) on the viewer's clock, and the best ROI among them. */
export function todayTotals(log: readonly ReceiptRow[], todayStart: number, clock: number): TodayTotals {
  const today = log.filter(r => r.detectedAt >= todayStart && r.detectedAt <= clock && r.snapshot.kind !== "second_opinion");
  return { found: today.length, bestRoi: today.length ? Math.max(...today.map(r => r.snapshot.roi)) : null };
}

/** Deals found today that closed before the free feed could show them (open for less than the delay), in the
 *  viewer's region. Counted from real opportunity rows; nothing about them is sent but the count. */
export function missedToday(opps: readonly StoredOpp[], region: Region | null, delayMs: number, todayStart: number, now: number): number {
  const venues = allowedVenues(region);
  return opps.filter(s => s.firstSeenAt >= todayStart && s.live.kind !== "second_opinion" && s.live.safety !== "red" && venuesOk(s.live, venues)
    && (!s.active || now - s.lastSeenAt > 5 * 60_000) && s.lastSeenAt - s.firstSeenAt < delayMs).length;
}
