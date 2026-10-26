/* Insider and fund profile numbers (docs/INSIDIR-V2.md §6), pure, from stored SEC filings.
 *   Insider: every open-market buy and sale on their Form 4s, totals bought and sold, and the price paid on each buy.
 *            (Price changes after a buy are not shown: no free daily price source we found is licensed for display.)
 *   Fund:    the top 10 holdings of its latest complete 13F-HR, and per quarter its biggest adds and cuts versus the
 *            quarter before (shares changed × this quarter's reported value per share; a position sold out entirely is
 *            valued at last quarter's value per share). */

export interface TradeLike { accession: string; code: "P" | "S"; shares: number; price: number; value: number; tradeDate: string | null; filedAt: Date | number; company: string; ticker: string | null; url: string }

export interface InsiderTotals { bought: number; sold: number; buys: number; sales: number }

export function insiderTotals(trades: readonly TradeLike[]): InsiderTotals {
  const t = { bought: 0, sold: 0, buys: 0, sales: 0 };
  const buyFilings = new Set<string>(), saleFilings = new Set<string>();
  for (const x of trades) {
    if (x.code === "P") { t.bought += x.value; buyFilings.add(x.accession); } else { t.sold += x.value; saleFilings.add(x.accession); }
  }
  return { bought: Math.round(t.bought * 100) / 100, sold: Math.round(t.sold * 100) / 100, buys: buyFilings.size, sales: saleFilings.size };
}

/** One row per filing and side: lines of the same filing and code summed (shares, value; price = value ÷ shares). */
export function tradesByFiling<T extends TradeLike>(trades: readonly T[]): Array<T & { lines: number }> {
  const m = new Map<string, T & { lines: number }>();
  for (const x of trades) {
    const k = `${x.accession}:${x.code}`;
    const cur = m.get(k);
    if (!cur) { m.set(k, { ...x, lines: 1 }); continue; }
    cur.shares += x.shares; cur.value = Math.round((cur.value + x.value) * 100) / 100; cur.lines++;
    cur.price = Math.round((cur.value / cur.shares) * 10_000) / 10_000;
    if (x.tradeDate && (!cur.tradeDate || x.tradeDate > cur.tradeDate)) cur.tradeDate = x.tradeDate;
  }
  return [...m.values()];
}

export interface HoldingLike { cusip: string; company: string; shares: number; value: number }

export function topHoldings<T extends HoldingLike>(holdings: readonly T[], n = 10): Array<T & { share: number }> {
  const total = holdings.reduce((s, h) => s + h.value, 0);
  return [...holdings].sort((a, b) => b.value - a.value).slice(0, n).map(h => ({ ...h, share: total > 0 ? h.value / total : 0 }));
}

export interface Change { cusip: string; company: string; shares: number; value: number; kind: "new" | "added" | "cut" | "sold" }

/** Biggest adds and cuts between two quarters, by dollars, `n` of each. */
export function quarterChanges(prev: readonly HoldingLike[], cur: readonly HoldingLike[], n = 5): { adds: Change[]; cuts: Change[] } {
  const before = new Map(prev.map(h => [h.cusip, h]));
  const now = new Map(cur.map(h => [h.cusip, h]));
  const adds: Change[] = [], cuts: Change[] = [];
  for (const h of cur) {
    const p = before.get(h.cusip);
    const d = h.shares - (p?.shares ?? 0);
    if (d === 0 || h.shares <= 0) continue;
    const value = Math.round(Math.abs(d) * (h.value / h.shares));
    (d > 0 ? adds : cuts).push({ cusip: h.cusip, company: h.company, shares: Math.abs(d), value, kind: d > 0 ? (p ? "added" : "new") : "cut" });
  }
  for (const p of prev) {
    if (now.has(p.cusip) || p.shares <= 0) continue;
    cuts.push({ cusip: p.cusip, company: p.company, shares: p.shares, value: Math.round(p.value), kind: "sold" });
  }
  const by = (a: Change, b: Change) => b.value - a.value;
  return { adds: adds.sort(by).slice(0, n), cuts: cuts.sort(by).slice(0, n) };
}
