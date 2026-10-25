/* P&L from the user's own public records: a Polymarket wallet's positions and history (public Data API, read
 * through lib/exchanges/polymarket.ts) and a Kalshi account-history CSV the user downloads and uploads (never API
 * keys). The parsers and the totals are pure; only fetchPolymarketPnl does I/O. It shows the user's own numbers and
 * nothing else: no suggestions.
 *
 * Realized P&L is cash out minus cash in, using average cost for what is still held:
 *   per market, realized = (sells + redemptions + merges + rewards) − (buys + splits) − fees + cost basis still held.
 * Open positions are valued at the venue's current price when it gives one (Polymarket); Kalshi's CSV has no
 * current prices, so open Kalshi positions show their cost. */
import { PolymarketClient, readActivity, readPositions, type PolymarketActivity, type PolymarketPosition } from "./exchanges/polymarket";

/** Largest Kalshi CSV accepted, in characters. */
export const MAX_CSV_CHARS = 5_000_000;
/** Largest number of CSV rows read. */
export const MAX_CSV_ROWS = 50_000;
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

/** RFC 4180 CSV: quoted fields, doubled quotes, CRLF or LF, a leading BOM. */
export function parseCsv(text: string, maxRows = MAX_CSV_ROWS): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some(f => f.trim() !== "")) out.push(row);
      row = [];
      if (out.length > maxRows) break;
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some(f => f.trim() !== "")) out.push(row); }
  return out;
}

const norm = (h: string): string => h.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Header aliases for each field (normalised: lower case, letters and digits only). Kalshi's export format is not
 *  documented publicly; these cover the names seen in its trade, settlement and account-history downloads. */
export const KALSHI_COLUMNS = {
  ticker: ["ticker", "marketticker", "market", "contractticker", "markettickerid"],
  title: ["title", "markettitle", "eventtitle", "event", "description", "marketname"],
  type: ["type", "transactiontype", "activitytype", "kind", "category"],
  action: ["action", "buysell", "tradeaction", "ordertype", "orderaction"],
  side: ["side", "direction", "position", "outcome", "contractside"],
  contracts: ["contracts", "count", "quantity", "qty", "size", "filledcount", "contractcount"],
  price: ["price", "averageprice", "avgprice", "fillprice", "pricecents", "priceperc", "yesprice", "tradeprice"],
  amount: ["amount", "total", "totalcost", "cost", "value", "proceeds", "cash", "revenue", "realizedrevenue", "payout", "notional"],
  fee: ["fee", "fees", "tradingfee", "tradingfees", "feecost", "feescost"],
  pnl: ["realizedpnl", "realizedprofit", "pnl", "profit", "profitloss", "realizedprofitloss", "netprofit"],
} as const;
type Col = keyof typeof KALSHI_COLUMNS;

/** A dollar or cent amount: "$1,234.50", "(12.00)", "-3", "45¢". */
export function money(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  let s = raw.trim();
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-") || s.startsWith("−");
  const cents = /¢|c$/i.test(s);
  s = s.replace(/[()$,¢\s−+-]/g, "").replace(/c$/i, "");
  const v = Number(s);
  if (!Number.isFinite(v)) return null;
  return (neg ? -v : v) / (cents ? 100 : 1);
}

/** A price per contract as dollars 0..1: values above 1 are cents. */
const priceDollars = (v: number | null): number | null => (v === null ? null : v > 1 ? v / 100 : v);

export interface KalshiRow {
  ticker: string;
  title: string | null;
  kind: "buy" | "sell" | "settlement" | "other";
  side: "yes" | "no" | null;
  contracts: number | null;
  price: number | null;
  /** Cash amount in the row (absolute), dollars. */
  amount: number | null;
  fee: number;
  pnl: number | null;
}

function kindOf(type: string, action: string): KalshiRow["kind"] {
  const t = `${type} ${action}`.toLowerCase();
  if (/settle|payout|resolution|redeem|expir/.test(t)) return "settlement";
  if (/\bsell|\bsold|close/.test(t)) return "sell";
  if (/\bbuy|\bbought|open|trade|fill|order/.test(t)) return "buy";
  return "other";
}

