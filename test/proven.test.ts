/* Proven wallets (lib/millionaires/proven.ts) and the nearest Kalshi lines (lib/twins/nearest.ts). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { provenReason, screenTrades, settledCount, type Trade } from "@/lib/millionaires/proven";
import { lineOf, nearestLines } from "@/lib/twins/nearest";
import type { VMarket } from "@/lib/types";

const H = 3_600_000, D = 86_400_000;
const t = (m: string, side: "yes" | "no", at: number, buy = true): Trade => ({ marketId: m, outcomeSide: side, side: buy ? "BUY" : "SELL", at });

describe("proven wallets", () => {
  it("a picker passes: one side per market", () => {
    const trades = Array.from({ length: 20 }, (_, i) => t(`m${i}`, i % 2 ? "yes" : "no", i * D / 2));
    expect(screenTrades(trades).reason).toBeNull();
    expect(provenReason(screenTrades(trades), 41)).toBeNull();
    expect(provenReason(screenTrades(trades), 12)).toBe("under 30 settled");
    expect(provenReason(screenTrades(trades), null)).toBe("under 30 settled");
    // Settled: the larger of the record and the closed-market count; null only when neither has been read.
    expect(settledCount(12, 340)).toBe(340);
    expect(settledCount(null, 31)).toBe(31);
    expect(settledCount(41, null)).toBe(41);
    expect(settledCount(null, null)).toBeNull();
  });
  it("a market maker buys both sides within the hour, in 3+ markets", () => {
    const trades = ["a", "b", "c"].flatMap((m, i) => [t(m, "yes", i * D), t(m, "no", i * D + 20 * 60_000)]);
    expect(screenTrades(trades).reason).toBe("market maker");
    // Both sides days apart in only two markets: not a market maker.
    expect(screenTrades(["a", "b"].flatMap((m, i) => [t(m, "yes", i * D), t(m, "no", i * D + 5 * H)])).reason).toBeNull();
  });
  it("300+ trades in a day is high frequency", () => {
    expect(screenTrades(Array.from({ length: 300 }, (_, i) => t(`m${i % 50}`, "yes", i * 60_000))).reason).toBe("high frequency");
  });
  it("arbitrage: both sides held in 40%+ of 10+ markets, hours apart", () => {
    const trades = Array.from({ length: 10 }, (_, i) => [t(`m${i}`, "yes", i * D), ...(i < 5 ? [t(`m${i}`, "no", i * D + 6 * H)] : [])]).flat();
    expect(screenTrades(trades).reason).toBe("arbitrage");
  });
});

describe("the nearest Kalshi lines when the exact one isn't listed", () => {
  const tot = JSON.parse(readFileSync("test/fixtures/twins/nba-total.json", "utf8")) as { kalshi: VMarket[] };
  it("reads the line from the title", () => {
    expect(lineOf("Heat vs. Lakers: O/U 259.5")).toEqual({ kind: "total", line: 259.5, team: null });
    expect(lineOf("Spread: Lakers (-7.5)")).toEqual({ kind: "spread", line: 7.5, team: "Lakers" });
    expect(lineOf("Lakers vs. Heat")).toBeNull();
  });
  it("one line below and one above, never the same number", () => {
    const lines = tot.kalshi.map(m => m.ids?.floorStrike).filter((x): x is number => typeof x === "number").sort((a, b) => a - b);
    const mid = lines[Math.floor(lines.length / 2)]! + 1; // a line Kalshi doesn't list
    const near = nearestLines(tot.kalshi, { kind: "total", line: mid, teamCode: null });
    expect(near.map(n => n.line)).toEqual([mid - 1, mid + 1].map(x => lines.reduce((b, l) => Math.abs(l - x) < Math.abs(b - x) ? l : b)));
    expect(near.every(n => n.line !== mid && n.url.startsWith("https://kalshi.com"))).toBe(true);
  });
});
