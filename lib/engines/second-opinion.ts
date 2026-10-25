/* Second opinion: a matched pair whose YES mid prices (mid of best bid and ask, from the books) differ by more
 * than SECOND_OPINION_MIN_GAP_CENTS but which is not a full arb. Pure. Not a lock: the single leg is the cheaper
 * side of the same outcome (for an inverted pair, the cheaper side may be NO on b). Profit and ROI are 0. */

import type { Opportunity, Side, VMarket } from "../types";
import { takerFee } from "../fees";
import { arbInputUsable, findCrossArbs, type ArbInput } from "./arb";
import { asksFor, bestAsk, daysUntil, lastClose, stableId, venueSideLabel, worseSafety, yesMid } from "./common";

/** Smallest mid-price gap, in cents, worth showing. */
export const SECOND_OPINION_MIN_GAP_CENTS = 5;
export const SECOND_OPINION_NOTE = "Not risk-free: this is a price gap, not a lock.";

export function findSecondOpinions(inputs: readonly ArbInput[], now: number, minGapCents: number = SECOND_OPINION_MIN_GAP_CENTS): Opportunity[] {
  const out: Opportunity[] = [];
  for (const input of inputs) {
    if (!arbInputUsable(input)) continue;
    if (findCrossArbs([input], now).length > 0) continue;
    const { pair, a, b, bookA, bookB } = input;
    const midA = yesMid(bookA);
    const midBRaw = yesMid(bookB);
    if (midA == null || midBRaw == null) continue;
    // b's price for the same outcome as YES on a.
    const midB = pair.inverted ? 1 - midBRaw : midBRaw;
    const gapCents = Math.round(Math.abs(midA - midB) * 1000) / 10;
    if (!(gapCents > minGapCents)) continue;
    let market: VMarket;
    let side: Side;
    if (midA <= midB) { market = a; side = "yes"; }
    else { market = b; side = pair.inverted ? "no" : "yes"; }
    const book = market === a ? bookA : bookB;
    const price = bestAsk(asksFor(book, side));
    if (price == null) continue;
    const fee = takerFee(market.fee, 1, price);
    const legs = [{
      venue: market.venue, marketId: market.id, side, label: venueSideLabel(market, side), url: market.url,
      contracts: 1, avgPrice: price, worstPrice: price, cost: price, fee,
    }];
    const closeTime = lastClose([a, b]);
    const days = daysUntil(closeTime, now);
    out.push({
      id: stableId("second_opinion", legs),
      kind: "second_opinion",
      title: a.eventTitle ?? a.title,
      legs,
      sets: 1,
      cost: price,
      fees: fee,
      payout: 0,
      profit: 0,
      roi: 0,
      days,
      profitPerDay: 0,
      safety: worseSafety(pair.safety, "yellow"),
      safetyNotes: [SECOND_OPINION_NOTE, ...pair.safetyNotes],
      categories: [...new Set([a.category, b.category].filter((c) => c !== ""))],
      closeTime,
      pairId: pair.id,
      gapCents,
    });
  }
  return out;
}
