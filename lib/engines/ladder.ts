/* Threshold ladders inside one venue. Pure.
 *
 * Markets with a `strike` on the same venue, subject and strike kind, closing at the same time (within
 * LADDER_CLOSE_TOLERANCE_MS), are rungs of one ladder:
 *   "above": above(hi) implies above(lo)    (antecedent hi, consequent lo)
 *   "below": below(lo) implies below(hi)    (antecedent lo, consequent hi)
 * If A implies B, YES on B + NO on A pays at least $1 in every outcome; emitted when profitable.
 * "between" strikes are not laddered. Rungs from different events are allowed but marked yellow, since they may
 * use different price sources. findLadderImplications is exported so the UI can show monotonic violations
 * (see implicationViolations in ./common). */

import type { Book, Opportunity, VMarket } from "../types";
import type { FillOptions } from "./book";
import { lockImplication, type Implication } from "./common";

/** Two rungs count as the same close if within this many ms of each other: one hour. */
export const LADDER_CLOSE_TOLERANCE_MS = 60 * 60 * 1000;

const fmt = (v: number): string => v.toLocaleString("en-US", { maximumFractionDigits: 6 });

/** Each rung is paired with this many nearest rungs (by strike) on each side. Pairing every rung with every other one
 *  is quadratic: on the live venues one ladder group holds thousands of rungs and produced 5.4 million pairs, which
 *  ran the worker out of memory. A lock between two distant rungs usually shows up between nearer ones too; one that
 *  doesn't is missed, never invented. */
export const LADDER_NEIGHBORS = 3;

/** Implication pairs among ladder rungs: same venue, subject, strike kind and close hour, nearest rungs only. */
export function findLadderImplications(markets: readonly VMarket[]): Implication[] {
  const groups = new Map<string, VMarket[]>();
  for (const m of markets) {
    const s = m.strike;
    if (!s || (s.kind !== "above" && s.kind !== "below") || !Number.isFinite(s.value) || m.closeTime == null) continue;
    const key = `${m.venue}|${s.subject.trim().toLowerCase()}|${s.kind}|${Math.round(m.closeTime / LADDER_CLOSE_TOLERANCE_MS)}`;
    const g = groups.get(key);
    if (g) g.push(m);
    else groups.set(key, [m]);
  }
  const out: Implication[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => a.strike!.value - b.strike!.value);
    for (let i = 0; i < group.length; i++) {
      for (let j = Math.max(0, i - LADDER_NEIGHBORS); j <= Math.min(group.length - 1, i + LADDER_NEIGHBORS); j++) {
        const x = group[i]!, y = group[j]!;
        if (i === j || x.id === y.id) continue;
        const sx = x.strike!, sy = y.strike!;
        if (Math.abs(x.closeTime! - y.closeTime!) > LADDER_CLOSE_TOLERANCE_MS) continue;
        // x is the antecedent, y the consequent.
        const implies = sx.kind === "above" ? sx.value > sy.value : sx.value < sy.value;
        if (!implies) continue;
        const sameEvent = x.eventId === y.eventId;
        out.push({
          antecedent: x,
          consequent: y,
          reason: `${sx.kind === "above" ? "Above" : "Below"} ${fmt(sx.value)} implies ${sx.kind} ${fmt(sy.value)}.`,
          ruleId: null,
          safety: sameEvent ? "green" : "yellow",
          safetyNotes: sameEvent ? [] : ["These rungs are in different events; check they settle on the same price source and time."],
        });
      }
    }
  }
  return out;
}

export function findLadders(markets: readonly VMarket[], books: ReadonlyMap<string, Book>, now: number, opts?: FillOptions): Opportunity[] {
  const out: Opportunity[] = [];
  for (const imp of findLadderImplications(markets)) {
    const opp = lockImplication(imp, books, "ladder", now, opts);
    if (opp) out.push(opp);
  }
  return out;
}
