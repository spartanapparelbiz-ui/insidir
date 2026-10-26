import { describe, expect, it } from "vitest";
import { findCrossArbs } from "@/lib/engines/arb";
import { findSecondOpinions, SECOND_OPINION_NOTE } from "@/lib/engines/second-opinion";
import { DAY, L, NOW, ZERO_PM, book, market, pair } from "./engines-fixtures";

const ka = market({ id: "KXA", venue: "kalshi", fee: { venue: "kalshi", multiplier: 0 }, title: "Will it rain?" });
const pb = market({ id: "0xB", venue: "polymarket", fee: ZERO_PM, closeTime: NOW + 20 * DAY });

describe("cross-exchange arb", () => {
  it("YES on a + NO on b", () => {
    const opps = findCrossArbs([{ pair: pair(ka, pb), a: ka, b: pb, bookA: book({ yesAsks: [L(0.4, 10)], noAsks: [L(0.7, 10)] }), bookB: book({ yesAsks: [L(0.7, 10)], noAsks: [L(0.5, 10)] }) }], NOW);
    expect(opps).toHaveLength(1);
    const o = opps[0]!;
    expect(o.kind).toBe("cross_arb");
    expect(o.legs.map((l) => [l.venue, l.side, l.label])).toEqual([["kalshi", "yes", "YES on Kalshi"], ["polymarket", "no", "NO on Polymarket"]]);
    expect(o.sets).toBe(10);
    expect(o.profit).toBeCloseTo(1, 9);
    expect(o.days).toBeCloseTo(20, 9);
    expect(o.profitPerDay).toBeCloseTo(0.05, 9);
    expect(o.title).toBe("Will it rain?");
    expect(o.pairId).toBe(pair(ka, pb).id);
    expect(o.closeTime).toBe(NOW + 20 * DAY);
  });

  it("NO on a + YES on b, and a stable id", () => {
    const input = { pair: pair(ka, pb), a: ka, b: pb, bookA: book({ yesAsks: [L(0.7, 5)], noAsks: [L(0.3, 5)] }), bookB: book({ yesAsks: [L(0.6, 5)], noAsks: [L(0.5, 5)] }) };
    const [o] = findCrossArbs([input], NOW);
    expect(o!.legs.map((l) => l.side)).toEqual(["no", "yes"]);
    expect(findCrossArbs([input], NOW + DAY)[0]!.id).toBe(o!.id);
  });

  it("inverted pairs lock YES + YES or NO + NO", () => {
    const p = pair(ka, pb, { inverted: true, safety: "yellow", safetyNotes: ["Different sources."] });
    const yy = findCrossArbs([{ pair: p, a: ka, b: pb, bookA: book({ yesAsks: [L(0.4, 5)], noAsks: [L(0.65, 5)] }), bookB: book({ yesAsks: [L(0.5, 5)], noAsks: [L(0.6, 5)] }) }], NOW);
    expect(yy.map((o) => o.legs.map((l) => l.side))).toEqual([["yes", "yes"]]);
    expect(yy[0]!.safety).toBe("yellow");
    expect(yy[0]!.safetyNotes).toEqual(["Different sources."]);
    const nn = findCrossArbs([{ pair: p, a: ka, b: pb, bookA: book({ yesAsks: [L(0.7, 5)], noAsks: [L(0.3, 5)] }), bookB: book({ yesAsks: [L(0.7, 5)], noAsks: [L(0.6, 5)] }) }], NOW);
    expect(nn.map((o) => o.legs.map((l) => l.side))).toEqual([["no", "no"]]);
    // The non-inverted combination would look profitable here, but must not be emitted for an inverted pair.
    const none = findCrossArbs([{ pair: p, a: ka, b: pb, bookA: book({ yesAsks: [L(0.4, 5)], noAsks: [L(0.7, 5)] }), bookB: book({ yesAsks: [L(0.7, 5)], noAsks: [L(0.5, 5)] }) }], NOW);
    expect(none).toEqual([]);
  });

  it("skips blocked pairs, inactive markets, mismatched ids and unprofitable books", () => {
    const books = { bookA: book({ yesAsks: [L(0.4, 10)] }), bookB: book({ noAsks: [L(0.5, 10)] }) };
    expect(findCrossArbs([{ pair: pair(ka, pb, { blocked: true }), a: ka, b: pb, ...books }], NOW)).toEqual([]);
    expect(findCrossArbs([{ pair: pair(ka, pb), a: { ...ka, active: false }, b: pb, ...books }], NOW)).toEqual([]);
    expect(findCrossArbs([{ pair: pair(ka, pb), a: pb, b: ka, ...books }], NOW)).toEqual([]);
    expect(findCrossArbs([{ pair: pair(ka, pb), a: ka, b: pb, bookA: book({ yesAsks: [L(0.5, 10)] }), bookB: book({ noAsks: [L(0.5, 10)] }) }], NOW)).toEqual([]);
  });

  it("includes Kalshi fees", () => {
    const kf = { ...ka, fee: { venue: "kalshi" as const, multiplier: 1 } };
    // 0.48 + 0.50 = 0.98 before fees; Kalshi fee on 100 @ 0.48 = ceil(1.7472) = 1.75 → profit 0.25.
    const [o] = findCrossArbs([{ pair: pair(kf, pb), a: kf, b: pb, bookA: book({ yesAsks: [L(0.48, 100)] }), bookB: book({ noAsks: [L(0.5, 100)] }) }], NOW);
    expect(o!.fees).toBeCloseTo(1.75, 9);
    expect(o!.profit).toBeCloseTo(0.25, 9);
  });
});

