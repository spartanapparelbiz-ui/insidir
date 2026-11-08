/* The Form 4 database (docs/INSIDIR-V3.md §3 SEC filings, §4): each Form 4 or 4/A read once into terminal.filings, its
 * transaction lines into terminal.insider_trades, and amendments linked to the filing they restate.
 *
 * Amendments. A 4/A names no accession for the filing it amends, only the day it was filed (dateOfOriginalSubmission).
 * So it is matched within its group (same issuer, same reporting owners, same period of report) to the original Form 4
 * filed on that day (or, if the 4/A leaves the date out, to the group's only original). The match is used only when
 * exactly one original fits. Then, in filing order, each 4/A with transaction lines supersedes the latest version of
 * that original (the original, or an earlier 4/A of it); a 4/A with no transaction lines (a remarks-only fix) is
 * linked but supersedes nothing. A 4/A that fits no original, or more than one, is shown as filed and supersedes
 * nothing. The rule is applied to the whole group on every save, so the order filings are read in (the backfill goes
 * newest first) never changes the result. */
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { filings, insiderTrades } from "@/lib/db/schema";
import { companyName, filingIndexUrl, roleWord, type Ownership } from "./form4";
import { formOf, readOwnership, saveTrades, tradeRows, type TradeRow } from "./history";
import type { SecClient } from "./sec";

export type FilingRow = typeof filings.$inferInsert;

/** The reporting owners' CIKs, sorted and joined: "1214156,1494730". */
export const ownerKey = (o: Pick<Ownership, "owners">): string =>
  [...new Set(o.owners.map(x => (x.cik && /^\d{1,10}$/.test(x.cik) ? String(Number(x.cik)) : `name:${x.name.toLowerCase()}`)))].sort().join(",");

/** A filing's row. Pure. */
export function filingRow(o: Ownership, accession: string, filedAt: number, url: string): FilingRow {
  return {
    accession, form: formOf(o), issuerCik: String(Number(o.issuerCik)), company: companyName(o.issuerName), ticker: o.ticker,
    owners: o.owners.map(x => ({ cik: x.cik && /^\d{1,10}$/.test(x.cik) ? String(Number(x.cik)) : null, name: x.name, role: roleWord(x),
      isDirector: x.isDirector, isOfficer: x.isOfficer, isTenPercent: x.isTenPercentOwner, officerTitle: x.officerTitle })),
    ownerKey: ownerKey(o), period: o.period, filedAt: new Date(filedAt), url, lines: o.lines.filter(l => l.code).length, plan10b5_1: o.aff10b5One,
    originalDate: o.originalDate,
  };
}

export interface GroupItem { accession: string; form: string; filedAt: Date; lines: number; originalDate: string | null }
export interface Links { amends: Map<string, string>; supersededBy: Map<string, string> }

const filedOnEt = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

/** EDGAR dates a Form 4 accepted late in the evening to the next business day, so the original may have reached EDGAR
 *  on the filing date itself or up to three calendar days before it (a Friday night for a Monday date). */
const sameFilingDay = (receivedOn: string, filedOn: string): boolean => {
  const gap = (Date.parse(`${filedOn}T12:00:00Z`) - Date.parse(`${receivedOn}T12:00:00Z`)) / 86_400_000;
  return gap >= 0 && gap <= 3;
};

/** Which filing in one issuer/owners/period group amends and supersedes which (the rule at the top). Pure. */
export function amendmentLinks(group: readonly GroupItem[]): Links {
  const out: Links = { amends: new Map(), supersededBy: new Map() };
  const sorted = [...group].sort((a, b) => a.filedAt.getTime() - b.filedAt.getTime() || a.accession.localeCompare(b.accession));
  const base = (f: string) => f.replace(/\/A$/, "");
  const originals = sorted.filter(g => !g.form.endsWith("/A"));
  /** The latest version of each original, by the original's accession. */
  const latest = new Map(originals.map(o => [o.accession, o]));
  for (const g of sorted) {
    if (!g.form.endsWith("/A")) continue;
    const before = originals.filter(o => base(o.form) === base(g.form)).filter(o => o.filedAt.getTime() <= g.filedAt.getTime());
    // The original received on the 4/A's date; failing that, one received up to three days before it (an evening filing).
    const exact = g.originalDate === null ? before : before.filter(o => filedOnEt(o.filedAt) === g.originalDate);
    const fits = exact.length || g.originalDate === null ? exact : before.filter(o => sameFilingDay(filedOnEt(o.filedAt), g.originalDate!));
    if (fits.length !== 1) continue;
    const prev = latest.get(fits[0]!.accession)!;
    out.amends.set(g.accession, prev.accession);
    if (g.lines > 0) { out.supersededBy.set(prev.accession, g.accession); latest.set(fits[0]!.accession, g); }
  }
  return out;
}

