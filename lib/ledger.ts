/* The Receipts ledger: every deal we've flagged, as it looked when found, and how it settled. Pure helpers (summary,
 * cumulative "$500 per green deal" series, filters, CSV) plus the server reads. The paywall is decided here, once,
 * for the page and the CSV alike: visitors and free members see the public 7-day window on their delayed clock (a
 * deal the free feed hasn't shown yet is never listed); Insidir members see 7 days live; Pro sees all of it. Region
 * always applies (US viewers never see international Polymarket). */
import { and, desc, eq, gte, or, type SQL } from "drizzle-orm";
import { getDb, hasDatabase } from "@/lib/db";
import { markets, opportunities, receipts } from "@/lib/db/schema";
import { followGreen, type BacktestResult } from "@/lib/engines/receipts";
import { marketKey } from "@/lib/engines/common";
import { median } from "@/lib/live/stats";
import { entitlements } from "@/lib/plans";
import { allowedVenues, venuesOk } from "@/lib/region";
import type { Opportunity, Plan, Region, Venue } from "@/lib/types";

export const FOLLOW_STAKE = 500;
export const DAY_MS = 86_400_000;
/** How many rows the page renders; the CSV carries every match. */
export const PAGE_ROWS = 200;

export type Period = "7d" | "30d" | "all";
export const PERIODS: ReadonlyArray<{ key: Period; label: string; days: number | null }> = [
  { key: "7d", label: "7 days", days: 7 }, { key: "30d", label: "30 days", days: 30 }, { key: "all", label: "All time", days: null },
];
export type ResultFilter = "all" | "won" | "differently" | "open";
export type Outcome = "open" | "won" | "differently";

export interface LedgerRow {
  id: number;
  oppId: string;
  snapshot: Opportunity;
  detectedAt: number;
  settledAt: number | null;
  sameWay: boolean | null;
  realizedProfit: number | null;
  /** Each leg's market result, keyed `${venue}:${marketId}`; null until settled. */
  results: Record<string, "yes" | "no" | "void"> | null;
  /** How long the deal stayed open (last seen − first seen), only once it has closed. */
  lifeMs: number | null;
}

export const isSettled = (r: Pick<LedgerRow, "settledAt" | "realizedProfit">): boolean => r.settledAt !== null && r.realizedProfit !== null;
export const outcomeOf = (r: LedgerRow): Outcome => (!isSettled(r) ? "open" : r.sameWay === true ? "won" : "differently");

/* ---------- who may see what ---------- */

export interface Access {
  /** Periods this viewer may open; the rest are shown locked. */
  periods: Period[];
  /** Oldest detection this viewer may see (ms), null = all time. */
  sinceMs: number | null;
  /** Newest detection this viewer may see: their clock (free: 30 minutes late). */
  untilMs: number;
}

export function accessFor(plan: Plan, now: number): Access {
  const ent = entitlements(plan);
  return ent.fullHistory
    ? { periods: ["7d", "30d", "all"], sinceMs: null, untilMs: now }
    : { periods: ["7d"], sinceMs: now - 7 * DAY_MS, untilMs: now - ent.feedDelayMinutes * 60_000 };
}

/** The rows a viewer may see at all: their window, their clock, their region; locks only (no second opinions). */
export function visibleTo(rows: readonly LedgerRow[], access: Access, region: Region | null): LedgerRow[] {
  const venues: Venue[] = allowedVenues(region);
  return rows.filter(r => r.snapshot.kind !== "second_opinion" && venuesOk(r.snapshot, venues)
    && r.detectedAt <= access.untilMs && (access.sinceMs === null || r.detectedAt >= access.sinceMs));
}

export const periodRows = (rows: readonly LedgerRow[], period: Period, now: number): LedgerRow[] => {
  const days = PERIODS.find(p => p.key === period)?.days ?? null;
  return days === null ? [...rows] : rows.filter(r => r.detectedAt >= now - days * DAY_MS);
};

/* ---------- filters (search params) ---------- */

