/* lib/stats.ts: every performance number, worked by hand. */
import { describe, expect, it } from "vitest";
import {
  activity, bestDay, biggestLoss, biggestWin, breakdown, dayOf, enough, etDay, etSlot, heatmap, leaders, MIN_SETTLED, perf, pnlSeries, priceMove,
  rankOf, sideOf, SIDES, sizeOf, SIZES, streak, topShare, type StatMove,
} from "@/lib/stats";

const T0 = Date.UTC(2026, 9, 1, 16); // Thu Oct 1 2026, 12:00 ET
const DAY = 86_400_000;
let k = 0;
const mv = (over: Partial<StatMove>): StatMove => ({
  id: `m${++k}`, amount: 1000, avgPrice: 0.5, result: "won", pnl: 1000, at: T0, settledAt: T0 + DAY, wallet: "0xa", walletName: null,
  marketTitle: "Game", eventTitle: "Game", outcome: "Yes", tab: "sports", league: "NBA", category: "sports", marketId: "m", ...over,
});
/** n wins then m losses at price p, $1000 each: a win makes 1000·(1/p − 1), a loss −1000. */
function book(nWon: number, nLost: number, p = 0.5): StatMove[] {
  return [
    ...Array.from({ length: nWon }, (_, i) => mv({ avgPrice: p, result: "won", pnl: 1000 * (1 / p - 1), settledAt: T0 + i * DAY })),
    ...Array.from({ length: nLost }, (_, i) => mv({ avgPrice: p, result: "lost", pnl: -1000, settledAt: T0 + (nWon + i) * DAY })),
  ];
}

describe("perf", () => {
  it("under 20 settled: counts only, every rate is null (Not enough data yet)", () => {
    expect(MIN_SETTLED).toBe(20);
    expect(enough(19)).toBe(false);
    const p = perf(book(12, 7));
    expect(p).toMatchObject({ settled: 19, won: 12, lost: 7, winRate: null, avgPrice: null, edge: null, net: null, roi: null, hundred: null });
  });

  it("win rate, avg price, edge, net, ROI and $100 on every move", () => {
    // 15 won, 5 lost at 50¢: win rate 75%, price 50%, edge +25 pts; net 15·1000 − 5·1000 = 10,000 on 20,000 → ROI 50%;
    // $100 each: 15·100 − 5·100 = 1,000.
    const p = perf(book(15, 5, 0.5));
    expect(p.winRate).toBeCloseTo(0.75);
    expect(p.avgPrice).toBeCloseTo(0.5);
    expect(p.edge).toBeCloseTo(25);
    expect(p.net).toBeCloseTo(10_000);
    expect(p.staked).toBe(20_000);
    expect(p.roi).toBeCloseTo(0.5);
    expect(p.hundred).toBeCloseTo(1000);
  });

  it("avg price is weighted by amount, and unpriced moves (0 or 1) are left out of it", () => {
    const l = [...book(10, 10, 0.4), mv({ avgPrice: 0.8, amount: 3000, result: "won", pnl: 750 }), mv({ avgPrice: 1, result: "won", pnl: 0 })];
    // (20 × 1000 × 0.4 + 3000 × 0.8) / 23,000
    expect(perf(l).avgPrice).toBeCloseTo((8000 + 2400) / 23_000);
  });

  it("a negative edge: winning less often than the price said", () => {
    expect(perf(book(10, 10, 0.7)).edge).toBeCloseTo(-20);
  });
});

