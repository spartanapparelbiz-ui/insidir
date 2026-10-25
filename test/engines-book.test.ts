import { describe, expect, it } from "vitest";
import { cleanAsks, fillSets, takeContracts } from "@/lib/engines/book";
import { L, ZERO_PM } from "./engines-fixtures";
import type { FeeModel } from "@/lib/types";

const K: FeeModel = { venue: "kalshi", multiplier: 1 };

describe("fillSets", () => {
  it("single level, no fees", () => {
    const f = fillSets([{ asks: [L(0.4, 100)], fee: ZERO_PM }, { asks: [L(0.5, 50)], fee: ZERO_PM }], 1);
    expect(f).not.toBeNull();
    expect(f!.sets).toBe(50);
    expect(f!.cost).toBeCloseTo(45, 9);
    expect(f!.payout).toBe(50);
    expect(f!.profit).toBeCloseTo(5, 9);
    expect(f!.roi).toBeCloseTo(5 / 45, 9);
    expect(f!.legs[0]!.avgPrice).toBeCloseTo(0.4, 9);
  });

  it("walks several levels and stops when the marginal set stops paying", () => {
    const f = fillSets(
      [
        { asks: [L(0.4, 10), L(0.45, 10), L(0.6, 100)], fee: ZERO_PM },
        { asks: [L(0.5, 30)], fee: ZERO_PM },
      ],
      1,
    )!;
    expect(f.sets).toBe(20);
    expect(f.legs[0]!.worstPrice).toBe(0.45);
    expect(f.legs[0]!.avgPrice).toBeCloseTo(0.425, 9);
    expect(f.legs[0]!.fills).toHaveLength(2);
    expect(f.profit).toBeCloseTo(20 - (4 + 4.5) - 10, 9);
  });

  it("sorts asks and ignores prices at 0 or ≥ 1 and empty levels", () => {
    expect(cleanAsks([L(0.5, 1), L(0, 5), L(1, 5), L(0.3, 0), L(0.2, 2)])).toEqual([L(0.2, 2), L(0.5, 1)]);
    const f = fillSets([{ asks: [L(1, 100), L(0, 100), L(0.45, 5)], fee: ZERO_PM }, { asks: [L(0.5, 100)], fee: ZERO_PM }], 1)!;
    expect(f.sets).toBe(5);
  });

  it("returns null on an empty book or no edge", () => {
    expect(fillSets([{ asks: [], fee: ZERO_PM }, { asks: [L(0.1, 5)], fee: ZERO_PM }], 1)).toBeNull();
    expect(fillSets([{ asks: [L(0.5, 5)], fee: ZERO_PM }, { asks: [L(0.5, 5)], fee: ZERO_PM }], 1)).toBeNull();
    expect(fillSets([], 1)).toBeNull();
  });

  it("floors fractional sizes to whole sets", () => {
    const f = fillSets([{ asks: [L(0.4, 7.9)], fee: ZERO_PM }, { asks: [L(0.5, 100.5)], fee: ZERO_PM }], 1)!;
    expect(f.sets).toBe(7);
    expect(fillSets([{ asks: [L(0.4, 0.9)], fee: ZERO_PM }, { asks: [L(0.5, 5)], fee: ZERO_PM }], 1)).toBeNull();
  });

  it("whole sets across fractional level boundaries", () => {
    const f = fillSets([{ asks: [L(0.4, 2.5), L(0.41, 2.5)], fee: ZERO_PM }, { asks: [L(0.5, 10)], fee: ZERO_PM }], 1)!;
    expect(f.sets).toBe(5);
    expect(f.legs[0]!.cost).toBeCloseTo(2.5 * 0.4 + 2.5 * 0.41, 9);
  });

  it("caps at maxSets", () => {
    const f = fillSets([{ asks: [L(0.4, 100)], fee: ZERO_PM }, { asks: [L(0.5, 100)], fee: ZERO_PM }], 1, { maxSets: 12 })!;
    expect(f.sets).toBe(12);
    expect(fillSets([{ asks: [L(0.4, 100)], fee: ZERO_PM }], 1, { maxSets: 0 })).toBeNull();
  });

  it("honours minProfitPerSet", () => {
    const legs = [{ asks: [L(0.4, 10), L(0.48, 10)], fee: ZERO_PM }, { asks: [L(0.5, 100)], fee: ZERO_PM }];
    expect(fillSets(legs, 1)!.sets).toBe(20);
    expect(fillSets(legs, 1, { minProfitPerSet: 0.05 })!.sets).toBe(10);
  });

  it("Kalshi fees: a profitable-looking single contract turns negative after rounding up", () => {
    // 0.49 + 0.50 = 0.99; marginal fees ≈ 0.0175 + 0.0175 > 0.01 → walker never starts.
    expect(fillSets([{ asks: [L(0.49, 1)], fee: K }, { asks: [L(0.5, 1)], fee: K }], 1)).toBeNull();
    // 0.45 + 0.50 = 0.95; marginal fee ≈ 0.0173+0.0175 → 0.015 margin per set; 1 set: fees 0.02 + 0.02 → profit 0.01.
    const f = fillSets([{ asks: [L(0.45, 1)], fee: K }, { asks: [L(0.5, 1)], fee: K }], 1)!;
    expect(f.fees).toBeCloseTo(0.04, 9);
    expect(f.profit).toBeCloseTo(0.01, 9);
  });

  it("trims when per-level rounding makes the last level lose money", () => {
    // Leg 1: 100 @ 0.45 then 1 @ 0.461; leg 2 deep at 0.5. Unrounded margin of the 101st set:
    // 1 − 0.961 − 0.0174 − 0.0175 ≈ +0.004, but that lone fill rounds to 0.02 and leg 2's fee steps 1.75 → 1.77,
    // so the 101st set loses 0.001. The walker trims back to 100.
    const legs = [{ asks: [L(0.45, 100), L(0.461, 1)], fee: K }, { asks: [L(0.5, 1000)], fee: K }];
    const f = fillSets(legs, 1)!;
    expect(f.sets).toBe(100);
    expect(f.fees).toBeCloseTo(1.74 + 1.75, 9);
    expect(f.profit).toBeCloseTo(100 - 95 - 3.49, 9);
  });

  it("supports payout per set above 1 (all-NO)", () => {
    const f = fillSets([0.6, 0.6, 0.6].map((p) => ({ asks: [L(p, 3)], fee: ZERO_PM })), 2)!;
    expect(f.sets).toBe(3);
    expect(f.payout).toBe(6);
    expect(f.profit).toBeCloseTo(0.6, 9);
  });
});

describe("takeContracts", () => {
  it("computes Kalshi fees per level", () => {
    const lf = takeContracts([L(0.5, 1), L(0.5, 1)], 2, K)!;
    expect(lf.fee).toBeCloseTo(0.04, 9); // two fills of 0.0175 → 0.02 each, vs 0.04 combined (0.035 → 0.04)
    expect(takeContracts([L(0.5, 1)], 2, K)).toBeNull();
  });
});

describe("fillSets rounding to nothing", () => {
  it("returns null when rounded fees eat the whole edge", () => {
    // Unrounded margin 1 − 0.96 − 0.0174 − 0.0175 ≈ 0.005 > 0, but fees round to 0.02 + 0.02 → profit 0.
    expect(fillSets([{ asks: [L(0.46, 1)], fee: { venue: "kalshi", multiplier: 1 } }, { asks: [L(0.5, 1)], fee: { venue: "kalshi", multiplier: 1 } }], 1)).toBeNull();
  });
});
