/* P&L from the user's own public records: a Polymarket wallet's positions and history (public Data API, read
 * through lib/exchanges/polymarket.ts) and a Kalshi account-history CSV the user downloads and uploads (never API
 * keys), parsed by lib/exchanges/kalshi-csv.ts. The parsers and the totals are pure; only fetchPolymarketPnl does I/O. It shows the user's own numbers and
 * nothing else: no suggestions.
 *
 * Realized P&L is cash out minus cash in, using average cost for what is still held:
 *   per market, realized = (sells + redemptions + merges + rewards) − (buys + splits) − fees + cost basis still held.
 * Open positions are valued at the venue's current price when it gives one (Polymarket); Kalshi's CSV has no
 * current prices, so open Kalshi positions show their cost. */
import { parseKalshiCsv, type KalshiCsvResult, type KalshiCsvSettlement } from "./exchanges/kalshi-csv";
import { PolymarketClient, readActivity, readPositions, type PolymarketActivity, type PolymarketPosition } from "./exchanges/polymarket";

/** Largest Kalshi CSV accepted, in characters. */
export const MAX_CSV_CHARS = 5_000_000;
/** History pages read for a wallet (500 rows each). */
export const ACTIVITY_MAX_PAGES = 20;
/** Positions smaller than this many contracts are treated as closed (dust). */
export const DUST_CONTRACTS = 1e-6;

export const isWallet = (s: string): boolean => /^0x[0-9a-fA-F]{40}$/.test(s);

export interface PnlMarket {
  key: string;
  title: string;
  /** The outcome(s) held, when open. */
  outcome: string | null;
  realized: number;
  /** Contracts still held. */
  openContracts: number;
  /** Cost basis of what is still held. */
  openCost: number;
  /** Current value of what is still held; null when the source has no current price. */
  openValue: number | null;
}

