/* Smart money vs. the crowd, pure. Every number comes from real positions, prices and filings.
 *
 *   crowd        the market's price now for YES (Polymarket outcome 0), 0..1
 *   smart money  the share of proven traders' money (lib/smart/proven.ts) on YES: what their open positions cost,
 *                YES ÷ (YES + NO). A position counts only when it is POSITION_MIN ($2K)+, opened in the last
 *                POSITION_DAYS (14) days, and the market has SMART_MIN_WALLETS (3)+ proven traders in
 *   gap          points between the two ("Crowd 62% · Smart money 81%" is 19 points)
 *
 * Games (sports) also compare all big bets (every big move we track, any wallet) with proven traders only, and are
 * flagged when the two point opposite ways. Stocks: insiders buying (Form 4) while the stock is down DIP_MIN% or more
 * over the 30 days before, and big funds adding (13F) in a quarter the price fell DIP_MIN% or more.
 *
 * A split is listed from SPLIT_MIN points, only on a side priced SIDE_MIN–SIDE_MAX (5–95%), and alerts members from
 * SPLIT_ALERT_GAP points. Each flagged split is scored when it ends: a market when it settles (the side smart money
 * leaned to won or lost), a stock STOCK_WINDOW_DAYS after the flag (up or down). The scorecard is edge: how often that
 * side won, minus the average price of that side when flagged (what the market already gave it). It stays off public
 * pages until it shows a positive edge on SCORE_MIN (100)+ scored. */

export const SMART_MIN_WALLETS = 3;
export const SMART_MIN_MONEY = 1_000;
export const POSITION_MIN = 2_000;
export const POSITION_DAYS = 14;
export const SIDE_MIN = 0.05, SIDE_MAX = 0.95;
export const SCORE_MIN = 100;
export const SPLIT_MIN = 10;
export const SPLIT_ALERT_GAP = 15;
export const BIG_MIN_MONEY = 25_000;
export const DIP_MIN = 10;
export const DIP_DAYS = 30;
export const STOCK_WINDOW_DAYS = 90;
const DAY = 86_400_000;

export interface SmartPosition { wallet: string; outcomeIndex: number; moneyIn: number; /** When we first saw it open (ms); absent: counts. */ firstSeenAt?: number }
export interface Smart { yes: number; no: number; wallets: number; share: number | null }

/** Proven money on each side of a market, from positions of POSITION_MIN+ opened in the last POSITION_DAYS days.
 *  share is null under the minimums. */
export function smartOf(positions: readonly SmartPosition[], now = Date.now()): Smart {
  let yes = 0, no = 0;
  const ws = new Set<string>();
  for (const p of positions) {
    if (!(p.moneyIn >= POSITION_MIN)) continue;
    if (p.firstSeenAt !== undefined && now - p.firstSeenAt > POSITION_DAYS * DAY) continue;
    if (p.outcomeIndex === 0) yes += p.moneyIn; else if (p.outcomeIndex === 1) no += p.moneyIn; else continue;
    ws.add(p.wallet);
  }
  const total = yes + no;
  return { yes, no, wallets: ws.size, share: ws.size >= SMART_MIN_WALLETS && total >= SMART_MIN_MONEY ? yes / total : null };
}

export const points = (a: number, b: number): number => Math.round(Math.abs(a - b) * 1000) / 10;

/** The price of a side, from the YES price. */
export const sidePrice = (yes: number, side: "yes" | "no"): number => (side === "yes" ? yes : 1 - yes);
const sideOk = (yes: number | null, side: "yes" | "no") => yes !== null && sidePrice(yes, side) >= SIDE_MIN && sidePrice(yes, side) <= SIDE_MAX;

/** Crowd vs. smart money on one open market; null when there's no smart money read, no price, or smart money's side
 *  is priced outside 5–95% (nothing left to learn there). */
