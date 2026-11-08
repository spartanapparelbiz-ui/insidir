/* Company reports (docs/INSIDIR-V3.md §3): a registrant's header, filings and financials, read from SEC EDGAR only.
 *
 *   Ticker list   www.sec.gov/files/company_tickers.json, daily: every listed ticker and its CIK (companies rows).
 *   Submissions   data.sec.gov/submissions/CIK##########.json: name, tickers, exchanges, SIC, fiscal year end, and the
 *                 recent filings (company_filings, the last FILINGS_YEARS years, at most FILINGS_MAX).
 *   Company facts data.sec.gov/api/xbrl/companyfacts/CIK##########.json: only the CONCEPTS below, from 10-K and 10-Q
 *                 filings, the last FACTS_YEARS years (company_facts). Nothing else from the 2–20 MB file is kept.
 *
 * The financials (pure, ttm/instant below):
 *   Flows (revenue, operating income, net income, operating cash flow, capital spending): the trailing twelve months
 *   are the latest annual figure + this fiscal year to date − the same months a year earlier, each as most recently
 *   filed. When any of the three is missing, the latest fiscal year is shown and labelled as a fiscal year: never a
 *   partial TTM.
 *   Diluted EPS: the latest fiscal year as filed. Per-share figures don't add across periods, so no TTM is computed.
 *   Balances (cash, debt, shares outstanding): the latest value as filed, with its date.
 * The concept each line uses is the first in its list that the company reported most recently (revenue has several
 * names in US GAAP). Every figure names its concept and links to the filing it came from. A company that files no US
 * GAAP facts (a foreign private issuer filing IFRS, a fund) shows none.
 *
 * Refresh (worker, companiesOnce): companies someone asked for (a page visit, a watchlist, a new 10-K or 10-Q) first,
 * then issuers with recent Form 4s not read in a week; COMPANIES_PER_RUN a run, two requests each. */
