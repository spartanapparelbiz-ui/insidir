import { describe, expect, it } from "vitest";
import { calculate, priceSets, type CalcInput } from "@/lib/calculator";

const cross = (maxSets = 1000, kPrice = 0.55, pPrice = 0.4): CalcInput => ({
  payoutPerSet: 1,
  maxSets,
  legs: [
    { label: "YES on Kalshi", venue: "kalshi", side: "yes", avgPrice: kPrice, fee: { venue: "kalshi", multiplier: 1 } },
    { label: "NO on Polymarket", venue: "polymarket", side: "no", avgPrice: pPrice, fee: { venue: "polymarket", rate: 0.04 } },
  ],
});

describe("calculator", () => {
  it("finds the largest whole number of sets that fits, with Kalshi fees rounded up per fill", () => {
    const r = calculate(cross(), 100);
    expect(r.reason).toBe("ok");
    expect(r.sets).toBe(102);
    expect(r.legs.map(l => l.contracts)).toEqual([102, 102]);
    expect(r.legs[0]?.cost).toBeCloseTo(56.1, 9);
    expect(r.legs[1]?.cost).toBeCloseTo(40.8, 9);
    // Kalshi: ceil(0.07 × 102 × 0.55 × 0.45) = ceil(1.76715) = $1.77
    expect(r.legs[0]?.fee).toBeCloseTo(1.77, 9);
    // Polymarket politics: 102 × 0.04 × 0.4 × 0.6 = $0.9792
    expect(r.legs[1]?.fee).toBeCloseTo(0.9792, 9);
    expect(r.total).toBeCloseTo(99.6492, 9);
    expect(r.payout).toBe(102);
    expect(r.profit).toBeCloseTo(2.3508, 9);
    expect(r.roi).toBeCloseTo(2.3508 / 99.6492, 9);
    expect(r.capped).toBe(false);
    // One more set would not fit.
    expect(priceSets(cross(), 103).total).toBeGreaterThan(100);
  });

  it("is capped by the fillable size", () => {
    const r = calculate(cross(50), 10_000);
    expect(r.sets).toBe(50);
    expect(r.capped).toBe(true);
    expect(r.legs[0]?.fee).toBeCloseTo(0.87, 9); // ceil(0.86625)
    expect(r.legs[1]?.fee).toBeCloseTo(0.48, 9);
    expect(r.total).toBeCloseTo(48.85, 9);
    expect(r.profit).toBeCloseTo(1.15, 9);
  });

  it("floors fractional fillable sets", () => {
    expect(calculate(cross(10.9), 10_000).sets).toBe(10);
  });

  it("returns zero when the amount is too small for one set", () => {
    const r = calculate(cross(), 0.5);
    expect(r).toMatchObject({ sets: 0, cost: 0, fees: 0, total: 0, payout: 0, profit: 0, roi: 0, reason: "too_small" });
    expect(r.legs.every(l => l.contracts === 0 && l.cost === 0 && l.fee === 0)).toBe(true);
  });

  it("never returns a negative profit: fees that eat the gap give zero sets", () => {
    // 0.55 + 0.44 = 0.99 a set; one set costs 0.99 + 0.02 (Kalshi, rounded up) + 0.009856 > $1 payout.
    const r = calculate(cross(1000, 0.55, 0.44), 1.02);
    expect(r.reason).toBe("no_profit");
    expect(r.sets).toBe(0);
    expect(r.profit).toBe(0);
  });

  it("rejects negative, zero and non-numeric amounts with zeros", () => {
    for (const a of [-5, 0, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = calculate(cross(), a);
      expect(r.sets).toBe(0);
      expect(r.total).toBe(0);
      expect(r.profit).toBe(0);
      expect(r.reason).toBe("invalid");
    }
  });

  it("handles Polymarket-only multi-outcome sets (fees not rounded)", () => {
    const input: CalcInput = {
      payoutPerSet: 1, maxSets: 500,
      legs: [0.3, 0.3, 0.35].map((p, i) => ({ label: `YES ${i}`, venue: "polymarket" as const, side: "yes" as const, avgPrice: p, fee: { venue: "polymarket" as const, rate: 0.05 } })),
    };
    const r = calculate(input, 50);
    expect(r.sets).toBe(50);
    expect(r.cost).toBeCloseTo(47.5, 9);
    expect(r.fees).toBeCloseTo(50 * 0.05 * (0.21 + 0.21 + 0.2275), 9);
    expect(r.total).toBeCloseTo(49.11875, 9);
    expect(r.profit).toBeCloseTo(0.88125, 9);
    expect(priceSets(input, 51).total).toBeGreaterThan(50);
  });

  it("uses the payout per set, not $1, when a set pays more", () => {
    const input: CalcInput = { ...cross(), payoutPerSet: 2, legs: cross().legs.map(l => ({ ...l, avgPrice: l.avgPrice * 2 > 1 ? 0.95 : l.avgPrice * 2 })) };
    const r = calculate(input, 20);
    expect(r.payout).toBe(r.sets * 2);
  });
});