/** Recomputes the amendment links of one group and marks its superseded lines. */
export async function linkAmendments(db: Db, issuerCik: string, key: string, period: string | null): Promise<void> {
  const where = and(eq(filings.issuerCik, issuerCik), eq(filings.ownerKey, key), period === null ? isNull(filings.period) : eq(filings.period, period));
  const group = await db.select({ accession: filings.accession, form: filings.form, filedAt: filings.filedAt, lines: filings.lines, originalDate: filings.originalDate }).from(filings).where(where).orderBy(asc(filings.filedAt));
  if (group.length < 2 && !group.some(g => g.form.endsWith("/A"))) return;
  const links = amendmentLinks(group);
  for (const g of group) {
    await db.update(filings).set({ amends: links.amends.get(g.accession) ?? null, supersededBy: links.supersededBy.get(g.accession) ?? null }).where(eq(filings.accession, g.accession));
  }
  const all = group.map(g => g.accession);
  const gone = all.filter(a => links.supersededBy.has(a));
  await db.update(insiderTrades).set({ superseded: false }).where(inArray(insiderTrades.accession, all));
  if (gone.length) await db.update(insiderTrades).set({ superseded: true }).where(inArray(insiderTrades.accession, gone));
}

/** Stores one read filing: its row, its lines, then its group's amendment links. */
export async function saveFiling(db: Db, o: Ownership, accession: string, filedAt: number, url: string): Promise<{ filing: FilingRow; trades: TradeRow[] }> {
  const filing = filingRow(o, accession, filedAt, url);
  const trades = tradeRows(o, accession, filedAt, url);
  const { accession: _a, ...rest } = filing;
  await db.insert(filings).values(filing).onConflictDoUpdate({ target: filings.accession, set: { ...rest, readAt: new Date() } });
  if (trades.length) await saveTrades(db, trades);
  await linkAmendments(db, filing.issuerCik, filing.ownerKey, filing.period ?? null);
  return { filing, trades };
}

/** Reads one filing from EDGAR (any filer CIK in its path works) and stores it. Throws when it can't be read; returns
 *  null for a filing with no ownership XML (paper filings, the odd broken submission). When it reached EDGAR: `at`
 *  (the live feed's own time) if given, else the filing index's stamp, else `fallback` (the index day's close). */
