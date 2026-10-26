/* One scan: which markets need order books, and every engine run over them. Pure (the worker fetches and stores;
 * scripts/scan.ts prints). Engines: cross-venue locks and second opinions over matched pairs, multi-outcome sets,
 * threshold ladders, and the curated implication rules (config/implications.ts). */
import { findNearMisses, type NearMiss } from "./engines/near-miss";
import { findCrossArbs, type ArbInput } from "./engines/arb";
import { marketKey } from "./engines/common";
import { findImplications, findRuleImplications } from "./engines/implication";
import { findLadderImplications, findLadders } from "./engines/ladder";
import { findMultiOutcome, type MultiInput } from "./engines/multi";
import { findSecondOpinions } from "./engines/second-opinion";
import type { Book, MarketPair, Opportunity, VEvent, VMarket, Venue } from "./types";

/** Events with more outcomes than this are skipped for multi-outcome sets (too many books per scan). */
export const MULTI_MAX_OUTCOMES = 40;

export interface Universe {
  markets: readonly VMarket[];
  events: readonly VEvent[];
  pairs: readonly MarketPair[];
}

export interface ScanCounts { crossArb: number; secondOpinion: number; multi: number; ladder: number; implication: number }

const byKey = (markets: readonly VMarket[]): Map<string, VMarket> => new Map(markets.map(m => [marketKey(m.venue, m.id), m]));

const multiEvents = (u: Universe, idx: Map<string, VMarket>): Array<{ event: VEvent; markets: VMarket[] }> =>
  u.events.filter(e => e.mutuallyExclusive && e.marketIds.length >= 2 && e.marketIds.length <= MULTI_MAX_OUTCOMES).map(event => ({
    event, markets: event.marketIds.map(id => idx.get(marketKey(event.venue, id))).filter((m): m is VMarket => Boolean(m)),
  })).filter(x => x.markets.length === x.event.marketIds.length);

/** Every market whose book a scan needs, grouped by venue. */
export function marketsToBook(u: Universe): Map<Venue, VMarket[]> {
  const idx = byKey(u.markets);
  const need = new Map<string, VMarket>();
  const add = (m: VMarket | undefined) => { if (m?.active) need.set(marketKey(m.venue, m.id), m); };
  for (const p of u.pairs) if (!p.blocked) { add(idx.get(marketKey(p.a.venue, p.a.id))); add(idx.get(marketKey(p.b.venue, p.b.id))); }
  for (const { markets } of multiEvents(u, idx)) markets.forEach(add);
  for (const imp of [...findLadderImplications(u.markets), ...findRuleImplications(u.markets)]) { add(imp.antecedent); add(imp.consequent); }
  const out = new Map<Venue, VMarket[]>();
  for (const m of need.values()) {
    const list = out.get(m.venue);
    if (list) list.push(m); else out.set(m.venue, [m]);
  }
  return out;
}

/** Runs every engine. `books` is keyed by marketKey(venue, id). */
export function scan(u: Universe, books: ReadonlyMap<string, Book>, now: number): { opps: Opportunity[]; counts: ScanCounts; nearMisses: NearMiss[] } {
  const idx = byKey(u.markets);
  const arbInputs: ArbInput[] = [];
  for (const pair of u.pairs) {
    if (pair.blocked) continue;
    const a = idx.get(marketKey(pair.a.venue, pair.a.id)), b = idx.get(marketKey(pair.b.venue, pair.b.id));
    const bookA = a && books.get(marketKey(a.venue, a.id)), bookB = b && books.get(marketKey(b.venue, b.id));
    if (a && b && bookA && bookB) arbInputs.push({ pair, a, b, bookA, bookB });
  }
  const multiInputs: MultiInput[] = multiEvents(u, idx).map(x => ({ ...x, books }));
  const crossArb = findCrossArbs(arbInputs, now);
  const secondOpinion = findSecondOpinions(arbInputs, now);
  const multi = findMultiOutcome(multiInputs, now);
  const ladder = findLadders(u.markets, books, now);
  const implication = findImplications(u.markets, books, now);
  // One opportunity per id (a ladder rung could also match a rule): keep the most profitable.
  const best = new Map<string, Opportunity>();
  for (const o of [...crossArb, ...multi, ...ladder, ...implication, ...secondOpinion]) {
    const prev = best.get(o.id);
    if (!prev || o.profit > prev.profit) best.set(o.id, o);
  }
  return {
    opps: [...best.values()].sort((a, b) => b.profitPerDay - a.profitPerDay),
    nearMisses: findNearMisses(arbInputs),
    counts: { crossArb: crossArb.length, secondOpinion: secondOpinion.length, multi: multi.length, ladder: ladder.length, implication: implication.length },
  };
}
