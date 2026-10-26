/* "Too good to be true" guard. A deal is quarantined (hidden from users, never alerted, kept out of the public log,
 * logged by the worker and listed on /admin for review) when:
 *   - its return is above QUARANTINE_MAX_ROI (15%), or
 *   - at QUARANTINE_AMOUNT ($500) the calculator says you keep more than QUARANTINE_MAX_KEEP ($50), or
 *   - it comes from a matched pair whose rules texts differ in date, threshold or source, or where a tie is its own
 *     outcome on one venue while the pair treats one team's YES as the other's NO.
 * Real locks between two venues are rarely more than a few percent; anything bigger is far more likely a matching
 * or parsing mistake than free money. Pure. */
import { calculate } from "./calculator";
import { pct } from "./format";
import type { FeeModel, MarketPair, Opportunity, RuleMismatch, Venue } from "./types";

export const QUARANTINE_MAX_ROI = 0.15;
export const QUARANTINE_AMOUNT = 500;
export const QUARANTINE_MAX_KEEP = 50;

const MISMATCH_WORD: Readonly<Record<RuleMismatch, string>> = { date: "date", threshold: "threshold", source: "resolution source", tie: "how a tie settles" };

export interface QuarantineContext {
  /** The matched pair behind a cross-venue deal. */
  pair?: MarketPair | undefined;
  /** Each leg market's fee model, for the $500 calculation. */
  fee: (venue: Venue, marketId: string) => FeeModel | undefined;
}

/** What "You keep" shows at $500: the calculator's profit for that amount. */
export function keepAt(o: Opportunity, amount: number, fee: QuarantineContext["fee"]): number | null {
  if (o.sets <= 0) return null;
  const legs = o.legs.map(l => ({ label: l.label, venue: l.venue, side: l.side, avgPrice: l.avgPrice, fee: fee(l.venue, l.marketId) }));
  if (legs.some(l => !l.fee)) return null;
  const r = calculate({ legs: legs.map(l => ({ ...l, fee: l.fee! })), payoutPerSet: o.payout / o.sets, maxSets: o.sets }, amount);
  return r.reason === "ok" ? r.profit : null;
}

/** Why a deal must be held back; empty when it may be shown. */
export function quarantineReasons(o: Opportunity, ctx: QuarantineContext): string[] {
  const out: string[] = [];
  // A second opinion is a price gap, not a lock: it has no return or payout to check.
  if (o.kind !== "second_opinion") {
    if (o.roi > QUARANTINE_MAX_ROI) out.push(`Return ${pct(o.roi)} is above ${pct(QUARANTINE_MAX_ROI, 0)}`);
    const keep = keepAt(o, QUARANTINE_AMOUNT, ctx.fee);
    if (keep !== null && keep > QUARANTINE_MAX_KEEP) out.push(`You keep $${keep.toFixed(2)} at $${QUARANTINE_AMOUNT}, above $${QUARANTINE_MAX_KEEP}`);
  }
  const mismatch = ctx.pair?.ruleMismatch ?? [];
  if (o.pairId && mismatch.length) out.push(`The two markets' rules differ in ${mismatch.map(m => MISMATCH_WORD[m]).join(", ")}`);
  return out;
}
