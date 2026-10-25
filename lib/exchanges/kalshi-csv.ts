/* Parse a Kalshi account CSV export (trades / fills and settlements) for the P&L page. Pure: text in, typed rows
 * out. Never asks for, reads or stores API keys: the user downloads the CSV from Kalshi and uploads it.
 *
 * Kalshi's export format is not documented publicly and has changed over time, so headers are matched leniently
 * (case, spaces, punctuation ignored) against the aliases below, which cover the export's human-readable names
 * and the Trade API's field names (fills: ticker, side, action, count, yes_price, no_price, created_time;
 * settlements: ticker, market_result, yes_count, no_count, yes_total_cost, no_total_cost, revenue, settled_time).
 *
 * Units: prices are dollars (0..1); a price above 1 is read as cents. Money columns are dollars, unless the header
 * says cents ("fee_cents", "Revenue (cents)"); "$1,234.50" style values are fine. Times: ISO, "YYYY-MM-DD HH:MM[:SS]"
 * (read as UTC when no zone is given), "MM/DD/YYYY", or epoch seconds / milliseconds. */
import type { Side } from "@/lib/types";
import { num } from "./parse";

/** Column aliases (normalised: lower case, letters and digits only). First match wins. */
export const COLUMN_ALIASES = {
  ticker: ["ticker", "marketticker", "market", "contract", "contractticker", "symbol"],
  title: ["title", "markettitle", "marketname", "eventtitle", "description"],
  type: ["type", "transactiontype", "recordtype", "activity", "activitytype", "kind", "category"],
  side: ["side", "position", "contractside", "yesno", "outcome"],
  action: ["action", "direction", "buysell", "orderside", "tradeside", "ordertype"],
  contracts: ["count", "contracts", "quantity", "qty", "size", "shares", "filledcount", "filled", "numberofcontracts"],
  price: ["price", "avgprice", "averageprice", "fillprice", "entryprice", "priceperContract".toLowerCase(), "pricecents", "pricedollars"],
  yesPrice: ["yesprice", "yespricecents", "yespricedollars"],
  noPrice: ["noprice", "nopricecents", "nopricedollars"],
  fee: ["fee", "fees", "tradingfee", "feecost", "feecents", "feedollars", "fees$"],
  timestamp: ["createdtime", "created", "createdat", "date", "time", "timestamp", "datetime", "executedat", "tradedate", "settledtime", "settledat", "settlementdate", "filledat"],
  result: ["marketresult", "result", "settlementresult", "resolution", "settledas"],
  revenue: ["revenue", "payout", "proceeds", "settlementvalue", "settlementamount", "amount", "value", "revenuecents"],
  cost: ["cost", "totalcost", "costbasis", "costcents"],
  profit: ["profit", "pnl", "realizedpnl", "realizedprofit", "netprofit", "net", "profitloss"],
  yesContracts: ["yescount", "yescontracts"],
  noContracts: ["nocount", "nocontracts"],
  yesCost: ["yestotalcost", "yescost"],
  noCost: ["nototalcost", "nocost"],
  id: ["tradeid", "fillid", "orderid", "id", "transactionid"],
} as const;

export type CsvField = keyof typeof COLUMN_ALIASES;

export interface KalshiCsvTrade {
  kind: "trade";
  /** 1-based line number in the file. */
  line: number;
  ticker: string;
  title: string | null;
  side: Side;
  action: "buy" | "sell";
  contracts: number;
  /** Dollars per contract of `side`, 0..1. */
  price: number;
  /** Dollars, when the export states it. */
  fee: number | null;
  timestamp: number | null;
  id: string | null;
}

export interface KalshiCsvSettlement {
  kind: "settlement";
  line: number;
  ticker: string;
  title: string | null;
  result: Side | "void" | null;
  /** Total contracts settled (yes + no when stated separately). */
  contracts: number | null;
  yesContracts: number | null;
  noContracts: number | null;
  /** Dollars. */
  cost: number | null;
  revenue: number | null;
  profit: number | null;
  fee: number | null;
  timestamp: number | null;
}

