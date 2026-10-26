/* Server helpers for the trader and market pages: live data from the public APIs, with a short timeout so a slow
 * source hides its section instead of holding the page. */
import { KalshiClient, PolymarketClient } from "@/lib/exchanges";
import { num } from "@/lib/exchanges/parse";
import type { VMarket } from "@/lib/types";

const within = <T,>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p.catch(() => null), new Promise<null>(r => setTimeout(() => r(null), ms))]);

export interface OpenPosition { title: string; outcome: string; value: number; avgPrice: number | null }

/** A wallet's open positions (Polymarket Data API /positions), biggest first; null when the source didn't answer. */
export async function openPositions(wallet: string, limit = 10): Promise<OpenPosition[] | null> {
  const got = await within(new PolymarketClient().getPositions(wallet, { sizeThreshold: 1 }), 4000);
  if (!got) return null;
  return got.filter(p => !p.redeemable && (p.currentValue ?? 0) >= 100)
    .map(p => ({ title: p.title, outcome: p.outcome ?? "", value: p.currentValue ?? 0, avgPrice: p.avgPrice }))
    .sort((a, b) => b.value - a.value).slice(0, limit);
}

/** The current price of the market's YES side, 0..1; null when unknown. */
export async function currentPrice(source: "polymarket" | "kalshi", market: VMarket | null, id: string): Promise<number | null> {
  if (source === "polymarket") {
    if (!market?.yesTokenId) return null;
    return within(new PolymarketClient().getMidpoint(market.yesTokenId), 3000);
  }
  const raw = await within(new KalshiClient().getMarket(id), 3000);
  if (!raw) return null;
  const m = (raw.market ?? raw) as Record<string, unknown>;
  const d = num(m.last_price_dollars);
  if (d !== null) return d;
  const c = num(m.last_price);
  return c === null ? null : c / 100;
}
