import { describe, expect, it } from "vitest";
import { findMultiOutcome } from "@/lib/engines/multi";
import type { Book, VEvent } from "@/lib/types";
import { L, NOW, ZERO_PM, book, key, market } from "./engines-fixtures";

const ms = ["A", "B", "C"].map((id) => market({ id, venue: "polymarket", fee: ZERO_PM, yesLabel: `Team ${id}` }));
const ev = (over: Partial<VEvent> = {}): VEvent => ({ venue: "polymarket", id: "E", title: "Who wins?", category: "sports", marketIds: ["A", "B", "C"], mutuallyExclusive: true, exhaustive: true, closeTime: null, ...over });
const books = (yes: number[], no: number[]): Map<string, Book> =>
  new Map(ms.map((m, i) => [key("polymarket", m.id), book({ yesAsks: [L(yes[i]!, 10)], noAsks: [L(no[i]!, 10)] })]));

describe("multi-outcome", () => {
  it("all-YES when exhaustive", () => {
    const opps = findMultiOutcome([{ event: ev(), markets: ms, books: books([0.3, 0.3, 0.3], [0.9, 0.9, 0.9]) }], NOW);
    expect(opps.map((o) => o.kind)).toEqual(["multi_yes"]);
    expect(opps[0]!.payout).toBe(10);
    expect(opps[0]!.profit).toBeCloseTo(1, 9);
    expect(opps[0]!.legs.map((l) => l.label)).toEqual(["YES: Team A", "YES: Team B", "YES: Team C"]);
  });

  it("no all-YES when mutually exclusive but not exhaustive", () => {
    const opps = findMultiOutcome([{ event: ev({ exhaustive: false }), markets: ms, books: books([0.3, 0.3, 0.3], [0.9, 0.9, 0.9]) }], NOW);
    expect(opps).toEqual([]);
  });

  it("all-NO pays N − 1 per set, also when not exhaustive", () => {
    const b = books([0.5, 0.5, 0.5], [0.6, 0.6, 0.6]);
    for (const exhaustive of [true, false]) {
      const opps = findMultiOutcome([{ event: ev({ exhaustive }), markets: ms, books: b }], NOW);
      expect(opps.map((o) => o.kind)).toEqual(["multi_no"]);
      expect(opps[0]!.payout).toBe(20);
      expect(opps[0]!.profit).toBeCloseTo(20 - 18, 9);
    }
  });

  it("skips non-exclusive events, missing legs, inactive markets and missing books", () => {
    const b = books([0.3, 0.3, 0.3], [0.6, 0.6, 0.6]);
    expect(findMultiOutcome([{ event: ev({ mutuallyExclusive: false, exhaustive: false }), markets: ms, books: b }], NOW)).toEqual([]);
    expect(findMultiOutcome([{ event: ev(), markets: ms.slice(0, 2), books: b }], NOW)).toEqual([]);
    expect(findMultiOutcome([{ event: ev(), markets: [ms[0]!, ms[1]!, { ...ms[2]!, active: false }], books: b }], NOW)).toEqual([]);
    const partial = new Map(b);
    partial.delete(key("polymarket", "C"));
    expect(findMultiOutcome([{ event: ev(), markets: ms, books: partial }], NOW)).toEqual([]);
  });
});
