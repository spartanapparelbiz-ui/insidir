/* Multi-outcome sets inside one venue event. Pure.
 *
 * All-YES: buy YES on every outcome. Pays $1 per set ONLY when the event is exhaustive (exactly one outcome
 *          resolves YES). Mutually exclusive but not exhaustive is not enough: nothing might win.
 * All-NO:  buy NO on every one of N outcomes. When at most one resolves YES (mutually exclusive), at least N − 1
 *          NOs pay, so the payout per set is N − 1 (exactly N − 1 when exhaustive).
 * Every market listed in the event must be present, active and have a book: a missing leg breaks the lock. */

import type { Book, Opportunity, Side, VEvent, VMarket } from "../types";
import type { FillOptions } from "./book";
import { lockOpportunity, marketKey, outcomeSideLabel, type LegSpec } from "./common";

/** Fewest outcomes for a multi-outcome set. */
export const MULTI_MIN_OUTCOMES = 2;

export interface MultiInput {
  event: VEvent;
  markets: VMarket[];
  /** Keyed by marketKey(venue, id). */
  books: ReadonlyMap<string, Book>;
}

function legsFor(event: VEvent, markets: readonly VMarket[], books: ReadonlyMap<string, Book>): { markets: VMarket[]; books: Book[] } | null {
  if (event.marketIds.length < MULTI_MIN_OUTCOMES) return null;
  const byId = new Map(markets.filter((m) => m.venue === event.venue).map((m) => [m.id, m]));
  const ms: VMarket[] = [];
  const bs: Book[] = [];
  for (const id of new Set(event.marketIds)) {
    const m = byId.get(id);
    if (!m || !m.active) return null;
    const book = books.get(marketKey(m.venue, m.id));
    if (!book) return null;
    ms.push(m);
    bs.push(book);
  }
  return ms.length >= MULTI_MIN_OUTCOMES ? { markets: ms, books: bs } : null;
}

export function findMultiOutcome(inputs: readonly MultiInput[], now: number, opts?: FillOptions): Opportunity[] {
  const out: Opportunity[] = [];
  for (const { event, markets, books } of inputs) {
    if (!event.mutuallyExclusive) continue;
    const legs = legsFor(event, markets, books);
    if (!legs) continue;
    const n = legs.markets.length;
    const run = (side: Side, payout: number, kind: "multi_yes" | "multi_no", notes: string[]): void => {
      const specs: LegSpec[] = legs.markets.map((m) => ({ market: m, side, label: outcomeSideLabel(m, side) }));
      const opp = lockOpportunity(specs, legs.books, payout, { kind, title: event.title, safety: "green", safetyNotes: notes, pairId: null, gapCents: null }, now, opts);
      if (opp) out.push(opp);
    };
    if (event.exhaustive) run("yes", 1, "multi_yes", []);
    run("no", n - 1, "multi_no", event.exhaustive ? [] : ["The listed outcomes may not cover every result; if none of them happens, every NO pays and the payout is higher."]);
  }
  return out;
}
