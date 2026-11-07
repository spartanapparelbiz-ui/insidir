/* Repeats in a list of bets, merged: the same wallet on the same market and side, within 2 hours of the newest, is one
 * row ("4 bets · $1.2M total · avg 63¢"), not four. The newest bet stays the row (its id, time and price now); money
 * adds up; the entry price is the money-weighted average. Pure; safe on the client. */
import type { BoardBet } from "./queries";

export interface GroupedBet extends BoardBet {
  /** How many bets the row stands for (1 for a single bet), and their ids. */
  n: number;
  ids: string[];
}

const GROUP_WINDOW_MS = 2 * 3_600_000;

export function groupBets(bets: readonly BoardBet[], windowMs = GROUP_WINDOW_MS): GroupedBet[] {
  const out: GroupedBet[] = [];
  const open = new Map<string, GroupedBet>();
  for (const b of [...bets].sort((x, y) => y.at - x.at)) {
    // Visitors don't get the side or the wallet: the short address and the market still tell repeats apart.
    const key = `${b.wallet ?? b.short}|${b.marketId}|${b.side ?? b.outcome ?? ""}`;
    const g = open.get(key);
    if (g && g.at - b.at <= windowMs) {
      const weight = g.amount + b.amount;
      if (g.priceThen !== null && b.priceThen !== null) g.priceThen = (g.priceThen * g.amount + b.priceThen * b.amount) / weight;
      g.amount = weight; g.n += 1; g.ids.push(b.id);
      continue;
    }
    const row: GroupedBet = { ...b, n: 1, ids: [b.id] };
    open.set(key, row); out.push(row);
  }
  return out;
}