export interface KalshiCsvResult {
  trades: KalshiCsvTrade[];
  settlements: KalshiCsvSettlement[];
  /** Rows that were not trades or settlements (deposits, withdrawals) or could not be read, with the reason. */
  skipped: Array<{ line: number; reason: string }>;
  /** Which header each field was read from (null when absent), so the page can show what was understood. */
  columns: Record<CsvField, string | null>;
}

/** RFC 4180-ish CSV: quoted fields, doubled quotes, CRLF or LF, a leading BOM. Returns rows with line numbers. */
export function parseCsv(text: string): Array<{ line: number; cells: string[] }> {
  const out: Array<{ line: number; cells: string[] }> = [];
  const s = text.replace(/^﻿/, "");
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i] as string;
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else {
        if (c === "\n") line++;
        cell += c;
      }
      continue;
    }
    if (c === '"' && cell === "") quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some(x => x.trim() !== "")) out.push({ line: rowLine, cells: row });
      row = [];
      cell = "";
      line++;
      rowLine = line;
    } else cell += c;
  }
  row.push(cell);
  if (row.some(x => x.trim() !== "")) out.push({ line: rowLine, cells: row });
  return out;
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9$]/g, "");

/** Header → field mapping. */
export function mapColumns(headers: readonly string[]): { index: Partial<Record<CsvField, number>>; columns: Record<CsvField, string | null> } {
  const normed = headers.map(norm);
  const index: Partial<Record<CsvField, number>> = {};
  const columns = {} as Record<CsvField, string | null>;
  const used = new Set<number>();
  // Specific fields first so "yes_price" is not taken by "price", "market_result" not by "market".
  const order: CsvField[] = ["yesPrice", "noPrice", "yesContracts", "noContracts", "yesCost", "noCost", "result", "title", "ticker", "type", "side", "action", "contracts", "price", "fee", "timestamp", "revenue", "cost", "profit", "id"];
  for (const f of order) {
    let found = -1;
    for (const alias of COLUMN_ALIASES[f]) {
      found = normed.findIndex((h, i) => !used.has(i) && h === alias);
      if (found >= 0) break;
    }
    if (found >= 0) {
      used.add(found);
      index[f] = found;
    }
    columns[f] = found >= 0 ? (headers[found] ?? null) : null;
  }
  return { index, columns };
}

/** Epoch ms from the formats listed at the top; null when unreadable. Zone-less times are UTC (pure). */
export function parseTime(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  if (/^\d{9,13}(\.\d+)?$/.test(s)) {
    const n = Number(s);
    return n > 1e12 ? Math.floor(n) : Math.floor(n * 1000);
  }
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i.exec(s);
  if (us) {
    let h = Number(us[4] ?? 0);
    const ampm = us[7]?.toUpperCase();
    if (ampm === "PM" && h < 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    return Date.UTC(Number(us[3]), Number(us[1]) - 1, Number(us[2]), h, Number(us[5] ?? 0), Number(us[6] ?? 0));
  }
  const iso = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?)?$/.test(s) ? `${s.replace(" ", "T")}${s.length > 10 ? "Z" : "T00:00:00Z"}` : s;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function readSide(...vals: Array<string | undefined>): Side | null {
  for (const v of vals) {
    const s = v?.toLowerCase() ?? "";
    if (/\byes\b/.test(s)) return "yes";
    if (/\bno\b/.test(s)) return "no";
  }
  return null;
}

function readAction(...vals: Array<string | undefined>): "buy" | "sell" | null {
  for (const v of vals) {
    const s = v?.toLowerCase() ?? "";
    if (/\b(buy|bought|open|opened)\b/.test(s)) return "buy";
    if (/\b(sell|sold|close|closed)\b/.test(s)) return "sell";
  }
  return null;
}

function readResult(v: string | undefined): Side | "void" | null {
  const s = v?.trim().toLowerCase() ?? "";
  if (s === "yes" || s === "y") return "yes";
  if (s === "no" || s === "n") return "no";
  if (/void|cancel|refund/.test(s)) return "void";
  return null;
}

/** A price as dollars 0..1 (a value above 1, or a "¢" suffix, is cents). */
function readPrice(v: string | undefined, header: string | null): number | null {
  if (v === undefined) return null;
  const cents = /¢/.test(v) || /cent/i.test(header ?? "");
  const n = num(v.replace(/[¢\s]/g, ""));
  if (n === null) return null;
  const p = cents || n > 1 ? n / 100 : n;
  return p >= 0 && p <= 1 ? p : null;
}

/** Money in dollars ("-$1,234.50", "(12.30)" negative); cents when the header says so. */
function readMoney(v: string | undefined, header: string | null): number | null {
  if (v === undefined) return null;
  let s = v.trim();
  let sign = 1;
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    sign *= -1;
    s = s.slice(1);
  }
  const n = num(s.replace(/^\$/, ""));
  if (n === null) return null;
  return (sign * n) / (/cent/i.test(header ?? "") ? 100 : 1);
}

