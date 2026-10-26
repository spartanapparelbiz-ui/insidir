/* The hand-checked fixture. YES at 55¢ on Kalshi + NO at 40¢ on Polymarket, 100 contracts each, worked out by hand:
 *
 *   Kalshi taker fee   ceil(0.07 × 100 × 0.55 × 0.45) = ceil(1.7325)  = $1.74
 *   Polymarket fee     100 × 0.05 (sports) × 0.40 × 0.60             = $1.20
 *   Cost               100 × $0.55 + 100 × $0.40                     = $95.00
 *   Paid in            $95.00 + $1.74 + $1.20                        = $97.94
 *   Payout             100 sets × $1 (one side always pays)          = $100.00
 *   Profit             $100.00 − $97.94                              = $2.06
 *   ROI                2.06 / 97.94                                  = 2.103%
 *   Profit per day     resolves in 10 days                           = $0.206
 *
 * SYNTHETIC markets; the numbers are what matter. */
import { describe, expect, it } from "vitest";
import { findCrossArbs } from "@/lib/engines/arb";
import { fillSets } from "@/lib/engines/book";
import { kalshiFee, polymarketFee, polymarketRate } from "@/lib/fees";
import { book, DAY, L, market, NOW, pair } from "./engines-fixtures";

describe("hand-checked: YES 55¢ on Kalshi + NO 40¢ on Polymarket, 100 contracts", () => {
  it("fees match the hand calculation", () => {
    expect(kalshiFee(100, 0.55)).toBe(1.74);
    expect(polymarketFee(100, 0.4, polymarketRate("sports"))).toBeCloseTo(1.2, 10);
  });

  it("the book walker produces exactly $2.06 profit on $97.94", () => {
    const f = fillSets([
      { asks: [L(0.55, 100)], fee: { venue: "kalshi", multiplier: 1 } },
      { asks: [L(0.4, 100)], fee: { venue: "polymarket", rate: polymarketRate("sports") } },
    ], 1);
    expect(f).not.toBeNull();
    expect(f?.sets).toBe(100);
    expect(f?.cost).toBeCloseTo(95, 10);
    expect(f?.fees).toBeCloseTo(2.94, 10);
    expect(f?.payout).toBe(100);
    expect(f?.profit).toBeCloseTo(2.06, 10);
    expect(f?.roi).toBeCloseTo(2.06 / 97.94, 10);
  });

  it("the cross-exchange engine finds the same deal, in the right direction, with profit per day", () => {
    const k = market({ id: "K", venue: "kalshi", title: "Example team wins", category: "sports", closeTime: NOW + 10 * DAY });
    const p = market({ id: "P", venue: "polymarket", title: "Example team wins", category: "sports", fee: { venue: "polymarket", rate: 0.05 }, closeTime: NOW + 10 * DAY });
    const opps = findCrossArbs([{ pair: pair(k, p), a: k, b: p,
      bookA: book({ yesAsks: [L(0.55, 100)], noAsks: [L(0.5, 100)] }), bookB: book({ yesAsks: [L(0.65, 100)], noAsks: [L(0.4, 100)] }) }], NOW);
    expect(opps).toHaveLength(1);
    const o = opps[0];
    expect(o?.legs.map(l => [l.venue, l.side, l.avgPrice])).toEqual([["kalshi", "yes", 0.55], ["polymarket", "no", 0.4]]);
    expect(o?.profit).toBeCloseTo(2.06, 10);
    expect(o?.fees).toBeCloseTo(2.94, 10);
    expect(o?.profitPerDay).toBeCloseTo(0.206, 10);
  });
});
