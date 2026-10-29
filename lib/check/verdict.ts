/* One verdict per leg and the parlay's summary, pure. Data, never advice.
 *   Smart money with you      proven traders' money (lib/smart) leans to the slip's side: 60%+ of it
 *   Smart money against you   40% or less of it on the slip's side
 *   Split                     in between
 *   No big money yet          no proven traders, and under BIG_MIN of big bets we track
 * Without proven traders but with BIG_MIN+ of big bets, the same lines are read from all the big money, and the leg
 * says so ("based on all big bets"). Stocks: insiders buying vs. selling in the last 90 days and funds adding vs.
 * cutting, for a buyer of the stock. */

export type Verdict = "with" | "against" | "split" | "none";
export const VERDICT_TEXT: Record<Verdict, string> = { with: "Smart money with you", against: "Smart money against you", split: "Divergent", none: "No large positions yet" };
export const BIG_MIN = 10_000;
export const LEAN = 0.6;

export interface SideMoney { yes: number; no: number }

/** The verdict for a bet on `side`, from proven money (share of YES, null when not enough) and all big money. */
export function legVerdict(side: "yes" | "no" | null, proven: number | null, big: SideMoney | null): { verdict: Verdict; basis: "proven" | "big" | null; share: number | null } {
  const bigTotal = big ? big.yes + big.no : 0;
  const yesShare = proven ?? (bigTotal >= BIG_MIN ? big!.yes / bigTotal : null);
  const basis = proven !== null ? "proven" : yesShare !== null ? "big" : null;
  if (yesShare === null) return { verdict: "none", basis: null, share: null };
  if (side === null) return { verdict: "split", basis, share: yesShare };
  const mine = side === "yes" ? yesShare : 1 - yesShare;
  return { verdict: mine >= LEAN ? "with" : mine <= 1 - LEAN ? "against" : "split", basis, share: mine };
}

/** Stocks: who's buying. Net insider buying, or funds adding more than cutting, is with a buyer. */
export function stockVerdict(s: { insiderBuys: number; insiderSells: number; fundsAdding: number; fundsCutting: number }): Verdict {
  const ins = s.insiderBuys - s.insiderSells, funds = s.fundsAdding - s.fundsCutting;
  if (!s.insiderBuys && !s.insiderSells && !s.fundsAdding && !s.fundsCutting) return "none";
  const score = Math.sign(ins) + Math.sign(funds);
  return score > 0 ? "with" : score < 0 ? "against" : "split";
}

/** "2 of 3 legs have smart money against you" / "Smart money is with you on every leg" / "No big money on any leg yet". */
export function parlaySummary(verdicts: readonly Verdict[]): string {
  const n = verdicts.length;
  if (!n) return "Nothing to check on this slip.";
  const c = (v: Verdict) => verdicts.filter(x => x === v).length;
  const legs = (k: number) => `${k} of ${n} ${n === 1 ? "leg" : "legs"}`;
  if (n === 1) return verdicts[0] === "none" ? "No large positions on this market yet." : `${VERDICT_TEXT[verdicts[0]!]}.`;
  if (c("none") === n) return "No large positions on any leg yet.";
  if (c("with") === n) return "Smart money is with you on every leg.";
  if (c("against") === n) return "Smart money is against you on every leg.";
  const has = (k: number) => (k === 1 ? "has" : "have");
  if (c("against")) return `${legs(c("against"))} ${has(c("against"))} smart money against you.`;
  if (c("with")) return `${legs(c("with"))} ${has(c("with"))} smart money with you.`;
  return `${legs(c("split"))} ${c("split") === 1 ? "is" : "are"} split.`;
}
