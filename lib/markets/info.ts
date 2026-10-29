/* What the venues say now about the markets we hold moves in (terminal.market_info): the YES price, the game's
 * start (Polymarket sports), whether it closed, and the key for its price history. Refreshed by the worker for
 * markets with open moves, least recently read first; each refresh also adds the observed tracker tags it shows
 * (lib/trackers.ts observedTags: Steam, Early money, Late money). And each market's price history, read on
 * request from the venue (Polymarket CLOB prices-history, Kalshi candlesticks). Server only. */
import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { marketInfo, moves } from "@/lib/db/schema";
import type { KalshiClient, PolymarketClient } from "@/lib/exchanges";
import { isObject, list, num, rows } from "@/lib/exchanges/parse";
import { fromRow } from "@/lib/moves/store";
import { observedTags } from "@/lib/trackers";
import { addTags } from "@/lib/trackers-tag";

export interface MarketInfo { source: "polymarket" | "kalshi"; marketId: string; yesPrice: number | null; startAt: number | null; closed: boolean; historyKey: string | null; updatedAt: number }

const DAY = 86_400_000;

/** Markets with open moves from the last 60 days, never read or least recently read first. */
async function due(db: Db, now: number, limit: number): Promise<Array<{ source: "polymarket" | "kalshi"; marketId: string }>> {
  const r = await db.execute(sql`select m.source, m.market_id from terminal.moves m
    left join terminal.market_info i on i.source = m.source and i.market_id = m.market_id
    where m.source in ('polymarket', 'kalshi') and m.result is null and m.hidden_at is null and m.at > ${new Date(now - 60 * DAY)}
      and (i.market_id is null or not i.closed)
    group by m.source, m.market_id, i.updated_at order by i.updated_at asc nulls first limit ${limit}`);
  return (r.rows as Array<{ source: "polymarket" | "kalshi"; market_id: string }>).map(x => ({ source: x.source, marketId: x.market_id }));
}

/** Kalshi's series ticker is the event ticker's first part ("KXNFLGAME-26NOV09NYJBUF" → "KXNFLGAME"). */
export const kalshiSeries = (ticker: string): string | null => /^([A-Z0-9]+)-/.exec(ticker)?.[1] ?? null;

export async function marketInfoOnce(db: Db, clients: { polymarket: PolymarketClient; kalshi: KalshiClient }, now: number, perRun = 300): Promise<{ read: number; tagged: number }> {
  const list0 = await due(db, now, perRun);
  let read = 0, tagged = 0;
  for (const source of ["polymarket", "kalshi"] as const) {
    const ids = list0.filter(d => d.source === source).map(d => d.marketId);
    if (!ids.length) continue;
    const got = await clients[source].getMarketsById(ids);
    const infos: MarketInfo[] = [...got.values()].map(m => ({
      source, marketId: m.id, yesPrice: m.yesPrice ?? null, startAt: m.startTime ?? null, closed: !m.active || m.result !== null,
      historyKey: source === "polymarket" ? m.yesTokenId : kalshiSeries(m.id), updatedAt: now,
    }));
    // Read but not returned: mark read so the next run moves on.
    for (const id of ids) if (!got.has(id)) infos.push({ source, marketId: id, yesPrice: null, startAt: null, closed: false, historyKey: null, updatedAt: now });
    for (const i of infos) {
      await db.insert(marketInfo).values({ ...i, startAt: i.startAt ? new Date(i.startAt) : null, updatedAt: new Date(now) })
        .onConflictDoUpdate({ target: [marketInfo.source, marketInfo.marketId], set: {
          yesPrice: sql`coalesce(excluded.yes_price, ${marketInfo.yesPrice})`, startAt: sql`coalesce(excluded.start_at, ${marketInfo.startAt})`,
          closed: i.closed, historyKey: sql`coalesce(excluded.history_key, ${marketInfo.historyKey})`, updatedAt: new Date(now) } });
    }
    read += got.size;
    tagged += await tagObserved(db, source, infos, now);
  }
  return { read, tagged };
}

