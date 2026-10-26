import { describe, expect, it } from "vitest";
import { findLadderImplications, findLadders } from "@/lib/engines/ladder";
import { implicationViolations } from "@/lib/engines/common";
import type { Book, Strike, VMarket } from "@/lib/types";
import { DAY, L, NOW, ZERO_PM, book, key, market } from "./engines-fixtures";

const strike = (kind: Strike["kind"], value: number, subject = "btc"): Strike => ({ kind, value, upper: null, subject });
const rung = (id: string, s: Strike, over: Partial<VMarket> = {}): VMarket =>
  market({ id, venue: "polymarket", fee: ZERO_PM, strike: s, yesLabel: `${s.kind} ${s.value}`, eventId: "BTC-OCT", ...over });

describe("ladders", () => {
  it("above(hi) implies above(lo); below(lo) implies below(hi)", () => {
    const imps = findLadderImplications([rung("a100", strike("above", 100)), rung("a110", strike("above", 110)), rung("b90", strike("below", 90)), rung("b80", strike("below", 80))]);
    const pairs = imps.map((i) => `${i.antecedent.id}>${i.consequent.id}`).sort();
    expect(pairs).toEqual(["a110>a100", "b80>b90"]);
  });

  it("ignores different subjects, venues, close times and between strikes", () => {
    const imps = findLadderImplications([
      rung("a100", strike("above", 100)),
      rung("e110", strike("above", 110, "eth")),
      rung("k110", strike("above", 110), { venue: "kalshi" }),
      rung("late110", strike("above", 110), { closeTime: NOW + 30 * DAY }),
      rung("bt", { kind: "between", value: 100, upper: 110, subject: "btc" }),
    ]);
    expect(imps).toEqual([]);
  });

  it("locks YES on the consequent + NO on the antecedent when profitable", () => {
    const lo = rung("a100", strike("above", 100));
    const hi = rung("a110", strike("above", 110));
    const books = new Map<string, Book>([
      [key("polymarket", "a100"), book({ yesAsks: [L(0.55, 10)], yesBids: [L(0.53, 10)] })],
      [key("polymarket", "a110"), book({ noAsks: [L(0.4, 10)], yesAsks: [L(0.62, 10)], yesBids: [L(0.6, 10)] })],
    ]);
    const opps = findLadders([lo, hi], books, NOW);
    expect(opps).toHaveLength(1);
    expect(opps[0]!.kind).toBe("ladder");
    expect(opps[0]!.legs.map((l) => [l.marketId, l.side])).toEqual([["a100", "yes"], ["a110", "no"]]);
    expect(opps[0]!.profit).toBeCloseTo(0.5, 9);
    expect(opps[0]!.safety).toBe("green");
    const v = implicationViolations(findLadderImplications([lo, hi]), books);
    expect(v).toHaveLength(1);
    expect(v[0]!.gapCents).toBe(7);
  });

  it("marks rungs from different events yellow", () => {
    const imps = findLadderImplications([rung("a100", strike("above", 100)), rung("a110", strike("above", 110), { eventId: "OTHER" })]);
    expect(imps[0]!.safety).toBe("yellow");
  });
});

describe("ladder size", () => {
  it("pairs each rung with its nearest rungs only, so a 2,000-rung ladder stays linear", async () => {
    const { LADDER_NEIGHBORS } = await import("@/lib/engines/ladder");
    const rungs = Array.from({ length: 2000 }, (_, i) =>
      market({ id: `r${i}`, venue: "polymarket", fee: ZERO_PM, eventId: "BIG", strike: { kind: "above", value: i, subject: "margin" } as Strike }));
    const imps = findLadderImplications(rungs);
    expect(imps.length).toBeLessThanOrEqual(2000 * LADDER_NEIGHBORS);
    expect(imps.every(i => i.antecedent.strike!.value > i.consequent.strike!.value)).toBe(true);
    expect(imps.some(i => i.antecedent.id === "r10" && i.consequent.id === "r9")).toBe(true);
  });
});
