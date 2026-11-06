/* The Cluster & Whale Stream rules (docs/RESEARCH-DESK.md §7), version RULE_VERSION. Pure functions over stored
 * filings; the poller runs them at ingestion so reads cost nothing. A match describes what was filed, never what a
 * price will do, and carries the raw figures only: no score, no ranking.
 *
 *   Cluster   at one company, 2+ distinct owner groups with code-P purchases (non-derivative, acquired) whose
 *             transaction dates fall in the same calendar week (Monday–Sunday). Owners named on one filing count as
 *             one group (joint filers: a fund and its general partner). Amendments (4/A) are left out.
 *   Whale     one original Form 4 whose code-P lines sum to $1,000,000.00 or more, shares × price as filed.
 *   Velocity  5+ Form 4s (4/A included) accepted at one company in the trailing 7 days, and at least 3× that
 *             company's mean weekly count before the window (mean floored at 1), measured over the weeks Insidir has
 *             been collecting (8 needed, up to 52). Not repeated for the same company within 14 days. */
import type { AnomalyFacts, AnomalyKind, FiledLine, FilingRow, Form4Payload } from "./types";

export const RULE_VERSION = 1;
export const WHALE_MIN = 1_000_000;
export const CLUSTER_MIN_GROUPS = 2;
export const VELOCITY_MIN = 5;
export const VELOCITY_MULTIPLE = 3;
export const VELOCITY_MIN_WEEKS = 8;
export const VELOCITY_MAX_WEEKS = 52;
export const VELOCITY_QUIET_DAYS = 14;
const DAY = 86_400_000, WEEK = 7 * DAY;

export interface AnomalyDraft {
  key: string; kind: AnomalyKind; cik: string; ticker: string | null; company: string;
  windowStart: string; windowEnd: string; total: number | null; facts: AnomalyFacts;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const isBuy = (l: FiledLine): l is FiledLine & { shares: number; price: number; value: number } =>
  l.code === "P" && l.ad === "A" && l.value !== null && l.price !== null && l.shares !== null && l.shares > 0;
const f4 = (f: FilingRow): Form4Payload | null => (f.form === "4" && f.payload.kind === "4" && !f.payload.unparsed ? f.payload : null);
const groupKey = (p: Form4Payload): string => p.owners.map(o => o.cik ?? o.name.toUpperCase()).sort().join("+");

/** The Monday ("YYYY-MM-DD") of a date's week. */
export function weekOf(date: string): string {
  const d = Date.parse(`${date}T00:00:00Z`);
  const dow = (new Date(d).getUTCDay() + 6) % 7; // Monday 0
  return new Date(d - dow * DAY).toISOString().slice(0, 10);
}
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

function buysOf(f: FilingRow, p: Form4Payload, only?: (l: FiledLine) => boolean) {
  const owners = p.owners.map(o => o.name);
  const role = p.owners.map(o => o.role).filter(Boolean).join("; ") || "Reporting owner";
  return p.lines.filter(isBuy).filter(l => !only || only(l)).map(l => ({ accession: f.accession, owners, role, date: l.date, shares: l.shares, price: l.price, value: l.value, url: f.url }));
}

/** Whale purchase: one filing, code-P total ≥ $1M. */
export function whaleOf(f: FilingRow): AnomalyDraft | null {
  const p = f4(f);
  if (!p) return null;
  const buys = buysOf(f, p);
  const total = round2(buys.reduce((s, b) => s + b.value, 0));
  if (total < WHALE_MIN) return null;
  const dates = buys.map(b => b.date).filter((d): d is string => Boolean(d)).sort();
  return { key: `whale:${f.accession}`, kind: "whale", cik: f.cik, ticker: f.ticker, company: f.company,
    windowStart: dates[0] ?? f.filedOn, windowEnd: dates.at(-1) ?? f.filedOn, total, facts: { buys, groups: 1 } };
}

/** Clusters among one company's filings, one per qualifying week. Pass every original Form 4 at the company that
 *  could hold a purchase in the weeks of interest. */
export function clustersOf(filings: readonly FilingRow[]): AnomalyDraft[] {
  const weeks = new Map<string, { groups: Set<string>; buys: ReturnType<typeof buysOf>; sample: FilingRow }>();
  for (const f of filings) {
    const p = f4(f);
    if (!p) continue;
    for (const b of buysOf(f, p, l => Boolean(l.date))) {
      const w = weekOf(b.date!);
      const e = weeks.get(w) ?? { groups: new Set<string>(), buys: [], sample: f };
      e.groups.add(groupKey(p));
      e.buys.push(b);
      weeks.set(w, e);
    }
  }
  const out: AnomalyDraft[] = [];
  for (const [w, e] of [...weeks].sort(([a], [b]) => a.localeCompare(b))) {
    if (e.groups.size < CLUSTER_MIN_GROUPS) continue;
    const buys = e.buys.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.accession.localeCompare(b.accession));
    const cik = e.sample.cik;
    out.push({ key: `cluster:${cik}:${w}`, kind: "cluster", cik, ticker: filings.find(f => f.ticker)?.ticker ?? null, company: e.sample.company,
      windowStart: w, windowEnd: addDays(w, 6), total: round2(buys.reduce((s, b) => s + b.value, 0)), facts: { buys, groups: e.groups.size } });
  }
  return out;
}

export interface VelocityInput {
  cik: string; ticker: string | null; company: string; now: number;
  /** Form 4 / 4/A at the company accepted in [now − 7d, now), with their codes. */
  window: ReadonlyArray<{ codes: string[] }>;
  /** Form 4 / 4/A at the company accepted in the baseline period before the window. */
  baselineCount: number;
  /** When Insidir started collecting filings (the oldest stored acceptance). */
  collectingSince: number;
}

/** Velocity: null unless the rule holds. */
export function velocityOf(v: VelocityInput): AnomalyDraft | null {
  const start = v.now - WEEK;
  const weeks = Math.min(VELOCITY_MAX_WEEKS, Math.floor((start - v.collectingSince) / WEEK));
  if (weeks < VELOCITY_MIN_WEEKS) return null;
  const count = v.window.length;
  const mean = Math.max(1, v.baselineCount / weeks);
  if (count < VELOCITY_MIN || count < VELOCITY_MULTIPLE * mean) return null;
  const codes: Record<string, number> = {};
  for (const f of v.window) for (const c of f.codes) codes[c] = (codes[c] ?? 0) + 1;
  const day = new Date(v.now).toISOString().slice(0, 10);
  return { key: `velocity:${v.cik}:${day}`, kind: "velocity", cik: v.cik, ticker: v.ticker, company: v.company,
    windowStart: new Date(start).toISOString().slice(0, 10), windowEnd: day, total: null,
    facts: { count, weeklyMean: Math.round((v.baselineCount / weeks) * 10) / 10, baselineWeeks: weeks, codes } };
}

/** The baseline period velocity compares against: the `weeks` before the trailing 7 days. */
export function velocityBaseline(now: number, collectingSince: number): { from: number; to: number; weeks: number } {
  const to = now - WEEK;
  const weeks = Math.max(0, Math.min(VELOCITY_MAX_WEEKS, Math.floor((to - collectingSince) / WEEK)));
  return { from: to - weeks * WEEK, to, weeks };
}
