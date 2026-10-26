/* Shared helpers for the engines: stable ids, days to resolution, book reads, and building an Opportunity from a
 * Fill. Pure. */

import type { Book, Leg, Level, Opportunity, OppKind, Safety, Side, VMarket, Venue } from "../types";
import { VENUE_NAME } from "../types";
import { fillSets, type Fill, type FillOptions, type LegFill } from "./book";

export const MS_PER_DAY = 86_400_000;
/** Shortest holding period used for profit per day: one hour. */
export const MIN_DAYS = 1 / 24;
/** Days assumed when a leg's close time is unknown: long, so profit per day is never inflated. */
export const UNKNOWN_CLOSE_DAYS = 365;

/** Key for a market across venues: `${venue}:${id}`. Books and results maps are keyed by this. */
export function marketKey(venue: Venue, id: string): string {
  return `${venue}:${id}`;
}

/** FNV-1a 32-bit over a string, with a seed. */
function fnv1a(s: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Stable id from the kind and the legs' venue, market and side (order-independent). */
export function stableId(kind: OppKind, legs: ReadonlyArray<{ venue: Venue; marketId: string; side: Side }>): string {
  const key = kind + "|" + legs.map((l) => `${l.venue}:${l.marketId}:${l.side}`).sort().join("|");
  const a = fnv1a(key, 0x811c9dc5).toString(16).padStart(8, "0");
  const b = fnv1a(key, 0x01234567).toString(16).padStart(8, "0");
  return `${kind}-${a}${b}`;
}

/** The latest close time among the markets; null if any is unknown. */
export function lastClose(markets: ReadonlyArray<{ closeTime: number | null }>): number | null {
  let max = -Infinity;
  for (const m of markets) {
    if (m.closeTime == null || !Number.isFinite(m.closeTime)) return null;
    max = Math.max(max, m.closeTime);
  }
  return Number.isFinite(max) ? max : null;
}

/** Days until `closeTime`, at least MIN_DAYS; UNKNOWN_CLOSE_DAYS when unknown. */
export function daysUntil(closeTime: number | null, now: number): number {
  if (closeTime == null) return UNKNOWN_CLOSE_DAYS;
  return Math.max((closeTime - now) / MS_PER_DAY, MIN_DAYS);
}

export function asksFor(book: Book, side: Side): Level[] {
  return side === "yes" ? book.yesAsks : book.noAsks;
}

/** Best (highest) valid bid price, or null. */
export function bestBid(levels: readonly Level[]): number | null {
  let best: number | null = null;
  for (const l of levels) if (l.size > 0 && l.price > 0 && l.price < 1 && (best == null || l.price > best)) best = l.price;
  return best;
}

/** Best (lowest) valid ask price, or null. */
export function bestAsk(levels: readonly Level[]): number | null {
  let best: number | null = null;
  for (const l of levels) if (l.size > 0 && l.price > 0 && l.price < 1 && (best == null || l.price < best)) best = l.price;
  return best;
}

/** Mid of the best YES bid and ask, or null when either is missing. */
export function yesMid(book: Book): number | null {
  const bid = bestBid(book.yesBids);
  const ask = bestAsk(book.yesAsks);
  if (bid == null || ask == null) return null;
  return (bid + ask) / 2;
}

const SAFETY_RANK: Record<Safety, number> = { green: 0, yellow: 1, red: 2 };
export function worseSafety(a: Safety, b: Safety): Safety {
  return SAFETY_RANK[a] >= SAFETY_RANK[b] ? a : b;
}

function isGenericLabel(label: string, side: Side): boolean {
  const l = label.trim().toLowerCase();
  return l === "" || l === side || l === "yes" || l === "no";
}

/** "YES on Kalshi", or "YES on Kalshi (Celtics)" when the outcome has a name. */
export function venueSideLabel(m: VMarket, side: Side): string {
  const label = side === "yes" ? m.yesLabel : m.noLabel;
  const base = `${side.toUpperCase()} on ${VENUE_NAME[m.venue]}`;
  return isGenericLabel(label, side) ? base : `${base} (${label.trim()})`;
}

/** "YES: Above $100,000"; falls back to the market title when the outcome label is generic. */
export function outcomeSideLabel(m: VMarket, side: Side): string {
  const label = m.yesLabel.trim();
  const name = isGenericLabel(label, "yes") ? m.title : label;
  return `${side.toUpperCase()}: ${name}`;
}

export interface LegSpec {
  market: VMarket;
  side: Side;
  label: string;
}

export function legFromFill(spec: LegSpec, lf: LegFill): Leg {
  return {
    venue: spec.market.venue,
    marketId: spec.market.id,
    side: spec.side,
    label: spec.label,
    url: spec.market.url,
    contracts: lf.contracts,
    avgPrice: lf.avgPrice,
    worstPrice: lf.worstPrice,
    cost: lf.cost,
    fee: lf.fee,
  };
}

export interface OppMeta {
  kind: OppKind;
  title: string;
  safety: Safety;
  safetyNotes: string[];
  pairId: string | null;
  gapCents: number | null;
}

/** Build an Opportunity from leg specs and their fill. */
export function toOpportunity(specs: readonly LegSpec[], fill: Fill, meta: OppMeta, now: number): Opportunity {
  const legs = specs.map((s, i) => legFromFill(s, fill.legs[i] as LegFill));
  const closeTime = lastClose(specs.map((s) => s.market));
  const days = daysUntil(closeTime, now);
  const categories = [...new Set(specs.map((s) => s.market.category).filter((c) => c !== ""))];
  return {
    id: stableId(meta.kind, legs),
    kind: meta.kind,
    title: meta.title,
    legs,
    sets: fill.sets,
    cost: fill.cost,
    fees: fill.fees,
    payout: fill.payout,
    profit: fill.profit,
    roi: fill.roi,
    days,
    profitPerDay: fill.profit / days,
    safety: meta.safety,
    safetyNotes: meta.safetyNotes,
    categories,
    closeTime,
    pairId: meta.pairId,
    gapCents: meta.gapCents,
  };
}

/** Walk the legs' books and build the Opportunity, or null if nothing profitable fills. */
export function lockOpportunity(
  specs: readonly LegSpec[],
  books: readonly Book[],
  payoutPerSet: number,
  meta: OppMeta,
  now: number,
  opts?: FillOptions,
): Opportunity | null {
  if (specs.length !== books.length || specs.length === 0) return null;
  const fill = fillSets(
    specs.map((s, i) => ({ asks: asksFor(books[i] as Book, s.side), fee: s.market.fee })),
    payoutPerSet,
    opts,
  );
  return fill ? toOpportunity(specs, fill, meta, now) : null;
}

/** "A implies B": whenever `antecedent` resolves YES, `consequent` resolves YES. */
export interface Implication {
  antecedent: VMarket;
  consequent: VMarket;
  /** Plain-English reason ("Above $110,000 implies above $100,000"). */
  reason: string;
  ruleId: string | null;
  safety: Safety;
  safetyNotes: string[];
}

/** The implication lock: YES on the consequent + NO on the antecedent pays at least $1 in every outcome. */
export function lockImplication(
  imp: Implication,
  books: ReadonlyMap<string, Book>,
  kind: "ladder" | "implication",
  now: number,
  opts?: FillOptions,
): Opportunity | null {
  const { antecedent: a, consequent: c } = imp;
  if (!a.active || !c.active) return null;
  const bookC = books.get(marketKey(c.venue, c.id));
  const bookA = books.get(marketKey(a.venue, a.id));
  if (!bookC || !bookA) return null;
  const specs: LegSpec[] = [
    { market: c, side: "yes", label: outcomeSideLabel(c, "yes") },
    { market: a, side: "no", label: outcomeSideLabel(a, "no") },
  ];
  return lockOpportunity(
    specs,
    [bookC, bookA],
    1,
    { kind, title: a.eventTitle ?? a.title, safety: imp.safety, safetyNotes: [imp.reason, ...imp.safetyNotes], pairId: null, gapCents: null },
    now,
    opts,
  );
}

/** Monotonic violations: the antecedent's YES mid is above the consequent's, which can't be right if A implies B. */
export interface ImplicationViolation {
  implication: Implication;
  antecedentMid: number;
  consequentMid: number;
  gapCents: number;
}

export function implicationViolations(imps: readonly Implication[], books: ReadonlyMap<string, Book>): ImplicationViolation[] {
  const out: ImplicationViolation[] = [];
  for (const imp of imps) {
    const ba = books.get(marketKey(imp.antecedent.venue, imp.antecedent.id));
    const bc = books.get(marketKey(imp.consequent.venue, imp.consequent.id));
    if (!ba || !bc) continue;
    const ma = yesMid(ba);
    const mc = yesMid(bc);
    if (ma == null || mc == null || ma <= mc) continue;
    out.push({ implication: imp, antecedentMid: ma, consequentMid: mc, gapCents: Math.round((ma - mc) * 1000) / 10 });
  }
  return out.sort((x, y) => y.gapCents - x.gapCents);
}
