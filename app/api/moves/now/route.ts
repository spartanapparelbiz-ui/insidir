/* GET /api/moves/now?m=polymarket:0xabc,kalshi:KX-1 → { prices: { "polymarket:0xabc": 0.61, … } }
 * The YES price of each market now, for the open cards' "In at 45% · now 61%" (refreshed every minute). Each market
 * is read from its venue at most once a minute (memo), else the worker's last read (terminal.market_info). Members
 * and free viewers alike; at most 60 markets a call. */
import { NextResponse, type NextRequest } from "next/server";
import { getDb, hasDatabase } from "@/lib/db";
import { KalshiClient, PolymarketClient } from "@/lib/exchanges";
import { infoFor } from "@/lib/markets/info";
import { memo } from "@/lib/memo";

export const dynamic = "force-dynamic";
const clients = { polymarket: new PolymarketClient(), kalshi: new KalshiClient() };

export async function GET(req: NextRequest) {
  const keys = [...new Set((req.nextUrl.searchParams.get("m") ?? "").split(",").filter(k => /^(polymarket|kalshi):[\w.\-]{3,120}$/.test(k)))].slice(0, 60);
  const prices: Record<string, number | null> = {};
  for (const source of ["polymarket", "kalshi"] as const) {
    const ids = keys.filter(k => k.startsWith(`${source}:`)).map(k => k.slice(source.length + 1)).sort();
    if (!ids.length) continue;
    const live = await memo(`now:${source}:${ids.join(",")}`, 60_000, async () => {
      const got = await clients[source].getMarketsById(ids).catch(() => new Map());
      return Object.fromEntries([...got].map(([id, m]) => [id, m.yesPrice ?? null]));
    }).catch(() => ({} as Record<string, number | null>));
    const stored = hasDatabase() ? await infoFor(getDb(), source, ids.filter(id => live[id] == null)).catch(() => new Map()) : new Map();
    for (const id of ids) prices[`${source}:${id}`] = live[id] ?? stored.get(id)?.yesPrice ?? null;
  }
  return NextResponse.json({ prices }, { headers: { "Cache-Control": "no-store" } });
}