export interface PnlSummary {
  source: "polymarket" | "kalshi";
  realized: number;
  openCost: number;
  /** null when any open position has no current price. */
  openValue: number | null;
  openPositions: number;
  markets: PnlMarket[];
  /** History rows read. */
  rows: number;
  /** Rows that couldn't be read. */
  skipped: number;
  /** True when the history hit the read limit, so older rows are missing. */
  truncated: boolean;
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

function finish(source: PnlSummary["source"], markets: PnlMarket[], rows: number, skipped: number, truncated: boolean): PnlSummary {
  const sorted = markets.map(m => ({ ...m, realized: round2(m.realized), openCost: round2(m.openCost), openValue: m.openValue === null ? null : round2(m.openValue) }))
    .sort((a, b) => Math.abs(b.realized) + (b.openValue ?? b.openCost) - (Math.abs(a.realized) + (a.openValue ?? a.openCost)));
  const open = sorted.filter(m => m.openContracts > DUST_CONTRACTS);
  return {
    source,
    realized: round2(sorted.reduce((a, m) => a + m.realized, 0)),
    openCost: round2(open.reduce((a, m) => a + m.openCost, 0)),
    openValue: open.some(m => m.openValue === null) ? null : round2(open.reduce((a, m) => a + (m.openValue ?? 0), 0)),
    openPositions: open.length,
    markets: sorted,
    rows, skipped, truncated,
  };
}

/* ---------- Polymarket ---------- */

/** Cash flow of one history row, dollars: positive is money in. */
export function activityCash(a: PolymarketActivity): number {
  const usd = a.usdcSize ?? (a.size !== null && a.price !== null ? a.size * a.price : 0);
  switch (a.type) {
    case "TRADE": return a.side === "SELL" ? usd : a.side === "BUY" ? -usd : 0;
    case "SPLIT": return -usd;
    case "MERGE":
    case "REDEEM":
    case "REWARD": return usd;
    default: return 0;
  }
}

/** Totals for a wallet from its open positions and its history. Pure. */
export function polymarketPnl(positions: readonly PolymarketPosition[], activity: readonly PolymarketActivity[], truncated = false): PnlSummary {
  const by = new Map<string, PnlMarket>();
  const get = (key: string, title: string | null): PnlMarket => {
    let m = by.get(key);
    if (!m) { m = { key, title: title ?? key, outcome: null, realized: 0, openContracts: 0, openCost: 0, openValue: 0 }; by.set(key, m); }
    else if (title && m.title === key) m.title = title;
    return m;
  };
  let skipped = 0;
  for (const a of activity) {
    if (!a.conditionId) { skipped++; continue; }
    get(a.conditionId, a.title).realized += activityCash(a);
  }
  for (const p of positions) {
    if (p.size <= DUST_CONTRACTS) continue;
    const m = get(p.conditionId, p.title);
    const cost = p.initialValue ?? (p.avgPrice !== null ? p.avgPrice * p.size : 0);
    const value = p.currentValue ?? (p.curPrice !== null ? p.curPrice * p.size : null);
    m.openContracts += p.size;
    m.openCost += cost;
    m.openValue = m.openValue === null || value === null ? null : m.openValue + value;
    // What is still held was paid for in the history: add its cost back so realized covers only what was closed.
    m.realized += cost;
    m.outcome = m.outcome ? `${m.outcome}, ${p.outcome ?? "?"}` : p.outcome;
  }
  for (const m of by.values()) if (m.openContracts <= DUST_CONTRACTS) m.openValue = 0;
  return finish("polymarket", [...by.values()], activity.length, skipped, truncated);
}

/** Pure entry for raw Data API bodies (tests and fixtures). */
export const polymarketPnlFromRaw = (positionsRaw: unknown, activityRaw: unknown): PnlSummary =>
  polymarketPnl(readPositions(positionsRaw), readActivity(activityRaw));

/** Reads the wallet's public positions and history. Throws when the Data API can't be reached. */
export async function fetchPolymarketPnl(wallet: string, client = new PolymarketClient()): Promise<PnlSummary> {
  if (!isWallet(wallet)) throw new Error("Not a wallet address");
  const [positions, activity] = await Promise.all([client.getPositions(wallet), client.getActivity(wallet, { maxPages: ACTIVITY_MAX_PAGES })]);
  return polymarketPnl(positions, activity, activity.length >= ACTIVITY_MAX_PAGES * 500);
}

/* ---------- Kalshi CSV ---------- */

/** One Kalshi record in the shape the totals need, from lib/exchanges/kalshi-csv.ts rows. */
export interface KalshiRow {
  ticker: string;
  title: string | null;
  kind: "buy" | "sell" | "settlement";
  /** The side traded; null for a settlement (it closes every side of the market). */
  side: "yes" | "no" | null;
  contracts: number | null;
  /** Dollars per contract, 0..1. */
  price: number | null;
  /** Cash received (settlement revenue), dollars. */
  amount: number | null;
  fee: number;
  /** Realized profit as the file states it (settlement exports), dollars. */
  pnl: number | null;
}

/** Settlement revenue when the file states only the result and the contracts held: $1 per winning contract. */
function settlementRevenue(s: KalshiCsvSettlement): number | null {
  if (s.revenue !== null) return s.revenue;
  if (s.result === "yes" && s.yesContracts !== null) return s.yesContracts;
  if (s.result === "no" && s.noContracts !== null) return s.noContracts;
  return null;
}

/** Kalshi CSV rows → KalshiRow[]. Pure. */
export function kalshiRows(parsed: KalshiCsvResult): KalshiRow[] {
  const rows: Array<KalshiRow & { line: number }> = [
    ...parsed.trades.map(t => ({ line: t.line, ticker: t.ticker, title: t.title, kind: t.action, side: t.side, contracts: t.contracts, price: t.price, amount: null, fee: t.fee ?? 0, pnl: null })),
    ...parsed.settlements.map(s => ({ line: s.line, ticker: s.ticker, title: s.title, kind: "settlement" as const, side: null, contracts: s.contracts, price: null,
      amount: settlementRevenue(s), fee: s.fee ?? 0, pnl: s.profit })),
  ];
  // File order: a settlement must come after the trades it closes.
  return rows.sort((a, b) => a.line - b.line).map(({ line: _line, ...r }) => r);
}

/** Totals from Kalshi rows. When the file states realized profit (settlement exports), that is summed as written;
 *  otherwise realized is computed from the cash flows with average cost. Pure. */
export function kalshiPnl(rows: readonly KalshiRow[], skipped = 0): PnlSummary {
  const hasPnl = rows.some(r => r.pnl !== null);
  type Pos = { contracts: number; cost: number };
  const by = new Map<string, PnlMarket & { pos: Map<"yes" | "no", Pos> }>();
  for (const r of rows) {
    let m = by.get(r.ticker);
    if (!m) { m = { key: r.ticker, title: r.title ?? r.ticker, outcome: null, realized: 0, openContracts: 0, openCost: 0, openValue: null, pos: new Map() }; by.set(r.ticker, m); }
    if (r.title && m.title === r.ticker) m.title = r.title;
    if (r.kind === "settlement") {
      // Everything still held in the market is closed: revenue in, cost basis out.
      const basis = [...m.pos.values()].reduce((a, p) => a + p.cost, 0);
      if (hasPnl) m.realized += r.pnl ?? 0;
      else m.realized += (r.amount ?? 0) - basis - r.fee;
      m.pos.clear();
      continue;
    }
    const side = r.side ?? "yes";
    const p = m.pos.get(side) ?? { contracts: 0, cost: 0 };
    const n = r.contracts ?? 0;
    const cash = r.amount ?? (r.price !== null ? n * r.price : 0);
    if (r.kind === "buy") {
      p.contracts += n; p.cost += cash;
      if (!hasPnl) m.realized -= r.fee;
    } else {
      const avg = p.contracts > 0 ? p.cost / p.contracts : 0;
      const take = Math.min(n, p.contracts);
      if (!hasPnl) m.realized += cash - avg * take - r.fee;
      p.contracts -= take; p.cost -= avg * take;
    }
    m.pos.set(side, p);
  }
  const markets: PnlMarket[] = [...by.values()].map(({ pos, ...m }) => {
    const open = [...pos.entries()].filter(([, p]) => p.contracts > DUST_CONTRACTS);
    return { ...m, openContracts: open.reduce((a, [, p]) => a + p.contracts, 0), openCost: open.reduce((a, [, p]) => a + p.cost, 0),
      outcome: open.length ? open.map(([s]) => s.toUpperCase()).join(", ") : null, openValue: open.length ? null : 0 };
  });
  return finish("kalshi", markets, rows.length, skipped, false);
}

/** CSV text → totals, or a reason the file couldn't be read. */
export function kalshiPnlFromCsv(text: string): { summary: PnlSummary | null; error: string | null } {
  if (text.length > MAX_CSV_CHARS) return { summary: null, error: "That file is too large." };
  if (!text.trim()) return { summary: null, error: "The file is empty." };
  const parsed = parseKalshiCsv(text);
  if (parsed.columns.ticker === null) return { summary: null, error: "No market ticker column found. Upload the CSV Kalshi exports from your account history." };
  const rows = kalshiRows(parsed);
  if (!rows.length) return { summary: null, error: "No trades or settlements were found in that file." };
  return { summary: kalshiPnl(rows, parsed.skipped.length), error: null };
}
