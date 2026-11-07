/* The public preview on /edgar (docs/RESEARCH-DESK.md): the last 72 hours of open-market Form 4 trades (codes P and
 * S), 8-Ks and Stream matches, cut to a compact shape and computed at most once every PREVIEW_MS per server instance.
 * The page that embeds it is regenerated on the same clock (ISR) and its JSON is CDN-cacheable, so a visitor costs no
 * database read. Source-document links are left out: opening a filing is a member feature. Facts as filed only. */
import { and, desc, gte, inArray, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { filingAnomalies, secFilings } from "@/lib/db/schema";
import { memo } from "@/lib/memo";
import { toRow } from "./ingest";
import { edgarHealth, type EdgarHealth } from "./store";
import type { AnomalyRow, FilingRow } from "./types";

export const PREVIEW_MS = 30_000;
export const PREVIEW_HOURS = 72;
export const PREVIEW_F4 = 300;
export const PREVIEW_8K = 80;
export const PREVIEW_MATCHES = 60;

/** One row of the preview table, compact: keys are short because the page carries hundreds of them. */
export interface PreviewRow {
  /** filings.id (stable key). */
  id: number;
  /** Ticker, or the CIK when the company has none. */
  t: string;
  /** Company as filed. */
  co: string;
  /** "4" or "8-K" (amendments are left out of the preview). */
  f: "4" | "8-K";
  /** EDGAR acceptance, epoch ms. */
  at: number;
  /** Reporting owner(s) and their relationship as filed (Form 4). */
  own: string;
  role: string;
  /** The transaction code the row is about: P (open-market purchase) or S (open-market sale). */
  code: "P" | "S" | null;
  /** Shares, average price and dollars of that code's lines, as filed. */
  sh: number;
  px: number;
  v: number;
  /** First trade date ("YYYY-MM-DD"). */
  d: string | null;
  /** 8-K item numbers. */
  items: string[];
}
export interface PreviewMatch { id: number; kind: AnomalyRow["kind"]; t: string; co: string; groups: number; total: number | null; ws: string; we: string; at: number; count: number | null }
export interface PreviewStats { f4Hour: number; f4Day: number; pDay: number; sDay: number; eightKDay: number }
export interface Preview {
  generatedAt: number; edgar: EdgarHealth | null; stats: PreviewStats; rows: PreviewRow[]; matches: PreviewMatch[];
  /** Form 4 and 4/A accepted per hour over the last 24 hours, oldest first; the last bin is the hour so far. */
  hours: number[];
}

export const EMPTY_PREVIEW = (now: number): Preview => ({ generatedAt: now, edgar: null, stats: { f4Hour: 0, f4Day: 0, pDay: 0, sDay: 0, eightKDay: 0 }, rows: [], matches: [], hours: Array(24).fill(0) });

/** Counts keyed by "hours ago" (0 = the last 60 minutes) → 24 bins, oldest first. Anything outside 0–23 is dropped. */
export function hourBins(counts: ReadonlyArray<{ ago: number; n: number }>): number[] {
  const out = Array<number>(24).fill(0);
  for (const { ago, n } of counts) if (Number.isInteger(ago) && ago >= 0 && ago < 24) out[23 - ago] = (out[23 - ago] ?? 0) + n;
  return out;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** A stored filing → its preview row; null for amendments, unparsed filings and Form 4s without open-market lines.
 *  A filing with both P and S lines becomes the code with the larger dollar total. */
export function previewRow(f: FilingRow): PreviewRow | null {
  const base = { id: f.id, t: f.ticker ?? f.cik, co: f.company, at: f.acceptedAt };
  if (f.form === "8-K" && f.payload.kind === "8-K") return { ...base, f: "8-K", own: "", role: "", code: null, sh: 0, px: 0, v: 0, d: null, items: f.payload.items };
  if (f.form !== "4" || f.payload.kind !== "4" || f.payload.unparsed) return null;
  const pick = (code: "P" | "S") => f.payload.kind === "4" ? f.payload.lines.filter(l => l.code === code && l.ad === (code === "P" ? "A" : "D") && l.value !== null && l.shares !== null && l.shares > 0) : [];
  const p = pick("P"), s = pick("S");
  const pv = p.reduce((a, l) => a + l.value!, 0), sv = s.reduce((a, l) => a + l.value!, 0);
  if (!p.length && !s.length) return null;
  const [code, lines, v] = pv >= sv && p.length ? ["P" as const, p, pv] : ["S" as const, s, sv];
  const sh = lines.reduce((a, l) => a + l.shares!, 0);
  const d = lines.map(l => l.date).filter((x): x is string => Boolean(x)).sort()[0] ?? null;
  return { ...base, f: "4", own: f.payload.owners.map(o => o.name).join(" + ") || "Reporting owner", role: f.payload.owners.map(o => o.role).join("; "),
    code, sh, px: sh ? Math.round((v / sh) * 10_000) / 10_000 : 0, v: r2(v), d, items: [] };
}

export const previewMatch = (a: AnomalyRow): PreviewMatch => ({ id: a.id, kind: a.kind, t: a.ticker ?? a.cik, co: a.company, groups: a.facts.groups ?? 1, total: a.total,
  ws: a.windowStart, we: a.windowEnd, at: a.detectedAt, count: a.facts.count ?? null });

/** The preview, shared by every visitor for PREVIEW_MS. Four indexed reads per refresh, whatever the traffic. */
export const previewFor = (db: Db, now = Date.now()): Promise<Preview> => memo("filings:preview", PREVIEW_MS, async () => {
  const since = new Date(now - PREVIEW_HOURS * 3_600_000);
  const shown = sql`not (${secFilings.payload} ? 'unparsed')`;
  const [f4, k8, matches, [counts], hourly, edgar] = await Promise.all([
    db.select().from(secFilings).where(and(gte(secFilings.acceptedAt, since), sql`${secFilings.form} = '4'`, shown,
      sql`(${secFilings.payload}->'codes') ?| array['P','S']`)).orderBy(desc(secFilings.acceptedAt)).limit(PREVIEW_F4),
    db.select().from(secFilings).where(and(gte(secFilings.acceptedAt, since), inArray(secFilings.form, ["8-K"]))).orderBy(desc(secFilings.acceptedAt)).limit(PREVIEW_8K),
    db.select().from(filingAnomalies).where(gte(filingAnomalies.detectedAt, new Date(now - 14 * 86_400_000))).orderBy(desc(filingAnomalies.detectedAt)).limit(PREVIEW_MATCHES),
    db.select({
      f4Hour: sql<number>`count(*) filter (where ${secFilings.form} in ('4','4/A') and ${secFilings.acceptedAt} >= ${new Date(now - 3_600_000)})::int`,
      f4Day: sql<number>`count(*) filter (where ${secFilings.form} in ('4','4/A'))::int`,
      pDay: sql<number>`count(*) filter (where ${secFilings.form} = '4' and (${secFilings.payload}->'codes') ? 'P')::int`,
      sDay: sql<number>`count(*) filter (where ${secFilings.form} = '4' and (${secFilings.payload}->'codes') ? 'S')::int`,
      eightKDay: sql<number>`count(*) filter (where ${secFilings.form} in ('8-K','8-K/A'))::int`,
    }).from(secFilings).where(gte(secFilings.acceptedAt, new Date(now - 86_400_000))),
    db.select({ ago: sql<number>`floor(extract(epoch from (${new Date(now)}::timestamptz - ${secFilings.acceptedAt})) / 3600)::int`, n: sql<number>`count(*)::int` })
      .from(secFilings).where(and(gte(secFilings.acceptedAt, new Date(now - 86_400_000)), inArray(secFilings.form, ["4", "4/A"]))).groupBy(sql`1`),
    edgarHealth(db).catch(() => null),
  ]);
  const rows = [...f4, ...k8].map(toRow).map(previewRow).filter((r): r is PreviewRow => r !== null).sort((a, b) => b.at - a.at);
  return {
    generatedAt: now, edgar, rows, hours: hourBins(hourly),
    stats: counts ?? { f4Hour: 0, f4Day: 0, pDay: 0, sDay: 0, eightKDay: 0 },
    matches: matches.map(m => previewMatch({ id: m.id, key: m.key, kind: m.kind, cik: m.issuerCik, ticker: m.ticker, company: m.company, windowStart: m.windowStart,
      windowEnd: m.windowEnd, total: m.total, facts: m.facts, ruleVersion: m.ruleVersion, detectedAt: m.detectedAt.getTime() })),
  };
});
