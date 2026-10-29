/* Every performance number on a tracker, trader or market page, from moves we store (terminal.moves). Pure.
 *
 * A "settled" move here is one that counts toward a record (lib/trust.ts countsToRecord): a Polymarket bet, won or
 * lost, its real result worked out from the wallet's own trades (pnl), not mostly sold before the result. Any stat
 * built from settled moves needs MIN_SETTLED of them; below that the page says "Not enough data yet" (see `enough`).
 *
 *   win rate     won / (won + lost)
 *   avg price    the average price paid per $1 payout, weighted by amount: the market's own chance, in %
 *   edge         win rate − avg price, in percentage points: how much more often they won than the price said
 *   net          Σ pnl (what the bets really made: sales before the result + payout − cost)
 *   ROI          net / Σ amount
 *   $100 each    hypothetical: $100 on every settled move at its price: won → +100·(1/p − 1), lost → −100
 * All times are bucketed in US Eastern, like every clock on the site. */
import type { Move } from "@/lib/moves/types";

export const MIN_SETTLED = 20;
export const NOT_ENOUGH = "Not enough data yet";
export const enough = (n: number) => n >= MIN_SETTLED;

export type StatMove = Pick<Move, "id" | "amount" | "avgPrice" | "result" | "pnl" | "at" | "settledAt" | "wallet" | "walletName" | "marketTitle" | "eventTitle" | "outcome" | "tab" | "league" | "category" | "marketId">;

const priced = (m: StatMove) => m.avgPrice > 0 && m.avgPrice < 1;
const won = (m: StatMove) => m.result === "won";

export interface Perf {
  settled: number; won: number; lost: number;
  /** 0..1, null under MIN_SETTLED. */
  winRate: number | null;
  /** 0..1 (the price), null when nothing priced or under MIN_SETTLED. */
  avgPrice: number | null;
  /** Percentage points, null under MIN_SETTLED. */
  edge: number | null;
  net: number | null;
  staked: number;
  roi: number | null;
  /** Hypothetical: $100 on every settled move. */
  hundred: number | null;
}

/** The performance of settled moves (already filtered to the ones that count). */
export function perf(settled: readonly StatMove[]): Perf {
  const w = settled.filter(won).length, l = settled.length - w;
  const ok = enough(settled.length);
  const p = settled.filter(priced);
  const pw = p.reduce((s, m) => s + m.amount, 0);
  const avgPrice = pw > 0 ? p.reduce((s, m) => s + m.amount * m.avgPrice, 0) / pw : null;
  const winRate = settled.length ? w / settled.length : null;
  const net = settled.reduce((s, m) => s + (m.pnl ?? 0), 0);
  const staked = settled.reduce((s, m) => s + m.amount, 0);
  const hundred = p.reduce((s, m) => s + (won(m) ? 100 * (1 / m.avgPrice - 1) : -100), 0);
  return {
    settled: settled.length, won: w, lost: l,
    winRate: ok ? winRate : null,
    avgPrice: ok ? avgPrice : null,
    edge: ok && winRate !== null && avgPrice !== null ? (winRate - avgPrice) * 100 : null,
    net: ok ? net : null, staked,
    roi: ok && staked > 0 ? net / staked : null,
    hundred: ok && p.length ? hundred : null,
  };
}

/* ---------- time ---------- */

const ET_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
const ET_PARTS = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "2-digit", hourCycle: "h23" });
/** "2026-10-29" in New York. */
export const etDay = (ms: number) => ET_DAY.format(new Date(ms));
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
/** 0 = Monday … 6 = Sunday, and the hour 0–23, in New York. */
export function etSlot(ms: number): { day: number; hour: number } {
  const parts = ET_PARTS.formatToParts(new Date(ms));
  const wd = parts.find(p => p.type === "weekday")?.value ?? "Mon";
  return { day: Math.max(0, WEEKDAYS.indexOf(wd as (typeof WEEKDAYS)[number])), hour: Number(parts.find(p => p.type === "hour")?.value ?? 0) % 24 };
}

/* ---------- series ---------- */

export interface Point { t: number; v: number }

/** Cumulative net over settled moves, by settle time, from `since` (the window's first point is 0 at `since`). */
export function pnlSeries(settled: readonly StatMove[], since: number | null = null): Point[] {
  const l = settled.filter(m => m.settledAt !== null && (since === null || m.settledAt! >= since)).sort((a, b) => a.settledAt! - b.settledAt! || a.id.localeCompare(b.id));
  let v = 0;
  const out: Point[] = since !== null && l.length ? [{ t: since, v: 0 }] : [];
  for (const m of l) { v += m.pnl ?? 0; out.push({ t: m.settledAt!, v }); }
  return out;
}

/** Chart windows: 1W 1M 3M 1Y All. */
export const CHART_WINDOWS = [
  { key: "1w", label: "1W", days: 7 }, { key: "1m", label: "1M", days: 30 }, { key: "3m", label: "3M", days: 91 },
  { key: "1y", label: "1Y", days: 365 }, { key: "all", label: "All", days: null },
] as const;

/* ---------- single facts ---------- */

/** The current run of wins or losses, newest settled first. */
export function streak(settled: readonly StatMove[]): { kind: "won" | "lost"; n: number } | null {
  const l = [...settled].filter(m => m.settledAt !== null).sort((a, b) => b.settledAt! - a.settledAt! || b.id.localeCompare(a.id));
  if (!l.length) return null;
  const kind = won(l[0]!) ? "won" : "lost";
  let n = 0;
  for (const m of l) { if ((won(m) ? "won" : "lost") !== kind) break; n++; }
  return { kind, n };
}