export interface Filters { result: ResultFilter; category: string; from: string; to: string }

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const one = (v: string | string[] | undefined): string => (Array.isArray(v) ? v[0] ?? "" : v ?? "");

export function readFilters(p: Record<string, string | string[] | undefined>): Filters {
  const result = one(p.result);
  return {
    result: result === "won" || result === "differently" || result === "open" ? result : "all",
    category: one(p.category).slice(0, 40),
    from: DATE.test(one(p.from)) ? one(p.from) : "",
    to: DATE.test(one(p.to)) ? one(p.to) : "",
  };
}

export const readPeriod = (v: string | string[] | undefined): Period => {
  const s = one(v);
  return s === "30d" || s === "all" ? s : "7d";
};

export function applyFilters(rows: readonly LedgerRow[], f: Filters): LedgerRow[] {
  const from = f.from ? Date.parse(f.from + "T00:00:00Z") : null;
  const to = f.to ? Date.parse(f.to + "T00:00:00Z") + DAY_MS : null;
  return rows.filter(r => (f.result === "all" || outcomeOf(r) === f.result)
    && (!f.category || r.snapshot.categories.includes(f.category))
    && (from === null || r.detectedAt >= from) && (to === null || r.detectedAt < to));
}

export const categoriesOf = (rows: readonly LedgerRow[]): string[] => [...new Set(rows.flatMap(r => r.snapshot.categories))].sort();

/* ---------- the summary row ---------- */

export interface Summary {
  flagged: number;
  settled: number;
  /** "$500 per green deal", after fees; null when no green deal has settled. */
  follow: BacktestResult | null;
  /** Settled the same way / settled; null when nothing settled. */
  winRate: number | null;
  /** Median minutes a deal stayed open; null when none has closed. */
  medianLifeMin: number | null;
}

const asReceipt = (r: LedgerRow) => ({
  opp: r.snapshot,
  settlement: isSettled(r)
    ? { settled: true, sameWay: r.sameWay === true, realizedPayout: 0, realizedProfit: r.realizedProfit ?? 0 }
    : { settled: false, sameWay: false, realizedPayout: 0, realizedProfit: 0 },
});

export function summary(rows: readonly LedgerRow[], stake = FOLLOW_STAKE): Summary {
  const settled = rows.filter(isSettled);
  const won = settled.filter(r => r.sameWay === true).length;
  const follow = followGreen(rows.map(asReceipt), stake);
  const lives = rows.map(r => r.lifeMs).filter((x): x is number => x !== null && x >= 0).map(ms => ms / 60_000);
  return {
    flagged: rows.length, settled: settled.length, follow: follow.count > 0 ? follow : null,
    winRate: settled.length ? won / settled.length : null, medianLifeMin: median(lives),
  };
}

/* ---------- the cumulative "$500 per green deal" line ---------- */

export interface Point { at: number; value: number; id: number; title: string }

/** One point per settled green lock, by settle time: the running total of its realized profit, scaled to $500 (capped
 *  at what was fillable when found), exactly as followGreen counts it. */
export function cumulative(rows: readonly LedgerRow[], stake = FOLLOW_STAKE): Point[] {
  const out: Point[] = [];
  let sum = 0;
  const green = rows.filter(r => isSettled(r) && r.snapshot.safety === "green" && r.snapshot.kind !== "second_opinion")
    .sort((a, b) => (a.settledAt ?? 0) - (b.settledAt ?? 0) || a.id - b.id);
  for (const r of green) {
    const outlay = r.snapshot.cost + r.snapshot.fees;
    if (!(outlay > 0)) continue;
    sum += (r.realizedProfit ?? 0) * (Math.min(stake, outlay) / outlay);
    out.push({ at: r.settledAt ?? r.detectedAt, value: Math.round(sum * 100) / 100, id: r.id, title: r.snapshot.title });
  }
  return out;
}

/* ---------- formatting: same decimals in a column ---------- */