describe("series and single facts", () => {
  it("cumulative net by settle time; a window starts at 0", () => {
    const l = [mv({ pnl: 100, settledAt: T0 + 2 * DAY }), mv({ pnl: -40, settledAt: T0 + DAY }), mv({ pnl: 10, settledAt: T0 + 3 * DAY })];
    expect(pnlSeries(l)).toEqual([{ t: T0 + DAY, v: -40 }, { t: T0 + 2 * DAY, v: 60 }, { t: T0 + 3 * DAY, v: 70 }]);
    expect(pnlSeries(l, T0 + 1.5 * DAY)).toEqual([{ t: T0 + 1.5 * DAY, v: 0 }, { t: T0 + 2 * DAY, v: 100 }, { t: T0 + 3 * DAY, v: 110 }]);
  });

  it("the current streak, newest first", () => {
    expect(streak(book(3, 2))).toEqual({ kind: "lost", n: 2 });
    expect(streak([...book(0, 1), mv({ result: "won", settledAt: T0 + 9 * DAY })])).toEqual({ kind: "won", n: 1 });
    expect(streak([])).toBeNull();
  });

  it("best day in New York time, biggest win and loss", () => {
    const late = Date.UTC(2026, 9, 2, 3, 30); // Oct 1, 11:30 PM ET
    const l = [mv({ pnl: 50, settledAt: late }), mv({ pnl: 60, settledAt: Date.UTC(2026, 9, 1, 15) }), mv({ pnl: 100, settledAt: Date.UTC(2026, 9, 2, 15) }), mv({ pnl: -300, settledAt: Date.UTC(2026, 9, 2, 16) })];
    expect(etDay(late)).toBe("2026-10-01");
    expect(bestDay(l)).toEqual({ day: "2026-10-01", net: 110 });
    expect(biggestWin(l)!.pnl).toBe(100);
    expect(biggestLoss(l)!.pnl).toBe(-300);
    expect(biggestLoss(book(2, 0))).toBeNull();
  });

  it("activity, top-trader share, and the price move on open bets", () => {
    expect(activity([{ amount: 10 }, { amount: 30 }])).toEqual({ tracked: 40, moves: 2, avgBet: 20, biggestBet: 30 });
    expect(activity([])).toEqual({ tracked: 0, moves: 0, avgBet: null, biggestBet: null });
    expect(topShare([{ wallet: "a" }, { wallet: "b" }, { wallet: null }, { wallet: "a" }], w => w === "a")).toBe(0.5);
    // +10¢ and −4¢ → +3¢ on average; an unknown price now is skipped.
    expect(priceMove([{ avgPrice: 0.4, now: 0.5 }, { avgPrice: 0.6, now: 0.56 }, { avgPrice: 0.5, now: null }])).toBeCloseTo(3);
    expect(priceMove([])).toBeNull();
  });
});

describe("breakdowns", () => {
  it("buckets: size, favorite vs underdog, weekday and hour in New York", () => {
    expect([10_000, 25_000, 60_000, 100_000, 400_000].map(sizeOf)).toEqual([...SIZES]);
    expect([0.39, 0.4, 0.75, 0.76].map(sideOf)).toEqual([SIDES[0], SIDES[1], SIDES[1], SIDES[2]]);
    expect(sideOf(1)).toBeNull();
    expect(etSlot(T0)).toEqual({ day: 3, hour: 12 });
    expect(dayOf(mv({ at: T0 }))).toBe("Thu");
  });

  it("each row gated by its own count; ordered by size or the given order", () => {
    const l = [...book(15, 5).map(m => ({ ...m, league: "NBA" as const })), ...book(3, 1).map(m => ({ ...m, league: "NFL" as const }))];
    const rows = breakdown(l, m => m.league);
    expect(rows.map(r => r.key)).toEqual(["NBA", "NFL"]);
    expect(rows[0]!.perf.winRate).toBeCloseTo(0.75);
    expect(rows[1]!.perf.winRate).toBeNull();
    expect(rows[1]!.perf.won).toBe(3);
    expect(breakdown(l, m => m.league, ["NFL", "NBA"]).map(r => r.key)).toEqual(["NFL", "NBA"]);
  });

  it("heatmap: 7 × 24 counts", () => {
    const g = heatmap([{ at: T0 }, { at: T0 }, { at: T0 + 3_600_000 }]);
    expect(g).toHaveLength(7);
    expect(g[3]![12]).toBe(2);
    expect(g[3]![13]).toBe(1);
    expect(g.flat().reduce((a, b) => a + b, 0)).toBe(3);
  });

  it("leaders by net, records gated per wallet; rank by profit", () => {
    const l = [...book(16, 4).map(m => ({ ...m, wallet: "0xa", walletName: "Alpha" })), ...book(1, 0).map(m => ({ ...m, wallet: "0xb" }))];
    const top = leaders(l);
    expect(top.map(t => t.wallet)).toEqual(["0xa", "0xb"]);
    expect(top[0]).toMatchObject({ name: "Alpha", moves: 20, amount: 20_000 });
    expect(top[0]!.perf.winRate).toBeCloseTo(0.8);
    expect(top[1]!.perf.net).toBeNull();
    expect(rankOf(500, [900, 500, 100, 700])).toBe(3);
  });
});
