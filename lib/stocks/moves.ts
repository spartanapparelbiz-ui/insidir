/* SEC filings as moves in the one moves table (docs/INSIDIR-V2.md, Stocks): an insider's open-market buy (Form 4)
 * and a big fund's quarterly add (13F versus its previous 13F). Pure. */
import type { Move } from "@/lib/moves/types";
import type { InsiderBuy } from "./form4";
import type { FundAdd, ThirteenF } from "./form13f";

/** Form 4: the filing's open-market buys as one move, at the time the filing reached EDGAR. */
export function insiderMove(b: InsiderBuy, filedAt: number, lines: number, url: string): Move {
  return {
    id: `f4:${b.accession}`, source: "sec", marketId: `sec:${b.issuerCik}`, eventTitle: b.company, marketTitle: b.ticker ?? b.company,
    outcome: "Bought", outcomeSide: "yes", amount: b.amount, avgPrice: b.avgPrice, wallet: null, walletName: null,
    at: filedAt, lastAt: filedAt, fills: lines, tab: "stocks", league: null, category: "insider", url, result: null, settledAt: null,
    detail: { kind: "insider", company: b.company, ticker: b.ticker, issuerCik: b.issuerCik, role: b.role, ownerName: b.ownerName, ownerCik: b.ownerCik,
      shares: b.shares, pricePerShare: b.avgPrice, tradeDate: b.lastDate, filedAt, accession: b.accession },
  };
}

/** 13F: one fund's add in one company this quarter, dated when the filing was accepted (or its filing day). */
export function fundMove(a: FundAdd, fund: string, fundCik: string, cur: ThirteenF, prev: ThirteenF, url: string): Move {
  const at = cur.acceptedAt ?? Date.parse(`${cur.filedAt}T21:00:00Z`);
  return {
    id: `13f:${cur.accession}:${a.cusip}`, source: "sec", marketId: `cusip:${a.cusip}`, eventTitle: a.company, marketTitle: a.company,
    outcome: "Added", outcomeSide: "yes", amount: a.added, avgPrice: Math.round(a.pricePerShare * 10_000) / 10_000, wallet: null, walletName: null,
    at, lastAt: at, fills: 1, tab: "stocks", league: null, category: "fund", url, result: null, settledAt: null,
    detail: { kind: "fund", company: a.company, cusip: a.cusip, fund, fundCik, period: cur.period, filedOn: cur.filedAt, addedShares: a.addedShares,
      prevShares: a.prevShares, curShares: a.curShares, curValue: a.curValue, newPosition: a.newPosition, accession: cur.accession, prevAccession: prev.accession },
  };
}