export function crowdSplit(crowd: number | null, smart: Smart): { crowd: number; smart: number; gap: number; smartSide: "yes" | "no" } | null {
  if (crowd === null || !(crowd > 0 && crowd < 1) || smart.share === null) return null;
  const smartSide = smart.share >= crowd ? "yes" : "no";
  if (!sideOk(crowd, smartSide)) return null;
  return { crowd, smart: smart.share, gap: points(crowd, smart.share), smartSide };
}

/** All big money vs. proven traders on a game: only when they lean opposite ways, on a side priced 5–95%. */
export function bigMoneySplit(all: { yes: number; no: number }, smart: Smart, yesPrice: number | null = null): { crowd: number; smart: number; gap: number; smartSide: "yes" | "no" } | null {
  const total = all.yes + all.no;
  if (smart.share === null || total < BIG_MIN_MONEY) return null;
  const a = all.yes / total, s = smart.share;
  if ((a - 0.5) * (s - 0.5) >= 0) return null;
  const smartSide = s > 0.5 ? "yes" : "no";
  if (!sideOk(yesPrice, smartSide)) return null;
  return { crowd: a, smart: s, gap: points(a, s), smartSide };
}

export interface Close { date: string; close: number }
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** The last close on or before a date (markets are shut on weekends and holidays). */
export function closeOnOrBefore(closes: readonly Close[], date: string): Close | null {
  let best: Close | null = null;
  for (const c of closes) if (c.date <= date && (!best || c.date > best.date)) best = c;
  return best;
}

/** Percent change from `days` before `date` to `date`, from daily closes; null without both closes. */
export function changeOver(closes: readonly Close[], date: string, days: number): number | null {
  const end = closeOnOrBefore(closes, date), start = closeOnOrBefore(closes, iso(Date.parse(`${date}T12:00:00Z`) - days * DAY));
  if (!end || !start || start.date === end.date) return null;
  return (end.close / start.close - 1) * 100;
}

export interface InsiderBuy { ticker: string; company: string; owner: string; value: number; tradeDate: string }

/** Insiders buying the dip: per ticker, the buys made while the stock was down DIP_MIN%+ over the DIP_DAYS before
 *  the trade. The gap is the deepest of those falls, in percent. */
export function insiderDips(buys: readonly InsiderBuy[], closes: ReadonlyMap<string, readonly Close[]>): Array<{ ticker: string; company: string; owners: string[]; value: number; fall: number; from: string; to: string }> {
  const by = new Map<string, { ticker: string; company: string; owners: Set<string>; value: number; fall: number; from: string; to: string }>();
  for (const b of buys) {
    const c = closes.get(b.ticker.toUpperCase());
    if (!c) continue;
    const ch = changeOver(c, b.tradeDate, DIP_DAYS);
    if (ch === null || ch > -DIP_MIN) continue;
    const cur = by.get(b.ticker) ?? { ticker: b.ticker, company: b.company, owners: new Set<string>(), value: 0, fall: 0, from: b.tradeDate, to: b.tradeDate };
    cur.owners.add(b.owner); cur.value += b.value; cur.fall = Math.max(cur.fall, -ch);
    if (b.tradeDate < cur.from) cur.from = b.tradeDate;
    if (b.tradeDate > cur.to) cur.to = b.tradeDate;
    by.set(b.ticker, cur);
  }
  return [...by.values()].map(x => ({ ...x, owners: [...x.owners], fall: Math.round(x.fall * 10) / 10 }));
}

export interface FundAdd { ticker: string; company: string; fund: string; addedValue: number; period: string }

/** Big funds adding while the price fell: per ticker, the funds whose 13F for a quarter added shares while the stock
 *  fell DIP_MIN%+ over that quarter (the 91 days to the period end). */
