/* The Kalshi record (/results): following every buy ping on a market with a Kalshi twin (an open or an add, recorded
 * by the ping job with Kalshi's price for that side at that moment, terminal.kalshi_pings), settled with the bet.
 * $100 on each at Kalshi's price then: a win pays 100 / price, a loss nothing, a void is refunded. Kalshi's fees aren't
 * taken off. Shown from MIN_SETTLED settled pings; before that, the tally so far. Past results, not a promise. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { add, MIN_SETTLED, settledCount, type Tally } from "./record";

export interface KalshiPingRow { id: string; title: string; outcome: string; kind: "open" | "add"; kalshiPrice: number; polyPrice: number; at: number; result: "won" | "lost" | "void" | null }
export interface KalshiRecord { days: number; pinged: number; total: Tally; net: number | null; latest: KalshiPingRow[] }

export async function kalshiPingRecord(db: Db, now: number, days = 30): Promise<KalshiRecord> {
  const r = await db.execute(sql`select k.event_id, k.title, k.outcome, k.kind, k.kalshi_price, k.poly_price, k.at, b.result
    from terminal.kalshi_pings k left join terminal.millionaire_bets b on b.id = k.event_id
    where k.at > ${new Date(now - days * 86_400_000)} order by k.at desc`);
  const rows: KalshiPingRow[] = (r.rows as Array<Record<string, unknown>>).map(x => ({ id: String(x.event_id), title: String(x.title), outcome: String(x.outcome), kind: x.kind === "add" ? "add" as const : "open" as const,
    kalshiPrice: Number(x.kalshi_price), polyPrice: Number(x.poly_price), at: new Date(String(x.at)).getTime(),
    result: x.result === "won" || x.result === "lost" || x.result === "void" ? (x.result as "won" | "lost" | "void") : null }));
  const total: Tally = { won: 0, lost: 0, void: 0, staked: 0, back: 0 };
  for (const x of rows) if (x.result) add(total, x.result, x.kalshiPrice);
  return { days, pinged: rows.length, total, net: settledCount(total) >= MIN_SETTLED ? total.back - total.staked : null, latest: rows.slice(0, 20) };
}
