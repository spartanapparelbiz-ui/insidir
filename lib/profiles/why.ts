/* "Why this matters": at most one line under a move card, built from data rules, never AI (docs/INSIDIR-V2.md §4).
 * The first rule that applies wins; nothing shows when none does. Facts only, never advice.
 *   Prediction markets, in order:
 *     1. "Biggest bet on this game today."            bigger than every other big move in the market so far today (ET);
 *                                                      only on today's moves, and only when there was another one
 *     2. "Biggest bet this trader has ever made."      more than the wallet ever put into one market before (closed and
 *                                                      open positions, and its earlier moves); members, 20+ resolved
 *     3. "3 top traders are on the same side."         distinct top-trader wallets on this market and side in the 24
 *                                                      hours up to the move (this one included), at least 2; members
 *     4. "This price moved from paying $182 to $161 on $100 in the last hour."
 *                                                      the earliest big move on this side in the hour before, when the
 *                                                      price moved at least PRICE_MOVE_MIN
 *   Insider buys (Form 4):
 *     5. "First buy by Jen Hsun Huang in 4 years."     their previous open-market buy (any company), at least 2 years
 *                                                      earlier, inside a fully read EDGAR history
 *     6. "3 Nvidia insiders bought this month."        distinct insiders with open-market buys at the company with trade
 *                                                      dates this month (moves from this month only)
 *     7. "Biggest insider buy at Nvidia since 2019."   the last filing at the company with buys of at least this much, or
 *                                                      the start of the fully read history when there is none
 *   Fund adds (13F):
 *     8. "New position: they didn't own it last quarter."
 *     9. "They doubled their stake."                   shares at least twice last quarter's */
import { personName } from "./name";
import type { Move } from "@/lib/moves/types";

export const PRICE_MOVE_MIN = 0.1;
export const FIRST_BUY_MIN_YEARS = 2;
const YEAR_MS = 365.25 * 86_400_000;

export interface WhyFacts {
  /** Viewer may see trader records (members). */
  records: boolean;
  /** ET calendar day of the move and of now ("2026-10-26"). */
  moveDay: string;
  today: string;
  /** Other big moves in the same market on the move's ET day, at or before the viewer's clock. */
  sameMarketDay?: { others: number; max: number };
  /** The wallet has a record (20+ resolved markets). */
  traderHasRecord?: boolean;
  /** The most the wallet put into one market before this move; null when unknown. */
  traderBiggestBefore?: number | null;
  topTradersSameSide?: number;
  /** Average price of the earliest big move on the same side in the hour before; null when none. */
  priceHourAgo?: number | null;
  /** Insider: trade date of their previous open-market buy, and from when their history is complete. */
  ownerPrevBuy?: string | null;
  ownerCompleteSince?: string | null;
  insidersThisMonth?: number;
  /** Company: trade date of the last earlier filing with buys of at least this much, and from when its history is complete. */
  issuerBiggerOn?: string | null;
  issuerCompleteSince?: string | null;
}

const payout = (p: number) => Math.round(100 / p);
const year = (d: string) => Number(d.slice(0, 4));

export function whyLine(m: Pick<Move, "source" | "tab" | "amount" | "avgPrice" | "at" | "detail">, f: WhyFacts): string | null {
  const d = m.detail;
  if (m.source === "sec" && d?.kind === "fund") {
    if (d.newPosition) return "New position: they didn't own it last quarter.";
    if (d.prevShares > 0 && d.curShares >= 2 * d.prevShares) return "They doubled their stake.";
    return null;
  }
  if (m.source === "sec" && d?.kind === "insider") {
    const on = d.tradeDate ?? new Date(d.filedAt).toISOString().slice(0, 10);
    if (f.ownerPrevBuy && f.ownerCompleteSince && f.ownerCompleteSince <= f.ownerPrevBuy) {
      const years = Math.floor((Date.parse(on) - Date.parse(f.ownerPrevBuy)) / YEAR_MS);
      if (years >= FIRST_BUY_MIN_YEARS) return `First buy by ${personName(d.ownerName)} in ${years} years.`;
    }
    if ((f.insidersThisMonth ?? 0) >= 2 && on.slice(0, 7) === f.today.slice(0, 7)) return `${f.insidersThisMonth} ${d.company} insiders bought this month.`;
    if (f.issuerCompleteSince) {
      const since = f.issuerBiggerOn ? year(f.issuerBiggerOn) : year(f.issuerCompleteSince);
      if (since < year(on)) return `Largest insider purchase at ${d.company} since ${since}.`;
    }
    return null;
  }
  if (m.source === "sec") return null;
  const s = f.sameMarketDay;
  if (s && s.others > 0 && m.amount > s.max && f.moveDay === f.today) return `Largest position on this ${m.tab === "sports" ? "game" : "market"} today.`;
  if (f.records && f.traderHasRecord && f.traderBiggestBefore != null && f.traderBiggestBefore > 0 && m.amount > f.traderBiggestBefore) return "Largest position this trader has ever made.";
  if (f.records && (f.topTradersSameSide ?? 0) >= 2) return `${f.topTradersSameSide} top-ranked traders are on the same side.`;
  const p0 = f.priceHourAgo, p1 = m.avgPrice;
  if (p0 && p0 > 0 && p0 < 1 && p1 > 0 && p1 < 1 && Math.abs(p1 - p0) / p0 >= PRICE_MOVE_MIN && payout(p0) !== payout(p1)) {
    return `This price moved from paying $${payout(p0).toLocaleString("en-US")} to $${payout(p1).toLocaleString("en-US")} on $100 in the last hour.`;
  }
  return null;
}

/** "2026-10-26": the America/New_York calendar day of a time. */
export const etDay = (ms: number): string => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
