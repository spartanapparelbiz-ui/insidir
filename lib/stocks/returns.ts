/* How a stock did after an insider's buy, against the S&P 500 (SPY), from daily closes (lib/stocks/prices.ts). Pure.
 *   from   the first close on or after the trade date
 *   to     the first close on or after trade date + N days; null when that day hasn't come yet (or no close since)
 *   vs S&P the stock's change minus SPY's over the same two dates, in percentage points */
import type { Close } from "./prices";

export const AFTER_DAYS = [30, 90, 180] as const;

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** The first close on or after `date` (closes sorted by date). */
export function closeOnOrAfter(closes: readonly Close[], date: string): Close | null {
  let lo = 0, hi = closes.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (closes[mid]!.date < date) lo = mid + 1; else hi = mid; }
  return closes[lo] ?? null;
}

export interface After { days: number; pct: number | null; spy: number | null; vs: number | null }

export function afterBuy(stock: readonly Close[], spy: readonly Close[], tradeDate: string, days: number, today: string): After {
  const end = addDays(tradeDate, days);
  if (end > today) return { days, pct: null, spy: null, vs: null };
  const a = closeOnOrAfter(stock, tradeDate), b = closeOnOrAfter(stock, end);
  const pct = a && b && b.date >= end ? (b.close / a.close - 1) * 100 : null;
  const sa = closeOnOrAfter(spy, tradeDate), sb = closeOnOrAfter(spy, end);
  const s = sa && sb && sb.date >= end ? (sb.close / sa.close - 1) * 100 : null;
  return { days, pct, spy: s, vs: pct !== null && s !== null ? pct - s : null };
}

/** Averages over many buys (each counted once per window it has reached). */
export function averageAfter(rows: ReadonlyArray<After[]>): Array<{ days: number; n: number; pct: number | null; vs: number | null }> {
  return AFTER_DAYS.map((days, i) => {
    const l = rows.map(r => r[i]!).filter(x => x.pct !== null);
    const v = l.filter(x => x.vs !== null);
    return { days, n: l.length, pct: l.length ? l.reduce((s, x) => s + x.pct!, 0) / l.length : null, vs: v.length ? v.reduce((s, x) => s + x.vs!, 0) / v.length : null };
  });
}

/** The most recent cluster buy: 3+ different insiders buying within 30 days. Their names, and the first and last
 *  trade dates; null when there's none. Pure. */
export function latestCluster(buys: ReadonlyArray<{ ownerCik: string; ownerName: string; date: string }>): { owners: string[]; from: string; to: string } | null {
  const l = [...buys].sort((a, b) => b.date.localeCompare(a.date));
  for (let i = 0; i < l.length; i++) {
    const end = l[i]!.date, start = new Date(Date.parse(`${end}T12:00:00Z`) - 30 * 86_400_000).toISOString().slice(0, 10);
    const inside = l.slice(i).filter(b => b.date >= start);
    const owners = [...new Map(inside.map(b => [b.ownerCik, b.ownerName])).values()];
    if (owners.length >= 3) return { owners, from: inside.at(-1)!.date, to: end };
  }
  return null;
}