/** Parse a Kalshi CSV export. Never throws; unreadable rows go to `skipped`. */
export function parseKalshiCsv(text: string): KalshiCsvResult {
  const table = parseCsv(text);
  const header = table[0];
  const empty: KalshiCsvResult = { trades: [], settlements: [], skipped: [], columns: mapColumns([]).columns };
  if (!header) return empty;
  const { index, columns } = mapColumns(header.cells.map(c => c.trim()));
  const res: KalshiCsvResult = { trades: [], settlements: [], skipped: [], columns };
  if (index.ticker === undefined) {
    res.skipped.push({ line: header.line, reason: "no ticker column found in the header" });
    return res;
  }
  for (const { line, cells } of table.slice(1)) {
    const get = (f: CsvField): string | undefined => {
      const i = index[f];
      const v = i === undefined ? undefined : cells[i]?.trim();
      return v === "" ? undefined : v;
    };
    const ticker = get("ticker");
    if (!ticker) {
      res.skipped.push({ line, reason: "no ticker" });
      continue;
    }
    const type = get("type")?.toLowerCase() ?? "";
    const title = get("title") ?? null;
    const timestamp = parseTime(get("timestamp") ?? "");
    const fee = readMoney(get("fee"), columns.fee);

    const isSettlement = /settle|payout|resolv|expir/.test(type) || (!type && get("price") === undefined && get("yesPrice") === undefined && (get("result") !== undefined || get("revenue") !== undefined));
    const isTrade = !isSettlement && (/trade|fill|order|buy|sell/.test(type) || !type);
    if (isSettlement) {
      const yesContracts = num(get("yesContracts"));
      const noContracts = num(get("noContracts"));
      const contracts = num(get("contracts")) ?? (yesContracts !== null || noContracts !== null ? (yesContracts ?? 0) + (noContracts ?? 0) : null);
      const yesCost = readMoney(get("yesCost"), columns.yesCost);
      const noCost = readMoney(get("noCost"), columns.noCost);
      const cost = readMoney(get("cost"), columns.cost) ?? (yesCost !== null || noCost !== null ? (yesCost ?? 0) + (noCost ?? 0) : null);
      const revenue = readMoney(get("revenue"), columns.revenue);
      const stated = readMoney(get("profit"), columns.profit);
      res.settlements.push({
        kind: "settlement",
        line,
        ticker,
        title,
        result: readResult(get("result")),
        contracts,
        yesContracts,
        noContracts,
        cost,
        revenue,
        profit: stated ?? (revenue !== null && cost !== null ? revenue - cost - (fee ?? 0) : null),
        fee,
        timestamp,
      });
      continue;
    }
    if (!isTrade) {
      res.skipped.push({ line, reason: `not a trade or settlement (${type})` });
      continue;
    }
    const side = readSide(get("side"), get("action"), type);
    const action = readAction(get("action"), type, get("side")) ?? "buy";
    const contracts = num(get("contracts"));
    const price =
      readPrice(get("price"), columns.price) ??
      (side === "yes" ? readPrice(get("yesPrice"), columns.yesPrice) : side === "no" ? readPrice(get("noPrice"), columns.noPrice) : null);
    if (!side) {
      res.skipped.push({ line, reason: "no yes/no side" });
      continue;
    }
    if (contracts === null || contracts <= 0) {
      res.skipped.push({ line, reason: "no contract count" });
      continue;
    }
    if (price === null) {
      res.skipped.push({ line, reason: "no price" });
      continue;
    }
    res.trades.push({ kind: "trade", line, ticker, title, side, action, contracts, price, fee, timestamp, id: get("id") ?? null });
  }
  return res;
}
