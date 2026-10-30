/* The price Insidir showed each position at (moves.seen_price), and for trackers tagged after the fact (Momentum,
 * Early, Late) the price when the tag was added (terminal.move_tags). Run by the worker every minute: new positions a
 * few minutes after they're shown, and the backlog (every older position) newest first, a batch at a time.
 *
 *   seen price  the side's price at seen_at from the venue's price history: Polymarket CLOB /prices-history (minute
 *               points around it), Kalshi candlesticks (one-minute, or hourly over long spans). The last point at or
 *               before seen_at, else the first within 30 minutes after. No point near: seen_src "none" (left out).
 *   Momentum    tagged when the market had moved 5 points toward the side; backfill finds that moment in the history
 *               after seen_at. Not found there (too coarse): the threshold itself (entry + 5 points), src "threshold".
 *   Early, Late knowable from the start time the moment Insidir showed it: tagged at seen_at, at the seen price.
 * New tags from now on are recorded live by lib/markets/info.ts tagObserved. Server only. */
import { eq, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { moves, moveTags } from "@/lib/db/schema";
import type { KalshiClient, PolymarketClient } from "@/lib/exchanges";
import { infoFor, kalshiSeries, readInfos, readKalshiCandles, readPolyHistory, type MarketInfo } from "@/lib/markets/info";
import { STEAM } from "@/lib/trackers";
import { crossedAt, priceAt, type PricePoint } from "./math";

const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
/** Wait this long after a position is shown before reading its price (the venue's history needs the minute). */
export const SEEN_DELAY_MS = 3 * MIN;
const OBSERVED = ["steam", "early-money", "late-money"] as const;

type Clients = { polymarket: PolymarketClient; kalshi: KalshiClient };
interface Due { id: string; source: "polymarket" | "kalshi"; marketId: string; side: "yes" | "no"; seenAt: number; avgPrice: number; trackers: string[]; seenPrice: number | null }

/** A market's YES history covering [from, to], at the finest resolution the venue gives for that span. */
async function history(c: Clients, info: MarketInfo | undefined, source: "polymarket" | "kalshi", marketId: string, from: number, to: number): Promise<PricePoint[]> {
  const span = to - from;
  if (source === "polymarket") {
    if (!info?.historyKey) return [];
    const fidelity = span <= 2 * DAY ? 1 : span <= 14 * DAY ? 10 : 60;
    return readPolyHistory(await c.polymarket.getPriceHistoryRange(info.historyKey, from, to, fidelity).catch(() => null));
  }
  const series = info?.historyKey ?? kalshiSeries(marketId);
  if (!series) return [];
  const period = span <= 3 * DAY ? 1 : span <= 60 * DAY ? 60 : 1440;
  return readKalshiCandles(await c.kalshi.getCandlesticks(series, marketId, from, to, period).catch(() => null));
}

export async function seenOnce(db: Db, c: Clients, now: number, batch = 200): Promise<{ priced: number; none: number; tags: number }> {
  // Positions still without a seen price (newest first), plus older ones whose after-the-fact tags have no row yet.
  const r = await db.execute(sql`select m.id, m.source, m.market_id, m.outcome_side, m.seen_at, m.avg_price, m.trackers, m.seen_price
    from terminal.moves m where m.source in ('polymarket', 'kalshi') and m.seen_at <= ${new Date(now - SEEN_DELAY_MS)}
      and ((m.seen_price is null and m.seen_src is null)
        or (m.trackers && array['steam','early-money','late-money']::text[] and m.seen_price is not null and exists (
          select 1 from unnest(m.trackers) t where t in ('steam','early-money','late-money')
            and not exists (select 1 from terminal.move_tags g where g.move_id = m.id and g.tracker = t))))
    order by m.seen_at desc limit ${batch}`);
  const due: Due[] = (r.rows as Array<Record<string, unknown>>).map(x => ({ id: String(x.id), source: x.source as Due["source"], marketId: String(x.market_id),
    side: x.outcome_side === "no" ? "no" : "yes", seenAt: new Date(x.seen_at as string).getTime(), avgPrice: Number(x.avg_price),
    trackers: (x.trackers as string[] | null) ?? [], seenPrice: x.seen_price === null ? null : Number(x.seen_price) }));
  let priced = 0, none = 0, tags = 0;
  for (const source of ["polymarket", "kalshi"] as const) {
    const mine = due.filter(d => d.source === source);
    if (!mine.length) continue;
    const ids = [...new Set(mine.map(d => d.marketId))];
    let info = await infoFor(db, source, ids);
    const missing = ids.filter(id => !info.get(id)?.historyKey);
    if (missing.length) { await readInfos(db, c, source, missing, now).catch(() => []); info = await infoFor(db, source, ids); }
    for (const id of ids) {
      const ms = mine.filter(d => d.marketId === id);
      const from = Math.min(...ms.map(d => d.seenAt)) - 6 * HOUR;
      // Momentum needs the history after it was shown, to settlement (or now).
      const to = ms.some(d => d.trackers.includes("steam")) ? now : Math.min(now, Math.max(...ms.map(d => d.seenAt)) + HOUR);
      const h = await history(c, info.get(id), source, id, from, to);
      for (const d of ms) {
        let seen = d.seenPrice;
        if (seen === null) {
          seen = priceAt(h, d.seenAt, d.side);
          if (seen !== null) { await db.update(moves).set({ seenPrice: seen, seenSrc: "history" }).where(eq(moves.id, d.id)); priced++; }
          // Nothing near yet: a recent one is tried again later; after a day it's left out for good.
          else if (now - d.seenAt > DAY || (h.length === 0 && info.get(id)?.historyKey === null)) { await db.update(moves).set({ seenSrc: "none" }).where(eq(moves.id, d.id)); none++; }
        }
        if (seen === null) continue;
        const rows: Array<typeof moveTags.$inferInsert> = [];
        for (const t of OBSERVED) {
          if (!d.trackers.includes(t)) continue;
          if (t === "steam") {
            const x = crossedAt(h, d.seenAt, d.side, d.avgPrice, STEAM);
            rows.push(x ? { moveId: d.id, tracker: t, taggedAt: new Date(x.t), taggedPrice: x.p, src: "history" }
              : { moveId: d.id, tracker: t, taggedAt: new Date(d.seenAt), taggedPrice: Math.min(0.99, d.avgPrice + STEAM), src: "threshold" });
          } else rows.push({ moveId: d.id, tracker: t, taggedAt: new Date(d.seenAt), taggedPrice: seen, src: "seen" });
        }
        if (rows.length) { await db.insert(moveTags).values(rows).onConflictDoNothing(); tags += rows.length; }
      }
    }
  }
  return { priced, none, tags };
}

/** How far the backfill has got: positions with a seen price, left out, and still to do. */
export async function seenProgress(db: Db): Promise<{ priced: number; none: number; left: number }> {
  const r = (await db.execute(sql`select count(*) filter (where seen_price is not null)::int as priced, count(*) filter (where seen_src = 'none')::int as none,
    count(*) filter (where seen_price is null and seen_src is null)::int as left from terminal.moves where source in ('polymarket', 'kalshi')`)).rows[0] as Record<string, number>;
  return { priced: Number(r.priced), none: Number(r.none), left: Number(r.left) };
}
