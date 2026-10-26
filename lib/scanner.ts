/* One scan: which markets need order books, and every engine run over them. Pure (the worker fetches and stores;
 * scripts/scan.ts prints). Engines: cross-venue locks and second opinions over matched pairs, multi-outcome sets,
 * threshold ladders, and the curated implication rules (config/implications.ts). */
import { findCrossArbs, type ArbInput } from "./engines/arb";
import { marketKey } from "./engines/common";
import { findImplications, findRuleImplications } from "./engines/implication";
import { findLadderImplications, findLadders } from "./engines/ladder";
import { findMultiOutcome, type MultiInput } from "./engines/multi";
import { findSecondOpinions } from "./engines/second-opinion";
import { laddersEnabled } from "./flags";
import type { Book, MarketPair, Opportunity, VEvent, VMarket, Venue } from "./types";

/** What a scan looks at. Ladders are off unless LADDERS_ENABLED=1: their subject matching produced false
 *  implications (headline vs core CPI, one race against another), and none reach users until it is rebuilt and
 *  hand-checked. Beyond matched pairs, books are fetched only for markets that trade (24h volume ≥ minVolume24h,
 *  contracts on Kalshi, dollars on Polymarket) and close within maxDays: a few thousand books, not 180K. */
export interface ScanOptions { ladders: boolean; minVolume24h: number; maxDays: number }
export const DEFAULT_SCAN_OPTIONS: ScanOptions = { ladders: false, minVolume24h: 1000, maxDays: 30 };

export function scanOptionsFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): ScanOptions {
  const num = (k: string, d: number) => { const v = Number(env[k]); return env[k]?.trim() && Number.isFinite(v) && v >= 0 ? v : d; };
  return {
    ladders: laddersEnabled(env),
    minVolume24h: num("BOOK_MIN_VOLUME_24H", DEFAULT_SCAN_OPTIONS.minVolume24h),
    maxDays: num("BOOK_MAX_DAYS", DEFAULT_SCAN_OPTIONS.maxDays),
  };
}

const DAY_MS = 86_400_000;
const closesSoon = (closeTime: number | null, now: number, o: ScanOptions): boolean => closeTime !== null && closeTime > now && closeTime - now <= o.maxDays * DAY_MS;
/** A market that trades and closes within the window. */
export const liquid = (m: VMarket, now: number, o: ScanOptions): boolean => (m.volume24h ?? 0) >= o.minVolume24h && closesSoon(m.closeTime, now, o);

/** Events with more outcomes than this are skipped for multi-outcome sets (too many books per scan). */
export const MULTI_MAX_OUTCOMES = 40;

export interface Universe {
  markets: readonly VMarket[];
  events: readonly VEvent[];
  pairs: readonly MarketPair[];
}

export interface ScanCounts { crossArb: number; secondOpinion: number; multi: number; ladder: number; implication: number }

const byKey = (markets: readonly VMarket[]): Map<string, VMarket> => new Map(markets.map(m => [marketKey(m.venue, m.id), m]));

/** Mutually exclusive events whose every outcome is known, that close within the window and trade (the outcomes'
 *  24h volume together ≥ minVolume24h). */
const multiEvents = (u: Universe, idx: Map<string, VMarket>, now: number, o: ScanOptions): Array<{ event: VEvent; markets: VMarket[] }> =>
  u.events.filter(e => e.mutuallyExclusive && e.marketIds.length >= 2 && e.marketIds.length <= MULTI_MAX_OUTCOMES).map(event => ({
    event, markets: event.marketIds.map(id => idx.get(marketKey(event.venue, id))).filter((m): m is VMarket => Boolean(m)),
  })).filter(x => {
    if (x.markets.length !== x.event.marketIds.length) return false;
    const close = x.event.closeTime ?? Math.max(...x.markets.map(m => m.closeTime ?? Infinity));
    return closesSoon(Number.isFinite(close) ? close : null, now, o) && x.markets.reduce((a, m) => a + (m.volume24h ?? 0), 0) >= o.minVolume24h;
  });

/** Single-venue implication pairs (curated rules, plus ladders when enabled) among liquid markets. */
const singleVenueImplications = (u: Universe, now: number, o: ScanOptions) => {
  const pool = u.markets.filter(m => liquid(m, now, o));
  return [...(o.ladders ? findLadderImplications(pool) : []), ...findRuleImplications(pool)];
};

/** Every market whose book a scan needs, grouped by venue. */
export function marketsToBook(u: Universe, now: number, o: ScanOptions = DEFAULT_SCAN_OPTIONS): Map<Venue, VMarket[]> {
  const idx = byKey(u.markets);
  const need = new Map<string, VMarket>();
  const add = (m: VMarket | undefined) => { if (m?.active) need.set(marketKey(m.venue, m.id), m); };
  for (const p of u.pairs) if (!p.blocked) { add(idx.get(marketKey(p.a.venue, p.a.id))); add(idx.get(marketKey(p.b.venue, p.b.id))); }
  for (const { markets } of multiEvents(u, idx, now, o)) markets.forEach(add);
  for (const imp of singleVenueImplications(u, now, o)) { add(imp.antecedent); add(imp.consequent); }
  const out = new Map<Venue, VMarket[]>();
  for (const m of need.values()) {
    const list = out.get(m.venue);
    if (list) list.push(m); else out.set(m.venue, [m]);
  }
  return out;
}

/** Runs every engine. `books` is keyed by marketKey(venue, id). */
export function scan(u: Universe, books: ReadonlyMap<string, Book>, now: number, o: ScanOptions = DEFAULT_SCAN_OPTIONS): { opps: Opportunity[]; counts: ScanCounts } {
  const idx = byKey(u.markets);
  const arbInputs: ArbInput[] = [];
  for (const pair of u.pairs) {
    if (pair.blocked) continue;
    const a = idx.get(marketKey(pair.a.venue, pair.a.id)), b = idx.get(marketKey(pair.b.venue, pair.b.id));
    const bookA = a && books.get(marketKey(a.venue, a.id)), bookB = b && books.get(marketKey(b.venue, b.id));
    if (a && b && bookA && bookB) arbInputs.push({ pair, a, b, bookA, bookB });
  }
  const multiInputs: MultiInput[] = multiEvents(u, idx, now, o).map(x => ({ ...x, books }));
  const pool = u.markets.filter(m => liquid(m, now, o));
  const crossArb = findCrossArbs(arbInputs, now);
  const secondOpinion = findSecondOpinions(arbInputs, now);
  const multi = findMultiOutcome(multiInputs, now);
  const ladder = o.ladders ? findLadders(pool, books, now) : [];
  const implication = findImplications(pool, books, now);
  // One opportunity per id (a ladder rung could also match a rule): keep the most profitable.
  const best = new Map<string, Opportunity>();
  for (const o of [...crossArb, ...multi, ...ladder, ...implication, ...secondOpinion]) {
    const prev = best.get(o.id);
    if (!prev || o.profit > prev.profit) best.set(o.id, o);
  }
  return {
    opps: [...best.values()].sort((a, b) => b.profitPerDay - a.profitPerDay),
    counts: { crossArb: crossArb.length, secondOpinion: secondOpinion.length, multi: multi.length, ladder: ladder.length, implication: implication.length },
  };
}
