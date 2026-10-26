import { describe, expect, it } from "vitest";
import { followGreen, marketKey, settle } from "@/lib/engines/receipts";
import { bigTrades } from "@/lib/engines/whales";
import type { Opportunity, Side, WhaleTrade } from "@/lib/types";

const opp = (over: Partial<Opportunity> = {}): Opportunity => ({
  id: "x", kind: "cross_arb", title: "T",
  legs: [
    { venue: "kalshi", marketId: "K", side: "yes", label: "", url: "", contracts: 100, avgPrice: 0.4, worstPrice: 0.4, cost: 40, fee: 1 },
    { venue: "polymarket", marketId: "P", side: "no", label: "", url: "", contracts: 100, avgPrice: 0.5, worstPrice: 0.5, cost: 50, fee: 1 },
  ],
  sets: 100, cost: 90, fees: 2, payout: 100, profit: 8, roi: 8 / 92, days: 1, profitPerDay: 8,
  safety: "green", safetyNotes: [], categories: [], closeTime: null, pairId: null, gapCents: null, ...over,
});
const res = (k: Side | "void", p: Side | "void") => new Map<string, Side | "void">([[marketKey("kalshi", "K"), k], [marketKey("polymarket", "P"), p]]);

describe("settle", () => {
  it("same way: the locked profit", () => {
    expect(settle(opp(), res("yes", "yes"))).toEqual({ settled: true, sameWay: true, realizedPayout: 100, realizedProfit: 8 });
    expect(settle(opp(), res("no", "no")).realizedProfit).toBe(8);
  });
  it("inconsistent settlement shows the actual result", () => {
    expect(settle(opp(), res("no", "yes"))).toMatchObject({ settled: true, sameWay: false, realizedPayout: 0, realizedProfit: -92 });
    expect(settle(opp(), res("yes", "no"))).toMatchObject({ sameWay: true, realizedPayout: 200, realizedProfit: 108 });
  });
  it("void refunds cost but not fees", () => {
    expect(settle(opp(), res("void", "yes"))).toMatchObject({ sameWay: false, realizedPayout: 40, realizedProfit: -52 });
  });
  it("not settled until every leg has a result", () => {
    expect(settle(opp(), new Map([[marketKey("kalshi", "K"), "yes" as const]])).settled).toBe(false);
  });
});

describe("followGreen", () => {
  it("scales to min(stake, fillable) and counts only settled green locks", () => {
    const small = opp({ cost: 90, fees: 2 }); // outlay 92 < 500: full size
    const big = opp({ legs: opp().legs.map((l) => ({ ...l, contracts: 1000, cost: l.cost * 10, fee: l.fee * 10 })), cost: 900, fees: 20, payout: 1000, profit: 80 }); // outlay 920 → scaled 500/920
    const r = followGreen([
      { opp: small, settlement: settle(small, res("yes", "yes")) },
      { opp: big, settlement: settle(big, res("no", "no")) },
      { opp: opp({ safety: "yellow" }), settlement: settle(opp(), res("yes", "yes")) },
      { opp: opp(), settlement: settle(opp(), new Map()) },
    ]);
    expect(r.count).toBe(2);
    expect(r.pending).toBe(1);
    expect(r.broken).toBe(0);
    expect(r.staked).toBeCloseTo(92 + 500, 6);
    expect(r.realizedProfit).toBeCloseTo(8 + 80 * (500 / 920), 6);
  });
  it("includes losses from broken locks", () => {
    const o = opp();
    const r = followGreen([{ opp: o, settlement: settle(o, res("no", "yes")) }], 46);
    expect(r.broken).toBe(1);
    expect(r.realizedProfit).toBeCloseTo(-46, 6);
  });
});

describe("bigTrades", () => {
  const t = (over: Partial<WhaleTrade>): WhaleTrade => ({ venue: "polymarket", wallet: "0xA", name: null, marketId: "m", marketTitle: "M", outcome: "Yes", side: "BUY", contracts: 20000, price: 0.6, cash: 12000, timestamp: 1, txHash: "0x1", url: "", ...over });
  it("filters by cash, dedupes by tx + wallet, newest first", () => {
    const out = bigTrades([t({ timestamp: 1 }), t({ timestamp: 1 }), t({ txHash: "0x2", timestamp: 3 }), t({ wallet: "0xB", timestamp: 2 }), t({ txHash: "0x3", cash: 9000 })]);
    expect(out.map((x) => [x.txHash, x.wallet, x.timestamp])).toEqual([["0x2", "0xA", 3], ["0x1", "0xB", 2], ["0x1", "0xA", 1]]);
    expect(bigTrades([t({ cash: 9000 })], 5000)).toHaveLength(1);
  });
});
