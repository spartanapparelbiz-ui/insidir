/* A Polymarket trader's profile stats (docs/INSIDIR-V2.md §6), pure, from the wallet's real resolved positions
 * (Data API /closed-positions). Shown only with RECORD_MIN_RESOLVED resolved markets. Each market counts once: a wallet
 * can hold both outcomes, and the market's net is what it made there.
 *   win rate          won X of Y resolved markets
 *   all-time profit   sum of realized profit
 *   return            profit ÷ money in (shares bought × average price)
 *   biggest win       the best single market
 *   best category     the category with the most profit (at least BEST_MIN_MARKETS markets, profit above zero)
 *   last 30 days      won / resolved among markets that resolved in the last 30 days
 *   streak            the latest run of wins or losses, by resolution time
 *   average bet       money in per market
 *   profit over time  cumulative profit by resolution time
 * Never anything about who is behind a wallet. */
import { leagueOf } from "@/lib/moves/classify";
import { RECORD_MIN_RESOLVED } from "@/lib/moves/records";
import { epochMs, num, rows, str } from "@/lib/exchanges/parse";

export const BEST_MIN_MARKETS = 5;
const DAY = 86_400_000;

export interface ClosedPosition {
  marketId: string;
  outcomeIndex: number;
  title: string;
  outcome: string | null;
  eventSlug: string | null;
  slug: string | null;
  /** Dollars put in: shares bought × average price. */
  moneyIn: number;
  pnl: number;
  /** Average price paid, 0..1; null when the row didn't say. */
  avgPrice?: number | null;
  /** When the position closed (the row's timestamp, else the market's end date), ms. */
  resolvedAt: number | null;
}

/** Data API /closed-positions rows: conditionId, outcomeIndex, outcome, title, eventSlug, slug, avgPrice, totalBought
 *  (shares), realizedPnl, timestamp (s), endDate. */
export function readClosedRows(raw: unknown): ClosedPosition[] {
  const out: ClosedPosition[] = [];
  for (const p of rows(raw)) {
    const marketId = str(p.conditionId), pnl = num(p.realizedPnl);
    if (!marketId || pnl === null) continue;
    const avg = num(p.avgPrice), bought = num(p.totalBought);
    out.push({
      marketId, outcomeIndex: num(p.outcomeIndex) ?? 0, title: str(p.title) ?? marketId, outcome: str(p.outcome),
      eventSlug: str(p.eventSlug), slug: str(p.slug),
      moneyIn: avg !== null && bought !== null && avg > 0 && bought > 0 ? Math.round(avg * bought * 100) / 100 : 0,
      pnl, avgPrice: avg !== null && avg > 0 && avg < 1 ? avg : null, resolvedAt: epochMs(p.timestamp) ?? epochMs(p.endDate),
    });
  }
  return out;
}

const CRYPTO = /\b(bitcoin|btc|ethereum|eth|solana|sol|xrp|ripple|dogecoin|doge|crypto|cardano|bnb)\b/i;

/** Profile category from the market's words: a league for sports ("NBA", "Soccer", "Other sports" when only the venue
 *  says sports), "Crypto", or "Markets". `tabHint` is the feed's own classification when the market was a move. */
export function categoryOf(words: ReadonlyArray<string | null | undefined>, tabHint?: "sports" | "markets" | "crypto" | null): { tab: "sports" | "markets" | "crypto"; category: string } {
  const league = leagueOf(words);
  if (league !== "other") return { tab: "sports", category: LEAGUE_NAME[league] ?? league };
  if (tabHint === "sports") return { tab: "sports", category: "Other sports" };
  if (tabHint === "crypto" || (tabHint !== "markets" && CRYPTO.test(words.filter(Boolean).join(" ").replace(/-/g, " ")))) return { tab: "crypto", category: "Crypto" };
  return { tab: "markets", category: "Markets" };
}
const LEAGUE_NAME: Record<string, string> = { college: "College sports", soccer: "Soccer", tennis: "Tennis", golf: "Golf" };

/** One market's result for the stats. */
export interface MarketResult { marketId: string; title: string; category: string; tab: string; moneyIn: number; pnl: number; resolvedAt: number | null }

