/* A Polymarket market's order book right now, for its public page: the best bid and ask on the YES side, the spread, and
 * the top five price levels each way with the dollars resting at each (price × shares) and the running total. Read from
 * Polymarket's public CLOB (GET /book?token_id=<YES token>, the token in market_info.history_key), cached 30 seconds,
 * given 2.5 seconds; any failure gives null and the page leaves the panel out. Server only. */
import { sql } from "drizzle-orm";
import type { Db } from "@/lib/db";

export interface DepthLevel { price: number; dollars: number; total: number }
export interface Depth { bid: number | null; ask: number | null; spread: number | null; bids: DepthLevel[]; asks: DepthLevel[]; at: number }

const CLOB = "https://clob.polymarket.com";
const levels = (raw: unknown, best: "high" | "low"): DepthLevel[] => {
  const rows = (Array.isArray(raw) ? raw : []).map(l => ({ price: Number((l as { price?: unknown }).price), size: Number((l as { size?: unknown }).size) }))
    .filter(l => l.price > 0 && l.price < 1 && l.size > 0)
    .sort((a, b) => (best === "high" ? b.price - a.price : a.price - b.price)).slice(0, 5);
  let total = 0;
  return rows.map(l => { const dollars = l.price * l.size; total += dollars; return { price: l.price, dollars, total }; });
};

/** Exported for tests: a /book reply → the panel's numbers. */
export function readDepth(raw: unknown, at: number): Depth | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as { bids?: unknown; asks?: unknown };
  const bids = levels(b.bids, "high"), asks = levels(b.asks, "low");
  if (!bids.length && !asks.length) return null;
  const bid = bids[0]?.price ?? null, ask = asks[0]?.price ?? null;
  return { bid, ask, spread: bid !== null && ask !== null ? Math.max(0, ask - bid) : null, bids, asks, at };
}

export async function marketDepth(db: Db, marketId: string, now: number): Promise<Depth | null> {
  const r = await db.execute(sql`select history_key from terminal.market_info where source = 'polymarket' and market_id = ${marketId} and closed = false limit 1`).catch(() => null);
  const token = (r?.rows[0] as { history_key?: string | null } | undefined)?.history_key;
  if (!token) return null;
  try {
    const res = await fetch(`${CLOB}/book?token_id=${encodeURIComponent(token)}`, { headers: { Accept: "application/json", "User-Agent": "insidir.com" }, signal: AbortSignal.timeout(2500), next: { revalidate: 30 } });
    return res.ok ? readDepth(await res.json(), now) : null;
  } catch { return null; }
}