describe("second opinion", () => {
  it("flags a mid gap > 5 cents that isn't an arb, cheaper YES side only", () => {
    const bookA = book({ yesBids: [L(0.38, 10)], yesAsks: [L(0.42, 10)], noAsks: [L(0.62, 10)] });
    const bookB = book({ yesBids: [L(0.48, 10)], yesAsks: [L(0.52, 10)], noAsks: [L(0.6, 10)] });
    const opps = findSecondOpinions([{ pair: pair(ka, pb), a: ka, b: pb, bookA, bookB }], NOW);
    expect(opps).toHaveLength(1);
    const o = opps[0]!;
    expect(o.kind).toBe("second_opinion");
    expect(o.gapCents).toBe(10);
    expect(o.legs).toHaveLength(1);
    expect(o.legs[0]).toMatchObject({ venue: "kalshi", side: "yes", contracts: 1, avgPrice: 0.42 });
    expect(o.profit).toBe(0);
    expect(o.roi).toBe(0);
    expect(o.safetyNotes).toContain(SECOND_OPINION_NOTE);
  });

  it("skips small gaps and full arbs", () => {
    const small = findSecondOpinions([{ pair: pair(ka, pb), a: ka, b: pb, bookA: book({ yesBids: [L(0.4, 1)], yesAsks: [L(0.44, 1)] }), bookB: book({ yesBids: [L(0.44, 1)], yesAsks: [L(0.48, 1)] }) }], NOW);
    expect(small).toEqual([]);
    const arb = findSecondOpinions([{ pair: pair(ka, pb), a: ka, b: pb, bookA: book({ yesBids: [L(0.3, 1)], yesAsks: [L(0.32, 1)] }), bookB: book({ yesBids: [L(0.5, 1)], yesAsks: [L(0.52, 1)], noAsks: [L(0.5, 1)] }) }], NOW);
    expect(arb).toEqual([]);
  });

  it("inverted pair compares a's YES with 1 − b's YES", () => {
    const p = pair(ka, pb, { inverted: true });
    // a YES mid 0.60, b YES mid 0.30 → same outcome on b ≈ 0.70: a is cheaper by 10 cents.
    const [o] = findSecondOpinions([{ pair: p, a: ka, b: pb, bookA: book({ yesBids: [L(0.5, 1)], yesAsks: [L(0.7, 1)] }), bookB: book({ yesBids: [L(0.2, 1)], yesAsks: [L(0.4, 1)], noAsks: [L(0.72, 1)] }) }], NOW);
    expect(o!.gapCents).toBe(10);
    expect(o!.legs[0]).toMatchObject({ venue: "kalshi", side: "yes" });
    // Reverse: b's NO is the cheaper way to hold the outcome.
    const [r] = findSecondOpinions([{ pair: p, a: ka, b: pb, bookA: book({ yesBids: [L(0.66, 1)], yesAsks: [L(0.94, 1)] }), bookB: book({ yesBids: [L(0.2, 1)], yesAsks: [L(0.4, 1)], noAsks: [L(0.72, 1)] }) }], NOW);
    expect(r!.legs[0]).toMatchObject({ venue: "polymarket", side: "no", avgPrice: 0.72 });
  });
});