/** The day (New York) whose settled moves made the most. */
export function bestDay(settled: readonly StatMove[]): { day: string; net: number } | null {
  const by = new Map<string, number>();
  for (const m of settled) if (m.settledAt !== null) by.set(etDay(m.settledAt!), (by.get(etDay(m.settledAt!)) ?? 0) + (m.pnl ?? 0));
  let best: { day: string; net: number } | null = null;
  for (const [day, net] of by) if (!best || net > best.net) best = { day, net };
  return best;
}

export const biggestWin = (settled: readonly StatMove[]) => settled.filter(m => (m.pnl ?? 0) > 0).sort((a, b) => (b.pnl ?? 0) - (a.pnl ?? 0))[0] ?? null;
export const biggestLoss = (settled: readonly StatMove[]) => settled.filter(m => (m.pnl ?? 0) < 0).sort((a, b) => (a.pnl ?? 0) - (b.pnl ?? 0))[0] ?? null;

/** Activity over every move (settled or not): money, count, average and biggest bet. */
export function activity(all: readonly Pick<StatMove, "amount">[]): { tracked: number; moves: number; avgBet: number | null; biggestBet: number | null } {
  const tracked = all.reduce((s, m) => s + m.amount, 0);
  return { tracked, moves: all.length, avgBet: all.length ? tracked / all.length : null, biggestBet: all.length ? Math.max(...all.map(m => m.amount)) : null };
}

/** Share of moves (by count) made by top traders. */
export function topShare(all: readonly Pick<StatMove, "wallet">[], isTop: (w: string) => boolean): number | null {
  return all.length ? all.filter(m => m.wallet && isTop(m.wallet)).length / all.length : null;
}

/** Open moves against the price now: the average move in cents in their favour (a YES bet gains when YES rises). */
export function priceMove(open: ReadonlyArray<{ avgPrice: number; now: number | null }>): number | null {
  const l = open.filter(o => o.now !== null && o.avgPrice > 0 && o.avgPrice < 1);
  return l.length ? (l.reduce((s, o) => s + (o.now! - o.avgPrice), 0) / l.length) * 100 : null;
}

/* ---------- breakdowns ---------- */

export interface Row { key: string; perf: Perf; moves: number }

/** Settled moves grouped by `keyOf`, biggest group first; each row's performance gated by MIN_SETTLED itself. */
export function breakdown<T extends StatMove>(settled: readonly T[], keyOf: (m: T) => string | null, order?: readonly string[]): Row[] {
  const groups = new Map<string, T[]>();
  for (const m of settled) { const k = keyOf(m); if (k) groups.set(k, [...(groups.get(k) ?? []), m]); }
  const rows = [...groups].map(([key, l]) => ({ key, perf: perf(l), moves: l.length }));
  return order ? rows.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key)) : rows.sort((a, b) => b.moves - a.moves || a.key.localeCompare(b.key));
}

export const SIZES = ["Under $25K", "$25K–$50K", "$50K–$100K", "$100K–$250K", "$250K+"] as const;
export function sizeOf(amount: number): (typeof SIZES)[number] {
  return amount < 25_000 ? SIZES[0] : amount < 50_000 ? SIZES[1] : amount < 100_000 ? SIZES[2] : amount < 250_000 ? SIZES[3] : SIZES[4];
}

/** Underdog: bought under 40¢. Favorite: over 75¢. Between: toss-up. */
export const SIDES = ["Underdog (under 40¢)", "Toss-up (40–75¢)", "Favorite (over 75¢)"] as const;
export function sideOf(p: number): (typeof SIDES)[number] | null {
  if (!(p > 0 && p < 1)) return null;
  return p < 0.4 ? SIDES[0] : p > 0.75 ? SIDES[2] : SIDES[1];
}

export const dayOf = (m: StatMove) => WEEKDAYS[etSlot(m.at).day]!;

/** Moves by New York weekday × hour of day (when they were placed). */
export function heatmap(all: readonly Pick<StatMove, "at">[]): number[][] {
  const g = WEEKDAYS.map(() => Array.from({ length: 24 }, () => 0));
  for (const m of all) { const s = etSlot(m.at); g[s.day]![s.hour]!++; }
  return g;
}

/* ---------- leaderboards ---------- */

export interface Leader { wallet: string; name: string | null; perf: Perf; moves: number; amount: number }

/** The wallets behind settled moves, by net, then money. Each row's record is gated by MIN_SETTLED itself. */
export function leaders(settled: readonly StatMove[], limit = 10): Leader[] {
  const by = new Map<string, StatMove[]>();
  for (const m of settled) if (m.wallet) by.set(m.wallet, [...(by.get(m.wallet) ?? []), m]);
  return [...by].map(([wallet, l]) => ({ wallet, name: l.find(m => m.walletName)?.walletName ?? null, perf: perf(l), moves: l.length,
    amount: l.reduce((s, m) => s + m.amount, 0), raw: l.reduce((s, m) => s + (m.pnl ?? 0), 0) }))
    .sort((a, b) => b.raw - a.raw || b.amount - a.amount).slice(0, limit).map(({ raw: _raw, ...r }) => r);
}

/** Rank among wallets by all-time profit (1 = best), from a sorted list of profits. */
export function rankOf(profit: number, allProfits: readonly number[]): number {
  return allProfits.filter(p => p > profit).length + 1;
}
