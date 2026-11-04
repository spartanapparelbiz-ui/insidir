/* The record on Kalshi: reading Kalshi's candlesticks for the ask a member would have paid (lib/autopilot/history.ts),
 * and the rules report (lib/autopilot/report.ts): priced at Kalshi's ask + 1¢, bets Kalshi doesn't list counted apart,
 * and only rules positive over 100+ settled bets may lead. */
import { describe, expect, it } from "vitest";
import { askAt, readCandles } from "@/lib/autopilot/history";
import { leaders, LEAD_MIN_SETTLED, rulesReport } from "@/lib/autopilot/report";
import type { BtRow } from "@/lib/autopilot/backtest";

describe("Kalshi's ask then", () => {
  const raw = { candlesticks: [
    { end_period_ts: 1_000, yes_ask: { close_dollars: "0.62" }, yes_bid: { close_dollars: "0.60" } },
    { end_period_ts: 1_060, yes_ask: { close: 64 }, yes_bid: { close: 61 } },
  ] };
  it("reads asks and bids in dollars or cents", () => {
    expect(readCandles(raw)).toEqual([{ end: 1_000_000, yesAsk: 0.62, yesBid: 0.6 }, { end: 1_060_000, yesAsk: 0.64, yesBid: 0.61 }]);
    expect(readCandles(null)).toEqual([]);
  });
  it("YES pays the ask, NO pays 1 − the bid, at the period that closed by then", () => {
    const c = readCandles(raw);
    expect(askAt(c, "yes", 1_010_000)).toBe(0.62);
    expect(askAt(c, "yes", 1_070_000)).toBe(0.64);
    expect(askAt(c, "no", 1_070_000)).toBe(0.39);
    expect(askAt([], "yes", 1)).toBeNull();
  });
});

describe("the rules report", () => {
  const NOW = Date.UTC(2026, 10, 4), D = 86_400_000;
  const row = (i: number, o: Partial<BtRow> = {}): BtRow => ({ id: `m${i}`, wallet: `0x${i % 7}`, marketId: `0x${i}`, side: "yes", category: i % 2 ? "basketball" : "soccer", url: null,
    title: "T", eventTitle: "E", outcome: "O", amount: 60_000, theirPrice: 0.5, seenPrice: 0.5, at: NOW - (i % 170 + 1) * D, result: i % 3 === 0 ? "lost" : "won",
    provenThen: true, settledThen: 40, firstEntry: true, kalshiAsk: 0.5, ...o });
  it("prices at Kalshi + 1¢, counts bets Kalshi doesn't list, and leads only with 100+ settled in profit", () => {
    const rows = [...Array.from({ length: 150 }, (_, i) => row(i)), ...Array.from({ length: 20 }, (_, i) => row(1000 + i, { kalshiAsk: null }))];
    const r = rulesReport(rows, NOW);
    expect(r.bets).toBe(170);
    expect(r.onKalshi).toBe(150);
    const all = r.rows.find(x => x.key === "all")!;
    expect(all.result.offKalshi).toBe(20);
    expect(all.settled).toBe(150);
    // 100 won, 50 lost at 51¢: 49 contracts each ($24.99): +49·0.49·100 − 24.99·50.
    expect(all.result.net).toBeCloseTo(100 * (49 - 24.99) - 50 * 24.99, 1);
    expect(all.leads).toBe(true);
    expect(leaders(r)[0]!.settled).toBeGreaterThanOrEqual(LEAD_MIN_SETTLED);
    // A category with fewer than 100 settled never leads, whatever its net.
    expect(r.rows.filter(x => x.settled < LEAD_MIN_SETTLED).every(x => !x.leads)).toBe(true);
    // The guard rows: Kalshi 8¢ above their price is skipped at 3¢ and 5¢, kept at 8¢.
    const moved = rulesReport(Array.from({ length: 10 }, (_, i) => row(i, { kalshiAsk: 0.58 })), NOW);
    expect(moved.rows.find(x => x.key === "guard:3")!.result.tooLate).toBe(10);
    expect(moved.rows.find(x => x.key === "guard:8")!.result.tooLate).toBe(0);
  });
  it("nothing positive means no leader", () => {
    const losing = rulesReport(Array.from({ length: 150 }, (_, i) => row(i, { result: i % 4 === 0 ? "won" : "lost" })), NOW);
    expect(leaders(losing)).toEqual([]);
  });
});
