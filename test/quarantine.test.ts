/* The "too good to be true" guard: return above 15%, more than $50 kept at $500, or a pair whose rules differ. */
import { describe, expect, it } from "vitest";
import { keepAt, quarantineReasons } from "@/lib/quarantine";
import type { FeeModel, MarketPair, Opportunity } from "@/lib/types";

const fee = (): FeeModel => ({ venue: "polymarket", rate: 0 });
const ctx = { fee };

/** Two legs at `a` and `b` per contract that together pay $1 a set. */
function opp(a: number, b: number, over: Partial<Opportunity> = {}): Opportunity {
  const sets = 10_000;
  const cost = (a + b) * sets;
  const leg = (marketId: string, price: number) => ({ venue: "polymarket" as const, marketId, side: "yes" as const, label: marketId, url: "", contracts: sets, avgPrice: price, worstPrice: price, cost: price * sets, fee: 0 });
  return {
    id: "o", kind: "cross_arb", title: "T", legs: [leg("A", a), leg("B", b)], sets, cost, fees: 0, payout: sets, profit: sets - cost, roi: (sets - cost) / cost,
    days: 10, profitPerDay: 0, safety: "green", safetyNotes: [], categories: [], closeTime: null, pairId: null, gapCents: null, ...over,
  };
}

const pair = (ruleMismatch?: MarketPair["ruleMismatch"]): MarketPair => ({
  id: "P", a: { venue: "kalshi", id: "K" }, b: { venue: "polymarket", id: "X" }, inverted: false, method: "deterministic",
  confidence: 0.9, safety: "yellow", safetyNotes: [], ruleMismatch, blocked: false,
});

describe("quarantineReasons", () => {
  it("lets a normal lock through", () => {
    // 97¢ a set for $1: 3.1%, about $15 kept at $500.
    expect(quarantineReasons(opp(0.48, 0.49), ctx)).toEqual([]);
  });

  it("holds back a return above 15%", () => {
    const r = quarantineReasons(opp(0.4, 0.45), ctx);
    expect(r.some(x => x.startsWith("Return 17.6%"))).toBe(true);
  });

  it("holds back more than $50 kept at $500, even under 15%", () => {
    // 89¢ a set: 12.4% return, $61.80 kept on 561 sets at $500.
    const o = opp(0.44, 0.45);
    expect(o.roi).toBeLessThan(0.15);
    expect(keepAt(o, 500, fee)).toBeGreaterThan(50);
    expect(quarantineReasons(o, ctx)).toEqual([expect.stringMatching(/^You keep \$\d+\.\d\d at \$500, above \$50$/)]);
  });

  it("holds back deals from a pair whose rules differ in date, threshold or source", () => {
    const o = opp(0.48, 0.49, { pairId: "P" });
    expect(quarantineReasons(o, { fee, pair: pair([]) })).toEqual([]);
    expect(quarantineReasons(o, { fee, pair: pair(["date", "source"]) })).toEqual(["The two markets' rules differ in date, resolution source"]);
    // Second opinions have no return to check, but the pair rule still applies.
    expect(quarantineReasons(opp(0.3, 0.3, { kind: "second_opinion", roi: 0, pairId: "P" }), { fee, pair: pair(["threshold"]) })).toEqual(["The two markets' rules differ in threshold"]);
    expect(quarantineReasons(opp(0.3, 0.3, { kind: "second_opinion", roi: 0 }), ctx)).toEqual([]);
  });
});
