/* Insider and fund profile numbers (docs/INSIDIR-V2.md §6), pure, from stored SEC filings.
 *   Insider: every open-market buy and sale on their Form 4s, totals bought and sold, and the price paid on each buy.
 *            How the stock did after their buys only when we hold a recent close for it (afterBuys); otherwise not at all.
 *   Company: every insider's trades at it, and how many insiders bought this month.
 *   Public:  anyone sees the last FREE_DAYS days of filings; the full history is for members (freeWindow).
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

/** One row per filing and side (and reporting owner, with `byOwner`: a joint filing lists several): lines of the
 *  same filing and code summed (shares, value; price = value ÷ shares). */
export function tradesByFiling<T extends TradeLike & { ownerCik?: string }>(trades: readonly T[], byOwner = false): Array<T & { lines: number }> {
  const m = new Map<string, T & { lines: number }>();
  for (const x of trades) {
    const k = byOwner ? `${x.accession}:${x.ownerCik ?? ""}:${x.code}` : `${x.accession}:${x.code}`;
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

/* ---------- public pages: what's free ---------- */

/** The public SEC pages show anyone filings from the last 30 days; older ones are for members. */
export const FREE_DAYS = 30;
const DAY_MS = 86_400_000;
const ms = (d: Date | number): number => (typeof d === "number" ? d : d.getTime());

/** Splits filings into the ones anyone may see (filed in the last FREE_DAYS days) and how many older ones there are. */
export function freeWindow<T extends { filedAt: Date | number }>(list: readonly T[], now: number): { shown: T[]; older: number } {
  const since = now - FREE_DAYS * DAY_MS;
  const shown = list.filter(x => ms(x.filedAt) >= since);
  return { shown, older: list.length - shown.length };
}

/** Insiders (distinct reporting owners) with an open-market buy dated this calendar month (UTC), by trade date, or
 *  filing date when the line has none. */
export function insidersBoughtThisMonth(trades: ReadonlyArray<{ ownerCik: string; code: "P" | "S"; tradeDate: string | null; filedAt: Date | number }>, now: number): number {
  const month = new Date(now).toISOString().slice(0, 7);
  return new Set(trades.filter(t => t.code === "P" && (t.tradeDate ?? new Date(ms(t.filedAt)).toISOString().slice(0, 10)).slice(0, 7) === month).map(t => t.ownerCik)).size;
}

/** "3 insiders bought this month", "1 insider bought this month", "No insiders bought this month". */
export const boughtThisMonthLine = (n: number): string => `${n === 0 ? "No" : n} ${n === 1 ? "insider" : "insiders"} bought this month`;

/** A ticker's latest close we hold. */
export interface Close { ticker: string; date: string; close: number }
/** A close older than this isn't "today's" and is not used. */
export const CLOSE_MAX_AGE_DAYS = 5;

/** How the stock did after each buy: the filed price per share against the latest close we hold for its ticker.
 *  `perBuy` has a change only for buys with a recent close; `overall` is the dollar-weighted change over those buys,
 *  null when none has one (the page then leaves the line out). */
export function afterBuys<T extends { accession: string; code: "P" | "S"; ticker: string | null; price: number; value: number }>(rows: readonly T[], closes: ReadonlyMap<string, Close>, now: number):
  { perBuy: Map<string, number>; overall: { change: number; buys: number; asOf: string } | null } {
  const perBuy = new Map<string, number>();
  let paid = 0, worth = 0, buys = 0, asOf = "";
  const fresh = new Date(now - CLOSE_MAX_AGE_DAYS * DAY_MS).toISOString().slice(0, 10);
  for (const r of rows) {
    if (r.code !== "P" || !r.ticker || r.price <= 0 || r.value <= 0) continue;
    const c = closes.get(r.ticker.toUpperCase());
    if (!c || c.close <= 0 || c.date < fresh) continue;
    perBuy.set(r.accession, c.close / r.price - 1);
    paid += r.value; worth += r.value * (c.close / r.price); buys++;
    if (c.date > asOf) asOf = c.date;
  }
  return { perBuy, overall: buys ? { change: worth / paid - 1, buys, asOf } : null };
}