export const pct2 = (v: number): string => (v * 100).toFixed(2) + "%";
export const usd2 = (v: number): string => (v < 0 ? "−" : "") + "$" + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const signedUsd2 = (v: number): string => (v > 0 ? "+" : "") + usd2(v);
export const cents1 = (p: number): string => (Math.round(p * 1000) / 10).toFixed(1) + "¢";
export const receiptId = (id: number): string => "R-" + String(id).padStart(6, "0");
export function utcStamp(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`;
}
export const outlayOf = (o: Opportunity): number => o.cost + o.fees;
/** "YES Kalshi 55.0¢ + NO Polymarket US 40.0¢" */
export const pricesText = (o: Opportunity, names: Record<Venue, string>): string =>
  o.legs.map(l => `${l.side.toUpperCase()} ${names[l.venue]} ${cents1(l.avgPrice)}`).join(" + ");
export const outcomeText = (r: LedgerRow): string => {
  const o = outcomeOf(r);
  return o === "open" ? "Open" : o === "won" ? `Same way, ${signedUsd2(r.realizedProfit ?? 0)}` : `Settled differently, ${signedUsd2(r.realizedProfit ?? 0)}`;
};
export const rulesCheckText = (r: LedgerRow): "Passed" | "Failed" | "Pending" => {
  const o = outcomeOf(r);
  return o === "open" ? "Pending" : o === "won" ? "Passed" : "Failed";
};

/* ---------- CSV (RFC 4180) ---------- */

export function csvField(v: string | number | null): string {
  const s = v === null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const CSV_HEADER = ["receipt_id", "found_at_utc", "event", "safety", "categories", "prices_at_detection", "fillable_size_usd",
  "profit_after_fees_usd", "roi", "settled_at_utc", "outcome", "realized_profit_usd", "same_rules_check"];

export function toCsv(rows: readonly LedgerRow[], names: Record<Venue, string>): string {
  const lines = [CSV_HEADER.join(",")];
  for (const r of rows) {
    const o = r.snapshot;
    lines.push([
      receiptId(r.id), new Date(r.detectedAt).toISOString(), o.title, o.safety, o.categories.join(";"), pricesText(o, names),
      outlayOf(o).toFixed(2), o.profit.toFixed(2), (o.roi * 100).toFixed(2) + "%",
      r.settledAt === null ? "" : new Date(r.settledAt).toISOString(), outcomeOf(r),
      r.realizedProfit === null ? "" : r.realizedProfit.toFixed(2), rulesCheckText(r).toLowerCase(),
    ].map(csvField).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

/* ---------- server reads ---------- */

/** Receipts with the deal's open life, newest first. `sinceMs` null = all time. */
export async function ledgerRows(sinceMs: number | null, untilMs: number): Promise<LedgerRow[]> {
  if (!hasDatabase()) return [];
  try {
    const where: SQL[] = [];
    if (sinceMs !== null) where.push(gte(receipts.detectedAt, new Date(sinceMs)));
    const rows = await getDb().select({ r: receipts, first: opportunities.firstSeenAt, last: opportunities.lastSeenAt, active: opportunities.active })
      .from(receipts).leftJoin(opportunities, eq(opportunities.id, receipts.oppId))
      .where(where.length ? and(...where) : undefined).orderBy(desc(receipts.detectedAt), desc(receipts.id)).limit(20_000);
    return rows.filter(x => x.r.detectedAt.getTime() <= untilMs).map(({ r, first, last, active }) => ({
      id: r.id, oppId: r.oppId, snapshot: r.snapshot, detectedAt: r.detectedAt.getTime(), settledAt: r.settledAt?.getTime() ?? null,
      sameWay: r.sameWay, realizedProfit: r.realizedProfit, results: r.results ?? null,
      lifeMs: first && last && active === false ? Math.max(0, last.getTime() - first.getTime()) : null,
    }));
  } catch (e) {
    console.error("ledgerRows failed:", e instanceof Error ? e.message : e);
    return [];
  }
}

/** Each leg's published rule text, keyed by marketKey, for the markets we still have. */
export async function rulesFor(legs: ReadonlyArray<{ venue: Venue; marketId: string }>): Promise<Record<string, string>> {
  if (!hasDatabase() || !legs.length) return {};
  try {
    const conds = legs.map(l => and(eq(markets.venue, l.venue), eq(markets.id, l.marketId))!);
    const rows = await getDb().select({ venue: markets.venue, id: markets.id, data: markets.data }).from(markets).where(or(...conds));
    const out: Record<string, string> = {};
    for (const m of rows) if (m.data.rules) out[marketKey(m.venue, m.id)] = m.data.rules;
    return out;
  } catch { return {}; }
}


export interface Ledger {
  access: Access;
  period: Period;
  filters: Filters;
  /** Everything in the period this viewer may see (the summary and the chart use these). */
  periodRows: LedgerRow[];
  /** After the filters (the table and the CSV use these). */
  rows: LedgerRow[];
  categories: string[];
}

/** The page's and the CSV's one source: the viewer's rows for a period, then the filters. A locked period falls
 *  back to the widest one the viewer may open. */
export async function loadLedger(plan: Plan, region: Region | null, params: Record<string, string | string[] | undefined>, now: number): Promise<Ledger> {
  const access = accessFor(plan, now);
  const asked = readPeriod(params.period);
  const period = access.periods.includes(asked) ? asked : access.periods[access.periods.length - 1]!;
  const filters = readFilters(params);
  const all = visibleTo(await ledgerRows(access.sinceMs, access.untilMs), access, region);
  const inPeriod = periodRows(all, period, now);
  return { access, period, filters, periodRows: inPeriod, rows: applyFilters(inPeriod, filters), categories: categoriesOf(inPeriod) };
}

/* ---------- the data visuals (histogram, heatmap) ---------- */

/** Charts need a week of history before they say anything: under 7 days of data, they're hidden. */
export const CHART_MIN_DAYS = 7;

/** When the first receipt was recorded (all time), or null with none. */
export async function dataSince(): Promise<number | null> {
  if (!hasDatabase()) return null;
  try {
    const r = await getDb().select({ at: receipts.detectedAt }).from(receipts).orderBy(receipts.detectedAt).limit(1);
    return r[0]?.at.getTime() ?? null;
  } catch { return null; }
}

/** Deal lifetimes in buckets (minutes): [0,2), [2,5), [5,10), [10,20), [20,30), [30,60), [60,120), 120+. */
export const LIFE_BUCKETS: ReadonlyArray<{ lo: number; hi: number | null; label: string }> = [
  { lo: 0, hi: 2, label: "<2m" }, { lo: 2, hi: 5, label: "2–5m" }, { lo: 5, hi: 10, label: "5–10m" }, { lo: 10, hi: 20, label: "10–20m" },
  { lo: 20, hi: 30, label: "20–30m" }, { lo: 30, hi: 60, label: "30–60m" }, { lo: 60, hi: 120, label: "1–2h" }, { lo: 120, hi: null, label: "2h+" },
];
export function lifeHistogram(rows: readonly LedgerRow[]): { counts: number[]; medianMin: number | null; n: number } {
  const lives = rows.map(r => r.lifeMs).filter((x): x is number => x !== null && x >= 0).map(ms => ms / 60_000);
  const counts = LIFE_BUCKETS.map(b => lives.filter(m => m >= b.lo && (b.hi === null || m < b.hi)).length);
  return { counts, medianMin: median(lives), n: lives.length };
}

/** Deals found per (UTC day of week, hour): 7 rows (Mon..Sun) × 24 columns. */
export function whenGrid(rows: readonly LedgerRow[]): { grid: number[][]; max: number; n: number } {
  const grid = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const r of rows) {
    const d = new Date(r.detectedAt);
    grid[(d.getUTCDay() + 6) % 7]![d.getUTCHours()]! += 1;
  }
  return { grid, max: Math.max(0, ...grid.flat()), n: rows.length };
}