import { and, desc, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "@/lib/db";
import { companies, companyFacts, companyFilings } from "@/lib/db/schema";
import { cik10 } from "./form13f";
import type { SecClient } from "./sec";

export const COMPANIES_PER_RUN = 4;
export const FILINGS_YEARS = 2;
export const FILINGS_MAX = 300;
export const FACTS_YEARS = 4;
const DAY = 86_400_000;

export type Metric = "revenue" | "operatingIncome" | "netIncome" | "operatingCashFlow" | "capex" | "epsDiluted" | "cash" | "longTermDebt" | "currentDebt" | "sharesOutstanding";
export const METRICS: ReadonlyArray<{ key: Metric; label: string; kind: "flow" | "fy" | "instant"; unit: "USD" | "USD/shares" | "shares"; concepts: readonly string[] }> = [
  { key: "revenue", label: "Revenue", kind: "flow", unit: "USD", concepts: ["us-gaap:Revenues", "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax", "us-gaap:RevenueFromContractWithCustomerIncludingAssessedTax", "us-gaap:SalesRevenueNet", "us-gaap:SalesRevenueGoodsNet", "us-gaap:SalesRevenueServicesNet", "us-gaap:RevenuesNetOfInterestExpense"] },
  { key: "operatingIncome", label: "Operating income", kind: "flow", unit: "USD", concepts: ["us-gaap:OperatingIncomeLoss"] },
  { key: "netIncome", label: "Net income", kind: "flow", unit: "USD", concepts: ["us-gaap:NetIncomeLoss", "us-gaap:ProfitLoss", "us-gaap:NetIncomeLossAvailableToCommonStockholdersBasic"] },
  { key: "operatingCashFlow", label: "Operating cash flow", kind: "flow", unit: "USD", concepts: ["us-gaap:NetCashProvidedByUsedInOperatingActivities", "us-gaap:NetCashProvidedByUsedInOperatingActivitiesContinuingOperations"] },
  { key: "capex", label: "Capital spending", kind: "flow", unit: "USD", concepts: ["us-gaap:PaymentsToAcquirePropertyPlantAndEquipment", "us-gaap:PaymentsToAcquireProductiveAssets"] },
  { key: "epsDiluted", label: "Diluted EPS", kind: "fy", unit: "USD/shares", concepts: ["us-gaap:EarningsPerShareDiluted"] },
  { key: "cash", label: "Cash and equivalents", kind: "instant", unit: "USD", concepts: ["us-gaap:CashAndCashEquivalentsAtCarryingValue", "us-gaap:CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"] },
  { key: "longTermDebt", label: "Long-term debt", kind: "instant", unit: "USD", concepts: ["us-gaap:LongTermDebtNoncurrent", "us-gaap:LongTermDebt"] },
  { key: "currentDebt", label: "Debt due within a year", kind: "instant", unit: "USD", concepts: ["us-gaap:LongTermDebtCurrent", "us-gaap:DebtCurrent"] },
  { key: "sharesOutstanding", label: "Shares outstanding", kind: "instant", unit: "shares", concepts: ["dei:EntityCommonStockSharesOutstanding"] },
];
/** When the concept used isn't what the line's label says, the label it gets instead. */
export const CONCEPT_LABELS: Record<string, string> = {
  // For most companies this is their revenue; for a bank it is fee income only (interest is outside it), so it says what it is.
  "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax": "Revenue from contracts with customers",
  "us-gaap:RevenueFromContractWithCustomerIncludingAssessedTax": "Revenue from contracts with customers",
  "us-gaap:CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents": "Cash, equivalents and restricted cash",
  "us-gaap:NetIncomeLossAvailableToCommonStockholdersBasic": "Net income to common shareholders",
  "us-gaap:PaymentsToAcquireProductiveAssets": "Capital spending (productive assets)",
  "us-gaap:RevenuesNetOfInterestExpense": "Revenue, net of interest expense",
  "us-gaap:ProfitLoss": "Net income, including minority interests",
};
/** Every concept kept, "taxonomy:Name". */
export const CONCEPTS: readonly string[] = [...new Set(METRICS.flatMap(m => [...m.concepts]))];
const FORMS = new Set(["10-K", "10-K/A", "10-Q", "10-Q/A", "10-KT", "10-KT/A"]);

export type Fact = { concept: string; unit: string; start: string; end: string; value: number; accn: string; form: string; fy: number | null; fp: string | null; filed: string };
type Json = Record<string, unknown>;

/* ---------- reading EDGAR's files (pure) ---------- */

/** company_tickers.json → CIK → { name, tickers }. */
export function parseTickers(raw: unknown): Map<string, { name: string; tickers: string[] }> {
  const out = new Map<string, { name: string; tickers: string[] }>();
  for (const v of Object.values((raw ?? {}) as Record<string, Json>)) {
    const cik = Number(v?.cik_str), ticker = String(v?.ticker ?? "").trim().toUpperCase(), name = String(v?.title ?? "").trim();
    if (!Number.isInteger(cik) || cik <= 0 || !/^[A-Z0-9.-]{1,10}$/.test(ticker) || !name) continue;
    const k = String(cik), e = out.get(k);
    if (e) { if (!e.tickers.includes(ticker)) e.tickers.push(ticker); } else out.set(k, { name, tickers: [ticker] });
  }
  return out;
}

export interface Submissions {
  cik: string; name: string; tickers: string[]; exchanges: string[]; sic: string | null; sicDescription: string | null;
  fiscalYearEnd: string | null; stateOfIncorporation: string | null; category: string | null;
  filings: Array<typeof companyFilings.$inferInsert>;
}

/** A submissions file → the company and its recent filings (since `since`, at most FILINGS_MAX). */
export function parseSubmissions(raw: unknown, since: string): Submissions {
  const s = (raw ?? {}) as Json;
  const cik = String(Number(s.cik));
  if (!/^\d{1,10}$/.test(cik) || cik === "0") throw new Error("Not a submissions file");
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const arr = (v: unknown) => (Array.isArray(v) ? v.map(x => String(x ?? "").trim()).filter(Boolean) : []);
  const r = ((s.filings as Json | undefined)?.recent ?? {}) as Record<string, unknown[]>;
  const filings: Submissions["filings"] = [];
  const n = Array.isArray(r.form) ? r.form.length : 0;
  for (let i = 0; i < n && filings.length < FILINGS_MAX; i++) {
    const acc = String(r.accessionNumber?.[i] ?? ""), filed = String(r.filingDate?.[i] ?? ""), form = String(r.form?.[i] ?? "").trim();
    if (!/^\d{10}-\d{2}-\d{6}$/.test(acc) || !/^\d{4}-\d{2}-\d{2}$/.test(filed) || !form || filed < since) continue;
    const accession = acc.replace(/-/g, ""), doc = String(r.primaryDocument?.[i] ?? "");
    const accepted = String(r.acceptanceDateTime?.[i] ?? "");
    filings.push({
      accession, cik, form, filedOn: filed, acceptedAt: Number.isNaN(Date.parse(accepted)) ? null : new Date(accepted),
      // Seen when EDGAR accepted it, not when the submissions file was read: an old filing found later never alerts.
      seenAt: Number.isNaN(Date.parse(accepted)) ? new Date(`${filed}T21:00:00Z`) : new Date(accepted),
      reportDate: /^\d{4}-\d{2}-\d{2}$/.test(String(r.reportDate?.[i] ?? "")) ? String(r.reportDate![i]) : null,
      items: str(r.items?.[i]), description: str(r.primaryDocDescription?.[i]),
      url: /^[A-Za-z0-9_./-]+$/.test(doc) && !doc.includes("..") ? `https://www.sec.gov/Archives/edgar/data/${cik}/${accession}/${doc}` : filingIndex(cik, accession),
    });
  }
  return { cik, name: str(s.name) ?? `CIK ${cik}`, tickers: arr(s.tickers).map(t => t.toUpperCase()), exchanges: arr(s.exchanges), sic: str(s.sic), sicDescription: str(s.sicDescription),
    fiscalYearEnd: /^\d{4}$/.test(String(s.fiscalYearEnd ?? "")) ? String(s.fiscalYearEnd) : null, stateOfIncorporation: str(s.stateOfIncorporation), category: str(s.category), filings };
}

/** A companyfacts file → the CONCEPTS' values from 10-K and 10-Q filings ending on or after `since`. */
export function parseFacts(raw: unknown, since: string): Fact[] {
  const facts = ((raw ?? {}) as Json).facts as Record<string, Record<string, { units?: Record<string, Json[]> }>> | undefined;
  const out: Fact[] = [];
  for (const concept of CONCEPTS) {
    const [tax, name] = concept.split(":") as [string, string];
    for (const [unit, list] of Object.entries(facts?.[tax]?.[name]?.units ?? {})) {
      for (const f of list ?? []) {
        const form = String(f.form ?? ""), end = String(f.end ?? ""), start = typeof f.start === "string" ? f.start : "", accn = String(f.accn ?? "");
        const value = typeof f.val === "number" ? f.val : Number.NaN;
        if (!FORMS.has(form) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || end < since || !Number.isFinite(value) || !/^\d{10}-\d{2}-\d{6}$/.test(accn)) continue;
        if (start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) continue;
        out.push({ concept, unit, start, end, value, accn, form, fy: typeof f.fy === "number" ? f.fy : null, fp: typeof f.fp === "string" ? f.fp : null, filed: String(f.filed ?? "") });
      }
    }
  }
  return out;
}

/* ---------- the financials (pure) ---------- */

const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
const days = (a: string, b: string) => Math.round((ms(b) - ms(a)) / DAY);
/** One value per period: the one in the most recently filed report (a later 10-K's restated comparative wins). */
function latestPerPeriod(list: readonly Fact[]): Fact[] {
  const by = new Map<string, Fact>();
  for (const f of list) {
    const k = `${f.start}|${f.end}`, cur = by.get(k);
    if (!cur || f.filed > cur.filed || (f.filed === cur.filed && f.accn > cur.accn)) by.set(k, f);
  }
  return [...by.values()];
}

/** A fiscal year: about a year long and reported in a 10-K. Some 10-Qs also report the trailing twelve months (Amazon's
 *  do); those are not a fiscal year. */
const isAnnual = (f: Fact): boolean => { const d = days(f.start, f.end); return d >= 350 && d <= 380 && f.form.startsWith("10-K"); };

export interface Figure { metric: Metric; label: string; concept: string; unit: string; value: number; basis: "ttm" | "fy" | "instant"; periodEnd: string; sources: Fact[] }

/** A flow's trailing twelve months, or its latest fiscal year when a TTM can't be built from filed figures. */
export function flowFigure(list: readonly Fact[]): { value: number; basis: "ttm" | "fy"; periodEnd: string; sources: Fact[] } | null {
  const facts = latestPerPeriod(list.filter(f => f.start));
  const annual = facts.filter(isAnnual).sort((a, b) => b.end.localeCompare(a.end))[0];
  if (!annual) return null;
  const fy = { value: annual.value, basis: "fy" as const, periodEnd: annual.end, sources: [annual] };
  const ytd = facts.filter(f => Math.abs(days(annual.end, f.start) - 1) <= 3 && f.end > annual.end && days(f.start, f.end) < 350)
    .sort((a, b) => b.end.localeCompare(a.end))[0];
  if (!ytd) return fy;
  const len = days(ytd.start, ytd.end), target = ms(ytd.end) - 365 * DAY;
  const prior = facts.find(f => Math.abs(days(annual.start, f.start)) <= 3 && Math.abs(ms(f.end) - target) <= 7 * DAY && Math.abs(days(f.start, f.end) - len) <= 7);
  if (!prior) return fy;
  return { value: annual.value + ytd.value - prior.value, basis: "ttm", periodEnd: ytd.end, sources: [annual, ytd, prior] };
}

/** The latest fiscal year's value as filed. */
export function fyFigure(list: readonly Fact[]): { value: number; basis: "fy"; periodEnd: string; sources: Fact[] } | null {
  const a = latestPerPeriod(list.filter(f => f.start && isAnnual(f))).sort((x, y) => y.end.localeCompare(x.end))[0];
  return a ? { value: a.value, basis: "fy", periodEnd: a.end, sources: [a] } : null;
}

/** The latest balance as filed. */
export function instantFigure(list: readonly Fact[]): { value: number; basis: "instant"; periodEnd: string; sources: Fact[] } | null {
  const a = latestPerPeriod(list.filter(f => !f.start)).sort((x, y) => y.end.localeCompare(x.end) || y.filed.localeCompare(x.filed))[0];
  return a ? { value: a.value, basis: "instant", periodEnd: a.end, sources: [a] } : null;
}

/** Every metric the company's facts support, with the concept it used. Pure. */
export function financials(facts: readonly Fact[]): Figure[] {
  const out: Figure[] = [];
  for (const m of METRICS) {
    let best: Figure | null = null;
    for (const concept of m.concepts) {
      const list = facts.filter(f => f.concept === concept && f.unit === m.unit);
      const fig = m.kind === "flow" ? flowFigure(list) : m.kind === "fy" ? fyFigure(list) : instantFigure(list);
      if (!fig) continue;
      // The concept reported most recently wins; on a tie, the earlier in the list.
      const latestEnd = list.reduce((x, f) => (f.end > x ? f.end : x), "");
      const bestEnd = best ? facts.filter(f => f.concept === best!.concept && f.unit === m.unit).reduce((x, f) => (f.end > x ? f.end : x), "") : "";
      if (!best || latestEnd > bestEnd) best = { metric: m.key, label: CONCEPT_LABELS[concept] ?? m.label, concept, unit: m.unit, ...fig };
    }
    if (best) out.push(best);
  }
  return out;
}

/** "0630" → "June 30". */
export function fiscalYearEnd(mmdd: string | null): string | null {
  if (!mmdd || !/^\d{4}$/.test(mmdd)) return null;
  const m = Number(mmdd.slice(0, 2)), day = Number(mmdd.slice(2));
  const d = new Date(Date.UTC(2000, m - 1, day));
  // No rolling over: "1399" or "0231" is not a date.
  return d.getUTCMonth() !== m - 1 || d.getUTCDate() !== day ? null : new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", day: "numeric" }).format(d);
}

export const filingIndex = (cik: string, accession18: string): string =>
  `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession18}/${accession18.slice(0, 10)}-${accession18.slice(10, 12)}-${accession18.slice(12)}-index.htm`;
export const factSource = (cik: string, f: Pick<Fact, "accn">): string => filingIndex(cik, f.accn.replace(/-/g, ""));

/* ---------- storing and refreshing ---------- */

const yearsAgo = (now: number, y: number) => new Date(now - y * 365.25 * DAY).toISOString().slice(0, 10);

/** The ticker list into companies (new rows, and every company's tickers and name kept current). */
export async function tickersOnce(db: Db, sec: SecClient): Promise<number> {
  const map = parseTickers(await sec.json("https://www.sec.gov/files/company_tickers.json"));
  const rows = [...map].map(([cik, v]) => ({ cik, name: v.name, tickers: v.tickers }));
  for (let i = 0; i < rows.length; i += 1000) {
    await db.insert(companies).values(rows.slice(i, i + 1000))
      .onConflictDoUpdate({ target: companies.cik, set: { tickers: sql`excluded.tickers`, name: sql`case when ${companies.refreshedAt} is null then excluded.name else ${companies.name} end` } });
  }
  return rows.length;
}

/** Asks the worker to read these companies soon (a page visit, a watchlist). Unknown CIKs get a placeholder row. */
export async function wantCompanies(db: Db, ciks: readonly string[], now = Date.now()): Promise<void> {
  const ids = [...new Set(ciks.map(c => String(Number(c))).filter(c => c !== "0" && /^\d{1,10}$/.test(c)))];
  if (!ids.length) return;
  await db.insert(companies).values(ids.map(cik => ({ cik, name: `CIK ${cik}`, wantedAt: new Date(now) })))
    .onConflictDoUpdate({ target: companies.cik, set: { wantedAt: new Date(now) } });
}

/** Reads one company: its submissions and its facts. */
export async function refreshCompany(db: Db, sec: SecClient, cik: string, now: number): Promise<{ filings: number; facts: number }> {
  const id = cik10(cik)!;
  const sub = parseSubmissions(await sec.json(`https://data.sec.gov/submissions/CIK${id}.json`), yearsAgo(now, FILINGS_YEARS));
  const rawFacts = await sec.json(`https://data.sec.gov/api/xbrl/companyfacts/CIK${id}.json`).catch((e: unknown) => {
    if (e instanceof Error && /responded 404/.test(e.message)) return null; // no XBRL facts at all
    throw e;
  });
  const facts = rawFacts ? parseFacts(rawFacts, yearsAgo(now, FACTS_YEARS)) : [];
  await db.transaction(async tx => {
    const { filings: list, cik: c, ...head } = sub;
    await tx.insert(companies).values({ cik: c, ...head, refreshedAt: new Date(now), factsAt: rawFacts ? new Date(now) : null })
      .onConflictDoUpdate({ target: companies.cik, set: { ...head, refreshedAt: new Date(now), factsAt: rawFacts ? new Date(now) : null } });
    for (let i = 0; i < list.length; i += 500) {
      await tx.insert(companyFilings).values(list.slice(i, i + 500)).onConflictDoUpdate({ target: companyFilings.accession,
        set: { items: sql`excluded.items`, description: sql`excluded.description`, url: sql`excluded.url`, acceptedAt: sql`coalesce(${companyFilings.acceptedAt}, excluded.accepted_at)`, reportDate: sql`excluded.report_date` } });
    }
    await tx.delete(companyFacts).where(eq(companyFacts.cik, c));
    const rows = facts.map(f => ({ cik: c, ...f }));
    for (let i = 0; i < rows.length; i += 1000) await tx.insert(companyFacts).values(rows.slice(i, i + 1000)).onConflictDoNothing();
  });
  return { filings: sub.filings.length, facts: facts.length };
}

/** One run: the companies asked for first, then active issuers not read in a week. */
export async function companiesOnce(db: Db, sec: SecClient, now: number, per = COMPANIES_PER_RUN): Promise<{ read: number; facts: number; errors: number }> {
  const wanted = await db.select({ cik: companies.cik }).from(companies)
    .where(and(isNotNull(companies.wantedAt), or(isNull(companies.refreshedAt), lt(companies.refreshedAt, companies.wantedAt))))
    .orderBy(companies.wantedAt).limit(per);
  let list = wanted.map(r => r.cik);
  if (list.length < per) {
    const stale = await db.execute(sql`select f.issuer_cik as cik from terminal.filings f left join terminal.companies c on c.cik = f.issuer_cik
      where f.filed_at > ${new Date(now - 30 * DAY)} and (c.refreshed_at is null or c.refreshed_at < ${new Date(now - 7 * DAY)})
      group by f.issuer_cik order by max(f.filed_at) desc limit ${per - list.length}`);
    list = [...list, ...(stale.rows as Array<{ cik: string }>).map(r => r.cik).filter(c => !list.includes(c))];
  }
  let read = 0, factCount = 0, errors = 0;
  for (const cik of list) {
    try { const r = await refreshCompany(db, sec, cik, now); read++; factCount += r.facts; } catch {
      errors++;
      // Not asked for again until something new asks: one bad file can't block the queue.
      await db.update(companies).set({ refreshedAt: new Date(now) }).where(eq(companies.cik, cik));
    }
  }
  return { read, facts: factCount, errors };
}

/* ---------- reading (the company page) ---------- */

export type CompanyRow = typeof companies.$inferSelect;

export async function companyByTicker(db: Db, ticker: string): Promise<CompanyRow | null> {
  const t = ticker.toUpperCase();
  const r = await db.select().from(companies).where(sql`${t} = any(${companies.tickers})`).orderBy(desc(companies.refreshedAt)).limit(1);
  return r[0] ?? null;
}
export async function companyByCik(db: Db, cik: string): Promise<CompanyRow | null> {
  return (await db.select().from(companies).where(eq(companies.cik, String(Number(cik)))).limit(1))[0] ?? null;
}
export async function factsFor(db: Db, cik: string): Promise<Fact[]> {
  return (await db.select().from(companyFacts).where(eq(companyFacts.cik, cik))).map(({ cik: _c, ...f }) => f);
}
export type FilingRowView = typeof companyFilings.$inferSelect;
/** A company's filings, newest first; `forms` limits to these forms and their amendments. */
export async function filingsFor(db: Db, cik: string, forms: readonly string[] | null, limit = 100): Promise<FilingRowView[]> {
  const where = forms ? and(eq(companyFilings.cik, cik), inArray(sql`regexp_replace(${companyFilings.form}, '/A$', '')`, [...forms])) : eq(companyFilings.cik, cik);
  return db.select().from(companyFilings).where(where).orderBy(desc(companyFilings.filedOn), desc(companyFilings.accession)).limit(limit);
}

/** The filing-type chips on the company page. */
export const FILING_GROUPS: ReadonlyArray<{ key: string; label: string; forms: readonly string[] | null }> = [
  { key: "all", label: "All", forms: null },
  { key: "annual", label: "10-K", forms: ["10-K", "10-KT", "20-F", "40-F"] },
  { key: "quarterly", label: "10-Q", forms: ["10-Q"] },
  { key: "current", label: "8-K", forms: ["8-K", "6-K"] },
  { key: "ownership", label: "Forms 3, 4, 5", forms: ["3", "4", "5"] },
  { key: "holders", label: "13D / 13G", forms: ["SCHEDULE 13D", "SCHEDULE 13G", "SC 13D", "SC 13G"] },
  { key: "proxy", label: "Proxy", forms: ["DEF 14A", "DEFA14A", "DEFM14A"] },
];

/** The SEC's names for the 8-K items (Form 8-K General Instructions B). */
export const EIGHT_K_ITEMS: Record<string, string> = {
  "1.01": "Material agreement", "1.02": "Agreement ended", "1.03": "Bankruptcy or receivership", "1.05": "Cybersecurity incident",
  "2.01": "Acquisition or disposition completed", "2.02": "Results of operations", "2.03": "New direct financial obligation", "2.04": "Triggering event on an obligation",
  "2.05": "Exit or disposal costs", "2.06": "Material impairment", "3.01": "Delisting or listing-rule notice", "3.02": "Unregistered equity sale",
  "3.03": "Change to holders' rights", "4.01": "Change of accountant", "4.02": "Prior financials no longer reliable", "5.01": "Change in control",
  "5.02": "Officer or director change", "5.03": "Charter or bylaw change", "5.05": "Code of ethics change", "5.07": "Shareholder vote results",
  "5.08": "Director nominations", "7.01": "Regulation FD disclosure", "8.01": "Other events", "9.01": "Financial statements and exhibits",
};
