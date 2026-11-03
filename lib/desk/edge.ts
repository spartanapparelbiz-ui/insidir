/* EdgeChart's data for one bet: the price of the side they bought over the last 24 hours, or since the first millionaire
 * entry in that market and side when that is earlier (at most 7 days); every real millionaire entry (time, price,
 * dollars); their dollar-weighted average entry; the price now. History is Polymarket CLOB /prices-history by the
 * market's YES token (market_info.history_key; NO = 1 − YES), cached 5 minutes. Millionaire bets come from Polymarket
 * wallets, so there is no Kalshi history to read here. When the venue doesn't answer, `points` is empty and the chart
 * falls back to entry → now: no point is ever made up. Server only. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import type { PolymarketClient } from "@/lib/exchanges";
import { readPolyHistory, type PricePoint } from "@/lib/markets/info";
import { memo } from "@/lib/memo";

const HOUR = 3_600_000, DAY = 24 * HOUR;

export interface Edge {
  betId: string; marketId: string; title: string; outcome: string; side: "yes" | "no";
  points: PricePoint[];
  entries: Array<{ t: number; p: number; dollars: number }>;
  avg: number; now: number | null; total: number; from: number; to: number;
  /** The venue closed the market, or the bet settled (lib/millionaires/decided.ts). */
  closed: boolean; result: "won" | "lost" | "void" | null;
}

export async function edgeFor(db: Db, poly: Pick<PolymarketClient, "getPriceHistoryRange">, betId: string, now: number): Promise<Edge | null> {
  const b = (await db.execute(sql`select b.market_id, b.market_title, b.outcome, b.outcome_side, b.result, i.history_key, i.yes_price, i.updated_at as price_at, coalesce(i.closed, false) as closed
    from terminal.millionaire_bets b left join terminal.market_info i on i.source = 'polymarket' and i.market_id = b.market_id where b.id = ${betId}`)).rows[0] as
    { market_id: string; market_title: string; outcome: string; outcome_side: string; result: string | null; history_key: string | null; yes_price: number | null; price_at: string | null; closed: boolean } | undefined;
  if (!b) return null;
  const side = b.outcome_side === "no" ? "no" : "yes";
  const ents = ((await db.execute(sql`select extract(epoch from at) * 1000 as t, price::float as p, amount::float as dollars from terminal.millionaire_bets
    where market_id = ${b.market_id} and outcome_side = ${side} and tier = 'millionaire' and at > ${new Date(now - 7 * DAY)} order by at`)).rows as Array<{ t: string; p: number; dollars: number }>)
    .map(x => ({ t: Number(x.t), p: Number(x.p), dollars: Number(x.dollars) }));
  const from = Math.max(now - 7 * DAY, Math.min(now - DAY, ents[0]?.t ?? now));
  const total = ents.reduce((s, e) => s + e.dollars, 0);
  const avg = total ? ents.reduce((s, e) => s + e.p * e.dollars, 0) / total : 0;
  let points: PricePoint[] = [];
  if (b.history_key) {
    const span = now - from, fidelity = span > 3 * DAY ? 60 : span > DAY ? 30 : 10;
    const key = `edge:${b.history_key}:${Math.floor(from / (5 * 60_000))}`;
    // At most 2.5 s for the venue: past that the chart shows entry → now (and the cache fills for the next look).
    const raw = await Promise.race([
      memo(key, 5 * 60_000, () => poly.getPriceHistoryRange(b.history_key!, from, now, fidelity, "normal")).catch(() => null),
      new Promise<null>(r => setTimeout(() => r(null), 2500)),
    ]);
    points = readPolyHistory(raw).map(x => (side === "yes" ? x : { t: x.t, p: 1 - x.p }));
  }
  const yes = b.yes_price === null ? null : Number(b.yes_price);
  // The rows show market_info's price; the line stops where that price was read, so the chart's last point and the
  // table's price are the same reading (never a later point the table hasn't seen, never an invented one).
  if (yes !== null && b.price_at) { const at = new Date(b.price_at).getTime(); points = points.filter(p => p.t <= at); }
  // The price now is the one the rows show (market_info), so the table and the chart never disagree; the history's
  // last point only when market_info has none.
  const priceNow = yes !== null ? (side === "yes" ? yes : 1 - yes) : points.length ? points[points.length - 1]!.p : null;
  const result = b.result === "won" || b.result === "lost" || b.result === "void" ? b.result : null;
  return { betId, marketId: b.market_id, title: b.market_title, outcome: b.outcome, side, points, entries: ents, avg, now: priceNow, total, from, to: now, closed: Boolean(b.closed), result };
}
