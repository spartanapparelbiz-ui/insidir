/* docs/BRIEF.md phase 1: the pure parts of the signature components. */
import { describe, expect, it } from "vitest";
import { dollarBarLabel } from "@/components/ui/DollarBar";
import { followGreen, marketKey, settle } from "@/lib/engines/receipts";
import { keptCurve, SLIDER_MIN_DEALS, SLIDER_STAKES } from "@/lib/kept";
import type { Opportunity, Side } from "@/lib/types";
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

describe("the $1 bar's sentence", () => {
  it("says what you spend, get back and keep after fees", () => {
    expect(dollarBarLabel([{ label: "a", cents: 48 }, { label: "b", cents: 47 }], 0.4)).toBe("Spend 95 cents, get 1 dollar back, keep 4.6 cents after fees.");
  });
  it("says so when the prices are over $1", () => {
    expect(dollarBarLabel([{ label: "a", cents: 55 }, { label: "b", cents: 46 }])).toMatch(/over 1 dollar, so there's nothing to keep/);
  });
});


describe("what you could have kept", () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => {
    const o = opp({ id: `o${i}`, cost: 90 + i * 100, fees: 2 });
    return { opp: o, settlement: settle(o, res(i === 1 ? "no" : "yes", "yes")) };
  });
  it("equals the receipts backtest at every stake (the slider at $500 is Receipts' $500 per green deal)", () => {
    const rows = many(5);
    const curve = keptCurve(rows)!;
    expect(curve.map(p => p.stake)).toEqual([...SLIDER_STAKES]);
    for (const p of curve) expect(p.kept).toBe(followGreen(rows, p.stake).realizedProfit);
  });
  it("is hidden with too few settled green deals", () => {
    expect(keptCurve(many(SLIDER_MIN_DEALS - 1))).toBeNull();
  });
});
