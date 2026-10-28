/* What a Polymarket move really made, from the wallet's own trades in that market (all of them, maker and taker,
 * from the Data API), once the market has settled. Pure.
 *   The bet: the wallet's BUY fills of the move's outcome from the move's first fill on, each within MERGE_WINDOW_MS
 *     of the previous one (the same rule as detection, but with every fill, so a bet seen half-filled is counted
 *     in full).
 *   Sold before the result: that outcome's SELL fills after the bet and before `until` (the settle time; trading
 *     stops at resolution), up to the bet's contracts.
 *   pnl = sale proceeds + payout on what was still held (1 a contract if it won, the refund price if void, 0 if it
 *     lost) − what the bet cost.
 * Never a sell as a bet: only BUY fills make the bet, and a move whose first fill isn't a BUY is "not_a_buy". */
import { MERGE_WINDOW_MS } from "./detect";

export interface WalletFill { side: "BUY" | "SELL"; outcomeIndex: number; size: number; price: number; at: number }

export type Realized =
  | { ok: true; amount: number; avgPrice: number; contracts: number; soldContracts: number; proceeds: number; pnl: number; soldShare: number }
  | { ok: false; reason: "not_a_buy" | "no_fills" };

/** The share of a bet sold before the result above which it counts as "sold before the result", not won or lost. */
export const SOLD_EARLY_SHARE = 0.5;

export function realizeMove(m: { at: number; outcomeSide: "yes" | "no" }, fills: readonly WalletFill[], result: "yes" | "no" | "void", until: number,
  voidPrice = 0.5): Realized {
  const idx = m.outcomeSide === "no" ? 1 : 0;
  const mine = fills.filter(f => f.outcomeIndex === idx && f.at >= m.at - 1000 && f.at <= until).sort((a, b) => a.at - b.at);
  if (!mine.length) return { ok: false, reason: "no_fills" };
  const first = mine.find(f => Math.abs(f.at - m.at) <= 1000);
  if (first && first.side !== "BUY" && !mine.some(f => f.side === "BUY" && Math.abs(f.at - m.at) <= 1000)) return { ok: false, reason: "not_a_buy" };
  let amount = 0, contracts = 0, last = -Infinity;
  for (const f of mine) {
    if (f.side !== "BUY") continue;
    if (contracts > 0 && f.at - last > MERGE_WINDOW_MS) break;
    amount += f.size * f.price; contracts += f.size; last = f.at;
  }
  if (contracts <= 0) return { ok: false, reason: "not_a_buy" };
  let held = contracts, proceeds = 0;
  for (const f of mine) {
    if (f.side !== "SELL" || f.at < m.at || held <= 0) continue;
    const q = Math.min(f.size, held);
    proceeds += q * f.price; held -= q;
  }
  const pay = result === "void" ? voidPrice : result === m.outcomeSide ? 1 : 0;
  const soldContracts = contracts - held;
  return { ok: true, amount, avgPrice: amount / contracts, contracts, soldContracts, proceeds, pnl: proceeds + held * pay - amount, soldShare: soldContracts / contracts };
}

/** Data API /trades rows → wallet fills. */
export function readWalletFills(raw: unknown): WalletFill[] {
  if (!Array.isArray(raw)) return [];
  const out: WalletFill[] = [];
  for (const t of raw as Array<Record<string, unknown>>) {
    const side = String(t.side ?? "").toUpperCase(), size = Number(t.size), price = Number(t.price), ts = Number(t.timestamp);
    if ((side !== "BUY" && side !== "SELL") || !(size > 0) || !(price >= 0) || !(ts > 0)) continue;
    out.push({ side, outcomeIndex: Number(t.outcomeIndex) === 1 ? 1 : 0, size, price, at: ts < 1e12 ? ts * 1000 : ts });
  }
  return out;
}
