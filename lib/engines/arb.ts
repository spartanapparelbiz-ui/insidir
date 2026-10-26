/* Cross-exchange arbitrage on a matched pair (lib/matching). Pure.
 *
 * Normal pair (YES on a = YES on b): the locks are YES a + NO b and NO a + YES b.
 * Inverted pair (YES on a = NO on b, e.g. "Team A wins" vs "Team B wins"): the locks are YES a + YES b and
 * NO a + NO b. Each lock pays $1 per set if the two markets settle the same way. Both directions are tried and
 * every profitable one is emitted. Blocked pairs, inactive markets and pairs whose ids don't match are skipped.
 * Safety comes from the pair. */

import type { Book, MarketPair, Opportunity, Side, VMarket } from "../types";
import type { FillOptions } from "./book";
import { lockOpportunity, venueSideLabel, type LegSpec } from "./common";

export interface ArbInput {
  pair: MarketPair;
  a: VMarket;
  b: VMarket;
  bookA: Book;
  bookB: Book;
}

/** The two side combinations that lock $1 per set for a pair. */
export function arbDirections(inverted: boolean): Array<[Side, Side]> {
  return inverted
    ? [["yes", "yes"], ["no", "no"]]
    : [["yes", "no"], ["no", "yes"]];
}

/** True when the input is usable: not blocked, ids line up, both markets active. */
export function arbInputUsable(input: ArbInput): boolean {
  const { pair, a, b } = input;
  if (pair.blocked) return false;
  if (pair.a.venue !== a.venue || pair.a.id !== a.id || pair.b.venue !== b.venue || pair.b.id !== b.id) return false;
  return a.active && b.active;
}

export function findCrossArbs(inputs: readonly ArbInput[], now: number, opts?: FillOptions): Opportunity[] {
  const out: Opportunity[] = [];
  for (const input of inputs) {
    if (!arbInputUsable(input)) continue;
    const { pair, a, b, bookA, bookB } = input;
    for (const [sideA, sideB] of arbDirections(pair.inverted)) {
      const specs: LegSpec[] = [
        { market: a, side: sideA, label: venueSideLabel(a, sideA) },
        { market: b, side: sideB, label: venueSideLabel(b, sideB) },
      ];
      const opp = lockOpportunity(
        specs,
        [bookA, bookB],
        1,
        { kind: "cross_arb", title: a.eventTitle ?? a.title, safety: pair.safety, safetyNotes: [...pair.safetyNotes], pairId: pair.id, gapCents: null },
        now,
        opts,
      );
      if (opp) out.push(opp);
    }
  }
  return out;
}