/** The rows of a Kalshi CSV. Pure. */
export function readKalshiCsv(text: string): { rows: KalshiRow[]; skipped: number; error: string | null } {
  if (text.length > MAX_CSV_CHARS) return { rows: [], skipped: 0, error: "That file is too large." };
  const table = parseCsv(text);
  const header = table[0];
  if (!header) return { rows: [], skipped: 0, error: "The file is empty." };
  const idx: Partial<Record<Col, number>> = {};
  const names = header.map(norm);
  for (const col of Object.keys(KALSHI_COLUMNS) as Col[]) {
    const i = names.findIndex(n => (KALSHI_COLUMNS[col] as readonly string[]).includes(n));
    if (i >= 0) idx[col] = i;
  }
  if (idx.ticker === undefined) return { rows: [], skipped: 0, error: "No market ticker column found. Upload the CSV Kalshi exports from your account history." };
  const cell = (r: string[], c: Col): string | undefined => (idx[c] === undefined ? undefined : r[idx[c] as number]?.trim());
  const rows: KalshiRow[] = [];
  let skipped = 0;
  for (const r of table.slice(1)) {
    const ticker = cell(r, "ticker");
    if (!ticker) { skipped++; continue; }
    const sideRaw = (cell(r, "side") ?? "").toLowerCase();
    const amount = money(cell(r, "amount"));
    rows.push({
      ticker,
      title: cell(r, "title") || null,
      kind: kindOf(cell(r, "type") ?? "", cell(r, "action") ?? (idx.type === undefined && idx.action === undefined ? "trade" : "")),
      side: /^y/.test(sideRaw) ? "yes" : /^n/.test(sideRaw) ? "no" : null,
      contracts: (() => { const c = money(cell(r, "contracts")); return c === null ? null : Math.abs(c); })(),
      price: priceDollars(money(cell(r, "price"))),
      amount: amount === null ? null : Math.abs(amount),
      fee: Math.abs(money(cell(r, "fee")) ?? 0),
      pnl: money(cell(r, "pnl")),
    });
  }
  return { rows, skipped, error: rows.length ? null : "No rows with a market ticker were found." };
}

/** Totals from Kalshi rows. When the file has a realized P&L column, that column is summed as written; otherwise
 *  realized is computed from the cash flows with average cost. Pure. */
export function kalshiPnl(rows: readonly KalshiRow[], skipped = 0): PnlSummary {
  const hasPnl = rows.some(r => r.pnl !== null);
  const by = new Map<string, PnlMarket & { pos: Map<string, { contracts: number; cost: number }> }>();
  for (const r of rows) {
    let m = by.get(r.ticker);
    if (!m) { m = { key: r.ticker, title: r.title ?? r.ticker, outcome: null, realized: 0, openContracts: 0, openCost: 0, openValue: null, pos: new Map() }; by.set(r.ticker, m); }
    if (r.title && m.title === r.ticker) m.title = r.title;
    const side = r.side ?? "yes";
    const p = m.pos.get(side) ?? { contracts: 0, cost: 0 };
    const n = r.contracts ?? 0;
    const cash = r.amount ?? (r.price !== null ? n * r.price : 0);
    if (r.kind === "buy") {
      p.contracts += n; p.cost += cash;
      if (!hasPnl) m.realized -= r.fee;
    } else if (r.kind === "sell" || r.kind === "settlement") {
      const sold = r.kind === "settlement" ? (r.contracts ?? p.contracts) : n;
      const avg = p.contracts > 0 ? p.cost / p.contracts : 0;
      const take = Math.min(sold, p.contracts);
      if (!hasPnl) m.realized += cash - avg * take - r.fee;
      p.contracts -= take; p.cost -= avg * take;
    }
    if (hasPnl && r.pnl !== null) m.realized += r.pnl;
    m.pos.set(side, p);
  }
  const markets: PnlMarket[] = [...by.values()].map(({ pos, ...m }) => {
    const open = [...pos.entries()].filter(([, p]) => p.contracts > DUST_CONTRACTS);
    return { ...m, openContracts: open.reduce((a, [, p]) => a + p.contracts, 0), openCost: open.reduce((a, [, p]) => a + p.cost, 0),
      outcome: open.length ? open.map(([s]) => s.toUpperCase()).join(", ") : null, openValue: open.length ? null : 0 };
  });
  return finish("kalshi", markets, rows.length, skipped, false);
}

export function kalshiPnlFromCsv(text: string): { summary: PnlSummary | null; error: string | null } {
  const { rows, skipped, error } = readKalshiCsv(text);
  return error ? { summary: null, error } : { summary: kalshiPnl(rows, skipped), error: null };
}