export function byMarket(positions: readonly MarketResult[]): MarketResult[] {
  const m = new Map<string, MarketResult>();
  for (const p of positions) {
    const cur = m.get(p.marketId);
    if (!cur) { m.set(p.marketId, { ...p }); continue; }
    cur.moneyIn += p.moneyIn; cur.pnl += p.pnl;
    cur.resolvedAt = Math.max(cur.resolvedAt ?? 0, p.resolvedAt ?? 0) || null;
  }
  return [...m.values()];
}

export interface CategoryRow { category: string; won: number; lost: number; profit: number }

export interface TraderStats {
  resolved: number;
  won: number;
  lost: number;
  profit: number;
  moneyIn: number;
  /** profit ÷ money in; null with no money in. */
  roi: number | null;
  biggestWin: number;
  best: CategoryRow | null;
  last30: { won: number; resolved: number; profit: number };
  streak: { kind: "won" | "lost"; n: number } | null;
  avgBet: number;
  /** Cumulative profit after each resolution day, oldest first. */
  series: Array<{ at: number; profit: number }>;
  categories: CategoryRow[];
}

const cents = (v: number) => Math.round(v * 100) / 100;

export function traderStats(markets: readonly MarketResult[], now: number): TraderStats {
  let won = 0, lost = 0, profit = 0, moneyIn = 0, biggestWin = 0;
  const cats = new Map<string, CategoryRow>();
  const last30 = { won: 0, resolved: 0, profit: 0 };
  for (const m of markets) {
    const w = m.pnl > 0;
    if (w) won++; else lost++;
    profit += m.pnl; moneyIn += m.moneyIn; biggestWin = Math.max(biggestWin, m.pnl);
    const c = cats.get(m.category) ?? { category: m.category, won: 0, lost: 0, profit: 0 };
    if (w) c.won++; else c.lost++;
    c.profit += m.pnl;
    cats.set(m.category, c);
    if (m.resolvedAt !== null && m.resolvedAt > now - 30 * DAY) { last30.resolved++; if (w) last30.won++; last30.profit += m.pnl; }
  }
  const categories = [...cats.values()].map(c => ({ ...c, profit: cents(c.profit) })).sort((a, b) => b.profit - a.profit);
  const best = categories.find(c => c.won + c.lost >= BEST_MIN_MARKETS && c.profit > 0) ?? null;
  const timed = markets.filter(m => m.resolvedAt !== null).sort((a, b) => a.resolvedAt! - b.resolvedAt! || a.marketId.localeCompare(b.marketId));
  let streak: TraderStats["streak"] = null;
  for (let i = timed.length - 1; i >= 0; i--) {
    const kind = timed[i]!.pnl > 0 ? "won" : "lost";
    if (!streak) streak = { kind, n: 1 };
    else if (streak.kind === kind) streak.n++;
    else break;
  }
  const series: TraderStats["series"] = [];
  let cum = 0;
  for (const m of timed) {
    cum += m.pnl;
    const day = Math.floor(m.resolvedAt! / DAY) * DAY;
    if (series.length && series.at(-1)!.at === day) series.at(-1)!.profit = cents(cum);
    else series.push({ at: day, profit: cents(cum) });
  }
  const n = markets.length;
  return {
    resolved: n, won, lost, profit: cents(profit), moneyIn: cents(moneyIn), roi: moneyIn > 0 ? profit / moneyIn : null, biggestWin: cents(biggestWin),
    best, last30: { ...last30, profit: cents(last30.profit) }, streak, avgBet: n ? cents(moneyIn / n) : 0, series, categories,
  };
}

export const showStats = (s: Pick<TraderStats, "resolved">): boolean => s.resolved >= RECORD_MIN_RESOLVED;

/** The stats in a time window (for /top: this week, this month), from markets that resolved in it. */
export function windowStats(markets: readonly MarketResult[], since: number | null, tab: "sports" | "markets" | null): { resolved: number; won: number; profit: number } {
  let resolved = 0, won = 0, profit = 0;
  for (const m of markets) {
    if (since !== null && (m.resolvedAt === null || m.resolvedAt < since)) continue;
    if (tab && m.tab !== tab) continue;
    resolved++; if (m.pnl > 0) won++; profit += m.pnl;
  }
  return { resolved, won, profit: cents(profit) };
}