export async function readAndSave(db: Db, sec: SecClient, cik: string, accession: string, when: { at?: number | null; fallback?: number }): Promise<{ filing: FilingRow; trades: TradeRow[] } | null> {
  const base = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession}/`;
  const got = await readOwnership(sec, base);
  if (!got) return null;
  const filedAt = when.at ?? got.filedAt ?? when.fallback ?? Date.now();
  return saveFiling(db, got.ownership, accession, filedAt, filingIndexUrl(cik, accession));
}

/* ---------- reading the database (the /filings and /insiders pages) ---------- */

/** What the filings and insider pages can filter by. Every field is optional. */
export interface Query {
  /** Company name, ticker, or a person's name: matched case-insensitively. */
  q?: string;
  ticker?: string;
  /** "director", "officer", "ten" (10% owner). */
  role?: "director" | "officer" | "ten";
  /** One transaction code, upper case. */
  code?: string;
  from?: string;
  to?: string;
  /** Minimum value in dollars (lines with a value only). */
  min?: number;
  /** One reporting owner, by CIK (People pages). */
  owner?: string;
  /** One company, by CIK (company reports). */
  issuer?: string;
}

const DATE = { test: (s: string) => { const t = Date.parse(`${s}T12:00:00Z`); return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s; } };
const CODE = /^[A-Z]$/;
const TICKER = /^[A-Z][A-Z0-9.-]{0,9}$/;

/** A query from URL search params, with anything malformed dropped. Pure. */
export function parseQuery(p: Record<string, string | string[] | undefined>): Query {
  const one = (k: string) => { const v = p[k]; return (Array.isArray(v) ? v[0] : v)?.trim() ?? ""; };
  const q = one("q").slice(0, 80), ticker = one("ticker").toUpperCase(), role = one("role"), code = one("code").toUpperCase(), from = one("from"), to = one("to");
  const min = Number(one("min")), owner = one("owner"), issuer = one("issuer");
  return {
    ...(q ? { q } : {}), ...(TICKER.test(ticker) ? { ticker } : {}), ...(role === "director" || role === "officer" || role === "ten" ? { role } : {}),
    ...(CODE.test(code) ? { code } : {}), ...(DATE.test(from) ? { from } : {}), ...(DATE.test(to) ? { to } : {}), ...(Number.isFinite(min) && min > 0 ? { min } : {}),
    ...(/^\d{1,10}$/.test(owner) && Number(owner) > 0 ? { owner: String(Number(owner)) } : {}), ...(/^\d{1,10}$/.test(issuer) && Number(issuer) > 0 ? { issuer: String(Number(issuer)) } : {}),
  };
}

const like = (q: string) => `%${q.replace(/[\\%_]/g, c => `\\${c}`)}%`;
const endOfDay = (d: string) => new Date(`${d}T23:59:59.999-05:00`);
const startOfDay = (d: string) => new Date(`${d}T00:00:00-05:00`);

export interface FilingView {
  accession: string; form: string; issuerCik: string; company: string; ticker: string | null; owners: Array<{ cik: string | null; name: string; role: string }>;
  period: string | null; filedAt: Date; url: string; lines: number; plan10b5_1: boolean | null; amends: string | null; supersededBy: string | null;
  /** Open-market totals on the filing (Table I P and S), when it has any. */
  bought: number; sold: number; codes: string[];
}

/** Filings, newest first, matching the query. */
export async function searchFilings(db: Db, q: Query, opts: { limit: number; offset?: number }): Promise<FilingView[]> {
  const w = [sql`true`];
  if (q.q) w.push(sql`(f.company ilike ${like(q.q)} or f.ticker ilike ${like(q.q)} or f.owners::text ilike ${like(q.q)})`);
  if (q.ticker) w.push(sql`upper(f.ticker) = ${q.ticker}`);
  if (q.from) w.push(sql`f.filed_at >= ${startOfDay(q.from)}`);
  if (q.to) w.push(sql`f.filed_at <= ${endOfDay(q.to)}`);
  if (q.issuer) w.push(sql`f.issuer_cik = ${q.issuer}`);
  if (q.owner) w.push(sql`f.owners @> ${JSON.stringify([{ cik: q.owner }])}::jsonb`);
  const lineW = [sql`t.accession = f.accession`];
  if (q.code) w.push(sql`exists (select 1 from terminal.insider_trades t where t.accession = f.accession and t.code = ${q.code})`);
  if (q.role) w.push(sql`exists (select 1 from terminal.insider_trades t where t.accession = f.accession and ${roleSql(q.role)})`);
  if (q.min) w.push(sql`(select coalesce(sum(t.value), 0) from (select distinct on (t.line) t.value from terminal.insider_trades t where t.accession = f.accession and t.value is not null) t) >= ${q.min}`);
  const r = await db.execute(sql`
    select f.*, coalesce(x.bought, 0)::float as bought, coalesce(x.sold, 0)::float as sold, coalesce(x.codes, '{}') as codes
    from terminal.filings f
    left join lateral (
      select sum(case when code = 'P' and acquired_disposed = 'A' and not derivative then value end) as bought,
             sum(case when code = 'S' and acquired_disposed = 'D' and not derivative then value end) as sold,
             array_agg(distinct code) as codes
      from (select distinct on (t.line) t.code, t.acquired_disposed, t.derivative, t.value from terminal.insider_trades t where ${sql.join(lineW, sql` and `)}) t
    ) x on true
    where ${sql.join(w, sql` and `)}
    order by f.filed_at desc, f.accession desc limit ${opts.limit} offset ${opts.offset ?? 0}`);
  return (r.rows as Array<Record<string, unknown>>).map(row => ({
    accession: String(row.accession), form: String(row.form), issuerCik: String(row.issuer_cik), company: String(row.company), ticker: (row.ticker as string | null) ?? null,
    owners: row.owners as FilingView["owners"], period: (row.period as string | null) ?? null, filedAt: new Date(row.filed_at as string), url: String(row.url),
    lines: Number(row.lines), plan10b5_1: (row.plan_10b5_1 as boolean | null) ?? null, amends: (row.amends as string | null) ?? null,
    supersededBy: (row.superseded_by as string | null) ?? null, bought: Number(row.bought), sold: Number(row.sold),
    codes: (Array.isArray(row.codes) ? row.codes : String(row.codes ?? "").replace(/[{}]/g, "").split(",")).map(String).filter(Boolean).sort(),
  }));
}

function roleSql(role: NonNullable<Query["role"]>) {
  return role === "director" ? sql`t.is_director` : role === "officer" ? sql`t.is_officer` : sql`t.is_ten_percent`;
}

/** The insider page's tabs: open-market trades (P and S on Table I), and each other kind of transaction on its own. */
export const TABS = [
  { key: "open", label: "Open market", codes: ["P", "S"] },
  { key: "exercises", label: "Option exercises", codes: ["M", "X", "O"] },
  { key: "grants", label: "Grants and awards", codes: ["A"] },
  { key: "tax", label: "Tax withholding", codes: ["F"] },
  { key: "gifts", label: "Gifts", codes: ["G"] },
  { key: "other", label: "Everything else", codes: [] },
] as const;
export type TabKey = (typeof TABS)[number]["key"];
const NAMED = TABS.flatMap(t => [...t.codes]);

export const tabOf = (raw: string | undefined): TabKey => (TABS.some(t => t.key === raw) ? raw as TabKey : "open");

/** The SEC's own description of each transaction code (Form 4 General Instructions, item 8). */
export const CODE_NAMES: Record<string, string> = {
  P: "Open market or private purchase", S: "Open market or private sale", V: "Reported early (voluntary)", A: "Grant, award or other acquisition",
  D: "Disposition to the issuer", F: "Payment of exercise price or tax by delivering securities", I: "Discretionary transaction",
  M: "Exercise or conversion of a derivative security", C: "Conversion of a derivative security", E: "Expiration of a short derivative position",
  H: "Expiration or cancellation of a long derivative position", O: "Exercise of an out-of-the-money derivative security",
  X: "Exercise of an in-the-money or at-the-money derivative security", G: "Bona fide gift", L: "Small acquisition",
  W: "Acquisition or disposition by will or the laws of descent", Z: "Deposit into or withdrawal from a voting trust",
  J: "Other acquisition or disposition (described in a footnote)", K: "Equity swap or similar instrument", U: "Disposition in a change of control",
};

export type TradeView = typeof insiderTrades.$inferSelect;

/** Transaction lines, newest first, in one tab, matching the query. Superseded lines (restated by a later 4/A) are
 *  left out. The open-market tab is Table I P acquired and S disposed only. */
export async function searchTrades(db: Db, tab: TabKey, q: Query, opts: { limit: number; offset?: number }): Promise<TradeView[]> {
  // Only lines read under V3 (they have a filings row): older V2 history rows lack the V3 columns.
  const w = [sql`not t.superseded`, sql`exists (select 1 from terminal.filings f where f.accession = t.accession)`];
  if (tab === "open") w.push(sql`not t.derivative and ((t.code = 'P' and t.acquired_disposed = 'A') or (t.code = 'S' and t.acquired_disposed = 'D'))`);
  else if (tab === "other") w.push(sql`(t.code not in (${sql.join(NAMED.map(c => sql`${c}`), sql`, `)}) or ((t.code = 'P' or t.code = 'S') and (t.derivative or t.acquired_disposed is distinct from case when t.code = 'P' then 'A' else 'D' end)))`);
  else w.push(sql`t.code in (${sql.join([...TABS.find(t => t.key === tab)!.codes].map(c => sql`${c}`), sql`, `)})`);
  if (q.q) w.push(sql`(t.company ilike ${like(q.q)} or t.ticker ilike ${like(q.q)} or t.owner_name ilike ${like(q.q)})`);
  if (q.ticker) w.push(sql`upper(t.ticker) = ${q.ticker}`);
  if (q.code) w.push(sql`t.code = ${q.code}`);
  if (q.role) w.push(roleSql(q.role));
  if (q.from) w.push(sql`coalesce(t.trade_date, to_char(t.filed_at at time zone 'America/New_York', 'YYYY-MM-DD')) >= ${q.from}`);
  if (q.to) w.push(sql`coalesce(t.trade_date, to_char(t.filed_at at time zone 'America/New_York', 'YYYY-MM-DD')) <= ${q.to}`);
  if (q.min) w.push(sql`t.value >= ${q.min}`);
  if (q.owner) w.push(sql`t.owner_cik = ${q.owner}`);
  if (q.issuer) w.push(sql`t.issuer_cik = ${q.issuer}`);
  const r = await db.execute(sql`select * from terminal.insider_trades t where ${sql.join(w, sql` and `)}
    order by t.filed_at desc, t.accession desc, t.line asc, t.owner_cik asc limit ${opts.limit} offset ${opts.offset ?? 0}`);
  return (r.rows as Array<Record<string, unknown>>).map(tradeFromRow);
}

export function tradeFromRow(r: Record<string, unknown>): TradeView {
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    accession: String(r.accession), line: Number(r.line), ownerCik: String(r.owner_cik), ownerName: String(r.owner_name), role: String(r.role),
    issuerCik: String(r.issuer_cik), company: String(r.company), ticker: (r.ticker as string | null) ?? null, code: String(r.code), tradeDate: (r.trade_date as string | null) ?? null,
    shares: n(r.shares), price: n(r.price), value: n(r.value), filedAt: new Date(r.filed_at as string), url: String(r.url), form: String(r.form ?? "4"),
    acquiredDisposed: (r.acquired_disposed as string | null) ?? null, derivative: Boolean(r.derivative), security: (r.security as string | null) ?? null,
    ownedAfter: n(r.owned_after), direct: (r.direct as boolean | null) ?? null, plan10b5_1: (r.plan_10b5_1 as boolean | null) ?? null,
    isDirector: (r.is_director as boolean | null) ?? null, isOfficer: (r.is_officer as boolean | null) ?? null, isTenPercent: (r.is_ten_percent as boolean | null) ?? null,
    officerTitle: (r.officer_title as string | null) ?? null, superseded: Boolean(r.superseded),
  };
}

/** Open-market totals for the query over its date range (or the last 30 days): bought, sold, and how many people. */
export async function openMarketTotals(db: Db, q: Query, now: number): Promise<{ bought: number; sold: number; buyers: number; sellers: number; from: string; to: string }> {
  const to = q.to ?? new Date(now).toISOString().slice(0, 10);
  const from = q.from ?? new Date(now - 30 * 86_400_000).toISOString().slice(0, 10);
  const w = [sql`not t.superseded`, sql`exists (select 1 from terminal.filings f where f.accession = t.accession)`, sql`not t.derivative`, sql`((t.code = 'P' and t.acquired_disposed = 'A') or (t.code = 'S' and t.acquired_disposed = 'D'))`,
    sql`coalesce(t.trade_date, to_char(t.filed_at at time zone 'America/New_York', 'YYYY-MM-DD')) between ${from} and ${to}`];
  if (q.q) w.push(sql`(t.company ilike ${like(q.q)} or t.ticker ilike ${like(q.q)} or t.owner_name ilike ${like(q.q)})`);
  if (q.ticker) w.push(sql`upper(t.ticker) = ${q.ticker}`);
  if (q.role) w.push(roleSql(q.role));
  if (q.owner) w.push(sql`t.owner_cik = ${q.owner}`);
  if (q.issuer) w.push(sql`t.issuer_cik = ${q.issuer}`);
  // One owner's line counts once even when several owners share it (a fund and its manager on one filing).
  const r = await db.execute(sql`select
      coalesce(sum(value) filter (where code = 'P'), 0)::float as bought, coalesce(sum(value) filter (where code = 'S'), 0)::float as sold,
      count(distinct owner_cik) filter (where code = 'P')::int as buyers, count(distinct owner_cik) filter (where code = 'S')::int as sellers
    from (select distinct on (t.accession, t.line) t.accession, t.line, t.code, t.value, t.owner_cik from terminal.insider_trades t where ${sql.join(w, sql` and `)}) x`);
  const row = (r.rows[0] ?? {}) as Record<string, unknown>;
  return { bought: Number(row.bought ?? 0), sold: Number(row.sold ?? 0), buyers: Number(row.buyers ?? 0), sellers: Number(row.sellers ?? 0), from, to };
}