/** Adds the observed tags these markets' info shows to their moves of the last 60 days. */
export async function tagObserved(db: Db, source: "polymarket" | "kalshi", infos: readonly MarketInfo[], now: number): Promise<number> {
  const byId = new Map(infos.map(i => [i.marketId, i]));
  if (!byId.size) return 0;
  const l = (await db.select().from(moves).where(and(eq(moves.source, source), inArray(moves.marketId, [...byId.keys()]), isNull(moves.hiddenAt),
    gte(moves.at, new Date(now - 60 * DAY))))).map(fromRow);
  return addTags(db, l.map(m => ({ id: m.id, tags: observedTags(m, byId.get(m.marketId)!) })));
}

export async function infoFor(db: Db, source: "polymarket" | "kalshi", ids: readonly string[]): Promise<Map<string, MarketInfo>> {
  if (!ids.length) return new Map();
  const r = await db.select().from(marketInfo).where(and(eq(marketInfo.source, source), inArray(marketInfo.marketId, [...new Set(ids)])));
  return new Map(r.map(x => [x.marketId, { source: x.source, marketId: x.marketId, yesPrice: x.yesPrice, startAt: x.startAt?.getTime() ?? null, closed: x.closed, historyKey: x.historyKey, updatedAt: x.updatedAt.getTime() }]));
}

/* ---------- price history ---------- */

export interface PricePoint { t: number; p: number }

/** Polymarket CLOB /prices-history: {history: [{t: seconds, p: price}]}. Pure. */
export function readPolyHistory(raw: unknown): PricePoint[] {
  const h = isObject(raw) ? list(raw.history) : [];
  return h.filter(isObject).map(x => ({ t: (num(x.t) ?? 0) * 1000, p: num(x.p) ?? -1 })).filter(x => x.t > 0 && x.p >= 0 && x.p <= 1).sort((a, b) => a.t - b.t);
}

/** Kalshi candlesticks: {candlesticks: [{end_period_ts, price: {close | close_dollars}, yes_bid…}]}, the last trade's
 *  close in cents or dollars, else the YES bid's close. Pure. */
export function readKalshiCandles(raw: unknown): PricePoint[] {
  return rows(raw, ["candlesticks"]).map(c => {
    const price = isObject(c.price) ? c.price : {};
    const bid = isObject(c.yes_bid) ? c.yes_bid : {};
    const d = num(price.close_dollars) ?? num(bid.close_dollars);
    const cents = num(price.close) ?? num(bid.close);
    return { t: (num(c.end_period_ts) ?? 0) * 1000, p: d ?? (cents === null ? -1 : cents / 100) };
  }).filter(x => x.t > 0 && x.p >= 0 && x.p <= 1).sort((a, b) => a.t - b.t);
}

const within = <T,>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p.catch(() => null), new Promise<null>(r => setTimeout(() => r(null), ms))]);

/** A market's YES price history from its venue, oldest first; empty when the venue didn't answer in time. */
export async function priceHistory(clients: { polymarket: PolymarketClient; kalshi: KalshiClient }, source: "polymarket" | "kalshi", marketId: string,
  info: MarketInfo | null, fromMs: number, now: number): Promise<PricePoint[]> {
  if (source === "polymarket") {
    if (!info?.historyKey) return [];
    return readPolyHistory(await within(clients.polymarket.getPriceHistory(info.historyKey), 4000));
  }
  const series = info?.historyKey ?? kalshiSeries(marketId);
  if (!series) return [];
  const start = Math.max(fromMs, now - 90 * DAY);
  const period = now - start > 7 * DAY ? 1440 : 60;
  return readKalshiCandles(await within(clients.kalshi.getCandlesticks(series, marketId, start, now, period), 4000));
}