export function fundAddsInFall(adds: readonly FundAdd[], closes: ReadonlyMap<string, readonly Close[]>): Array<{ ticker: string; company: string; funds: string[]; value: number; fall: number; period: string }> {
  const by = new Map<string, { ticker: string; company: string; funds: Set<string>; value: number; fall: number; period: string }>();
  for (const a of adds) {
    const c = closes.get(a.ticker.toUpperCase());
    if (!c) continue;
    const ch = changeOver(c, a.period, 91);
    if (ch === null || ch > -DIP_MIN) continue;
    const cur = by.get(a.ticker) ?? { ticker: a.ticker, company: a.company, funds: new Set<string>(), value: 0, fall: 0, period: a.period };
    cur.funds.add(a.fund); cur.value += a.addedValue; cur.fall = Math.max(cur.fall, -ch);
    if (a.period > cur.period) cur.period = a.period;
    by.set(a.ticker, cur);
  }
  return [...by.values()].map(x => ({ ...x, funds: [...x.funds], fall: Math.round(x.fall * 10) / 10 }));
}

/** Was smart money right? Markets: the side it leaned to (against the crowd) won. Void markets aren't scored. */
export function marketVerdict(smartSide: "yes" | "no", result: "yes" | "no" | "void"): boolean | null {
  return result === "void" ? null : smartSide === result;
}

/** Stocks: right when the close STOCK_WINDOW_DAYS after the flag is above the flag day's; null until then. */
export function stockVerdict(closes: readonly Close[], flaggedOn: string, today: string): { outcome: "up" | "down"; right: boolean; change: number } | null {
  const endDate = iso(Date.parse(`${flaggedOn}T12:00:00Z`) + STOCK_WINDOW_DAYS * DAY);
  if (today < endDate) return null;
  const start = closeOnOrBefore(closes, flaggedOn), end = closeOnOrBefore(closes, endDate);
  if (!start || !end || end.date <= start.date) return null;
  const change = (end.close / start.close - 1) * 100;
  return { outcome: change > 0 ? "up" : "down", right: change > 0, change: Math.round(change * 10) / 10 };
}

/** The scorecard's totals: calls scored, right, and the share right; void and unscored calls are left out. */
export function scorecard(rows: ReadonlyArray<{ smartRight: boolean | null }>): { scored: number; right: number; share: number | null } {
  const scored = rows.filter(r => r.smartRight !== null);
  const right = scored.filter(r => r.smartRight).length;
  return { scored: scored.length, right, share: scored.length ? right / scored.length : null };
}

export interface Edge { scored: number; won: number; winRate: number | null; avgPrice: number | null; edge: number | null }
/** Edge, for market calls: how often smart money's side won, minus the average price of that side when the call was
 *  flagged. Only calls that meet today's rules count: 3+ proven traders, the side priced 5–95% (void and unscored left
 *  out). Stock calls have no price for a side and aren't in it. */
export function edgeOf(rows: ReadonlyArray<{ source: string; smartRight: boolean | null; smartSide: string; flaggedCrowd: number | null; kind: string; detail: Record<string, unknown> }>): Edge {
  const ok = rows.filter(r => r.source === "polymarket" && r.smartRight !== null && (r.smartSide === "yes" || r.smartSide === "no") && r.flaggedCrowd !== null
    && Number(r.detail.wallets ?? 0) >= SMART_MIN_WALLETS && r.kind === "crowd" && sideOk(r.flaggedCrowd, r.smartSide));
  if (!ok.length) return { scored: 0, won: 0, winRate: null, avgPrice: null, edge: null };
  const won = ok.filter(r => r.smartRight).length;
  const avgPrice = ok.reduce((a, r) => a + sidePrice(r.flaggedCrowd!, r.smartSide as "yes" | "no"), 0) / ok.length;
  return { scored: ok.length, won, winRate: won / ok.length, avgPrice, edge: won / ok.length - avgPrice };
}
/** Positioning shows publicly only once its edge is positive on SCORE_MIN+ scored calls. */
export const positioningPublic = (e: Edge): boolean => e.scored >= SCORE_MIN && (e.edge ?? 0) > 0;
