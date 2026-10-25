import { describe, expect, it } from "vitest";
import { ceilToCent, feeModelFor, kalshiFee, marginalTakerFee, polymarketFee, polymarketRate, takerFee } from "@/lib/fees";

describe("ceilToCent", () => {
  it("rounds up to the next cent", () => {
    expect(ceilToCent(0.0101)).toBe(0.02);
    expect(ceilToCent(0.0001)).toBe(0.01);
  });
  it("does not round exact cents up through float noise", () => {
    expect(ceilToCent(0.07)).toBe(0.07);
    expect(ceilToCent(0.1 + 0.2)).toBe(0.3);
    expect(ceilToCent(1.75)).toBe(1.75);
  });
  it("is 0 for zero, negative and non-finite", () => {
    expect(ceilToCent(0)).toBe(0);
    expect(ceilToCent(-1)).toBe(0);
    expect(ceilToCent(Number.NaN)).toBe(0);
  });
});

describe("Kalshi fees", () => {
  it("taker: ceil(0.07 × C × P × (1−P))", () => {
    expect(kalshiFee(100, 0.5)).toBe(1.75); // 0.07*100*0.25 = 1.75 exactly (float gives 1.7500000000000002)
    expect(kalshiFee(1, 0.5)).toBe(0.02); // 0.0175 → 0.02
    expect(kalshiFee(10, 0.3)).toBe(0.15); // 0.147 → 0.15
    expect(kalshiFee(4, 0.5)).toBe(0.07); // exactly 0.07
  });
  it("maker: 0.0175 rate", () => {
    expect(kalshiFee(100, 0.5, 1, "maker")).toBe(0.44); // 0.4375 → 0.44
  });
  it("applies the series multiplier", () => {
    expect(kalshiFee(100, 0.5, 2)).toBe(3.5);
    expect(kalshiFee(100, 0.5, 0)).toBe(0);
  });
  it("is 0 at prices 0 and 1 and for no contracts", () => {
    expect(kalshiFee(100, 0)).toBe(0);
    expect(kalshiFee(100, 1)).toBe(0);
    expect(kalshiFee(0, 0.5)).toBe(0);
  });
});

describe("Polymarket fees", () => {
  it("rates by category, unknown → other", () => {
    expect(polymarketRate("crypto")).toBe(0.07);
    expect(polymarketRate("Sports")).toBe(0.05);
    expect(polymarketRate("politics")).toBe(0.04);
    expect(polymarketRate("tech")).toBe(0.04);
    expect(polymarketRate("geopolitics")).toBe(0);
    expect(polymarketRate("something-new")).toBe(0.05);
  });
  it("taker: C × rate × p × (1−p), unrounded; makers pay 0", () => {
    expect(polymarketFee(100, 0.5, 0.07)).toBeCloseTo(1.75, 12);
    expect(polymarketFee(1, 0.2, 0.04)).toBeCloseTo(0.0064, 12);
    expect(polymarketFee(100, 0.5, 0.07, "maker")).toBe(0);
  });
  it("takerFee dispatches by venue, polymarket_us uses the same schedule", () => {
    expect(takerFee({ venue: "kalshi", multiplier: 1 }, 1, 0.5)).toBe(0.02);
    expect(takerFee({ venue: "polymarket", rate: 0.05 }, 10, 0.5)).toBeCloseTo(0.125, 12);
    expect(takerFee({ venue: "polymarket_us", rate: 0.05 }, 10, 0.5)).toBeCloseTo(0.125, 12);
  });
  it("feeModelFor and marginal fees", () => {
    expect(feeModelFor("polymarket", "crypto")).toEqual({ venue: "polymarket", rate: 0.07 });
    expect(feeModelFor("kalshi", "x", null)).toEqual({ venue: "kalshi", multiplier: 1 });
    expect(marginalTakerFee({ venue: "kalshi", multiplier: 1 }, 0.5)).toBeCloseTo(0.0175, 12);
  });
});
