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

/** Every implication pair among the ladder rungs. */
export function findLadderImplications(markets: readonly VMarket[]): Implication[] {
  const groups = new Map<string, VMarket[]>();
  for (const m of markets) {
    const s = m.strike;
    if (!s || (s.kind !== "above" && s.kind !== "below") || !Number.isFinite(s.value) || m.closeTime == null) continue;
    const key = `${m.venue}|${s.subject.trim().toLowerCase()}|${s.kind}`;
    const g = groups.get(key);
    if (g) g.push(m);
    else groups.set(key, [m]);
  }
  const out: Implication[] = [];
  for (const group of groups.values()) {
    for (const x of group) {
      for (const y of group) {
        if (x === y || x.id === y.id) continue;
        const sx = x.strike;
        const sy = y.strike;
        if (!sx || !sy || x.closeTime == null || y.closeTime == null) continue;
        if (Math.abs(x.closeTime - y.closeTime) > LADDER_CLOSE_TOLERANCE_MS) continue;
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
