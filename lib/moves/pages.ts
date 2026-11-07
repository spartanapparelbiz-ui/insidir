/* Server helpers for the trader and market pages: live data from the public APIs, with a short timeout so a slow
 * source hides its section instead of holding the page. */
import { PolymarketClient } from "@/lib/exchanges";

const within = <T,>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p.catch(() => null), new Promise<null>(r => setTimeout(() => r(null), ms))]);

interface OpenPosition { title: string; outcome: string; value: number; avgPrice: number | null; curPrice: number | null; marketId: string }

/** A wallet's open positions (Polymarket Data API /positions), biggest first; null when the source didn't answer. */
export async function openPositions(wallet: string, limit = 10): Promise<OpenPosition[] | null> {
  const got = await within(new PolymarketClient().getPositions(wallet, { sizeThreshold: 1 }), 4000);
  if (!got) return null;
  return got.filter(p => !p.redeemable && (p.currentValue ?? 0) >= 100)
    .map(p => ({ title: p.title, outcome: p.outcome ?? "", value: p.currentValue ?? 0, avgPrice: p.avgPrice, curPrice: p.curPrice, marketId: p.conditionId }))
    .sort((a, b) => b.value - a.value).slice(0, limit);
}

