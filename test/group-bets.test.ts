/* Repeats on the board: same wallet, same market, same side, within 2 hours → one row with the count, the total and
 * the money-weighted average price. */
import { describe, expect, it } from "vitest";
import { groupBets } from "@/lib/millionaires/group";
import type { BoardBet } from "@/lib/millionaires/queries";

const H = 3_600_000, T = 1_800_000_000_000;
const bet = (id: string, over: Partial<BoardBet>): BoardBet => ({
  id, short: "0x1234…abcd", wallet: "0x1234", tier: "millionaire", category: "soccer", marketId: "m1", title: "Bayern to win", event: "Bayern vs. Leverkusen",
  pnl: 1_200_000, outcome: "Yes", side: "yes", amount: 10_000, priceThen: 0.6, priceNow: 0.62, closed: false, result: null, at: T, ...over,
} as BoardBet);

describe("grouping repeats", () => {
  it("merges the same wallet + market + side within 2 hours: count, total, weighted average", () => {
    const g = groupBets([bet("a", { at: T }), bet("b", { at: T - 0.5 * H, amount: 30_000, priceThen: 0.5 }), bet("c", { at: T - 1.5 * H }), bet("d", { at: T - 1.9 * H })]);
    expect(g).toHaveLength(1);
    expect(g[0]!.n).toBe(4);
    expect(g[0]!.amount).toBe(60_000);
    expect(g[0]!.id).toBe("a");
    expect(g[0]!.priceThen).toBeCloseTo((0.6 * 10_000 + 0.5 * 30_000 + 0.6 * 20_000) / 60_000, 6);
  });
  it("keeps apart other sides, other markets, other wallets, and bets more than 2 hours from the newest", () => {
    const g = groupBets([bet("a", {}), bet("b", { side: "no", outcome: "No" }), bet("c", { marketId: "m2" }), bet("d", { wallet: "0x9", short: "0x9…" }), bet("e", { at: T - 2.5 * H })]);
    expect(g.map(x => x.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(g.every(x => x.n === 1)).toBe(true);
  });
});
