/* V3 steps 3–6 (docs/INSIDIR-V3.md §3), pure parts, against real EDGAR files saved in test/fixtures/sec/v3 (Procter &
 * Gamble's submissions and company facts, trimmed to the concepts the report reads; EDGAR's live 8-K and Schedule 13G
 * feeds): the trailing-twelve-month rule and its fallbacks, the concept each line uses, submissions, the ticker list,
 * the live feed's company entries, Forms 3 and 5, and the journal and watchlist input rules. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseFormIndex } from "@/lib/stocks/backfill";
import { financials, fiscalYearEnd, flowFigure, instantFigure, parseFacts, parseSubmissions, parseTickers, type Fact } from "@/lib/stocks/company";
import { parseCurrent } from "@/lib/stocks/current";
import { amendmentLinks } from "@/lib/stocks/filings";
import { formOf } from "@/lib/stocks/history";
import { parseEntry } from "@/lib/journal";
import { readyFeatures } from "@/lib/features";
import { cleanForms, cleanName, FAMILY_KEYS } from "@/lib/stocks/watchlists";

const fx = (n: string) => readFileSync(join(__dirname, "fixtures/sec/v3", n), "utf8");
const pgFacts = parseFacts(JSON.parse(fx("pg-companyfacts.json")), "2022-01-01");

describe("company financials from Procter & Gamble's real company facts", () => {
  const figs = new Map(financials(pgFacts).map(f => [f.metric, f]));
  it("revenue: FY2026 + Q1 FY2027 − Q1 FY2026, each as filed", () => {
    const r = figs.get("revenue")!;
    expect(r).toMatchObject({ basis: "ttm", periodEnd: "2026-09-30", concept: "us-gaap:Revenues", value: 87_032_000_000 + 23_276_000_000 - 22_386_000_000 });
    expect(r.sources.map(s => [s.form, s.start, s.end])).toEqual([["10-K", "2025-07-01", "2026-06-30"], ["10-Q", "2026-07-01", "2026-09-30"], ["10-Q", "2025-07-01", "2025-09-30"]]);
  });
  it("every flow is a TTM; EPS is the fiscal year as filed; balances are the latest as filed", () => {
    for (const k of ["operatingIncome", "netIncome", "operatingCashFlow", "capex"] as const) expect(figs.get(k)?.basis, k).toBe("ttm");
    expect(figs.get("netIncome")!.value).toBe(16_046_000_000 + 4_731_000_000 - 4_750_000_000);
    expect(figs.get("epsDiluted")).toMatchObject({ basis: "fy", value: 6.62, periodEnd: "2026-06-30" });
    expect(figs.get("sharesOutstanding")).toMatchObject({ basis: "instant", periodEnd: "2026-09-30", value: 2_317_783_143 });
  });
  it("uses the concept the company reported most recently, and says so in the label", () => {
    // P&G stopped tagging CashAndCashEquivalentsAtCarryingValue; the restricted-cash total is what it files now.
    const c = figs.get("cash")!;
    expect(c.concept).toBe("us-gaap:CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents");
    expect(c.label).toBe("Cash, equivalents and restricted cash");
  });
  it("never a partial TTM: without last year's same quarter it falls back to the fiscal year, labelled", () => {
    const rev = pgFacts.filter(f => f.concept === "us-gaap:Revenues" && f.unit === "USD");
    const noPrior = rev.filter(f => !(f.start === "2025-07-01" && f.end === "2025-09-30"));
    expect(flowFigure(noPrior)).toMatchObject({ basis: "fy", periodEnd: "2026-06-30", value: 87_032_000_000 });
    expect(flowFigure(rev.filter(f => f.start && f.end <= "2026-06-30"))).toMatchObject({ basis: "fy", periodEnd: "2026-06-30" });
    expect(flowFigure([])).toBeNull();
  });
  it("a twelve-month figure in a 10-Q (Amazon reports them) is never taken for a fiscal year", () => {
    const fy: Fact = { concept: "us-gaap:NetIncomeLoss", unit: "USD", start: "2025-01-01", end: "2025-12-31", value: 100, accn: "0001018724-26-000004", form: "10-K", fy: 2025, fp: "FY", filed: "2026-02-06" };
    const ttmInQ = { ...fy, start: "2025-10-01", end: "2026-09-30", value: 135, accn: "0001018724-26-000030", form: "10-Q", fp: "Q3", filed: "2026-10-30" };
    expect(flowFigure([fy, ttmInQ])).toMatchObject({ basis: "fy", periodEnd: "2025-12-31", value: 100 });
  });
  it("a restated figure in a later filing wins over the original", () => {
    const base: Fact = { concept: "us-gaap:Revenues", unit: "USD", start: "2025-01-01", end: "2025-12-31", value: 100, accn: "0000000001-26-000001", form: "10-K", fy: 2025, fp: "FY", filed: "2026-02-01" };
    const restated = { ...base, value: 90, accn: "0000000001-27-000001", filed: "2027-02-01" };
    expect(flowFigure([base, restated])?.value).toBe(90);
    expect(instantFigure([{ ...base, start: "", value: 5 }, { ...base, start: "", value: 6, filed: "2026-03-01", accn: "0000000001-26-000009" }])?.value).toBe(6);
  });
  it("keeps only 10-K and 10-Q values, from the concepts it reads", () => {
    expect(pgFacts.every(f => /^10-[KQ]/.test(f.form))).toBe(true);
    expect(parseFacts({ facts: { "us-gaap": { Goodwill: { units: { USD: [{ end: "2026-06-30", val: 1, accn: "0000080424-26-000103", form: "10-K", filed: "2026-08-04" }] } } } } }, "2000-01-01")).toEqual([]);
    expect(parseFacts({ facts: { "us-gaap": { Revenues: { units: { USD: [{ start: "2025-07-01", end: "2026-06-30", val: 1, accn: "0000080424-26-000103", form: "8-K", filed: "2026-08-04" }] } } } } }, "2000-01-01")).toEqual([]);
    expect(parseFacts(null, "2000-01-01")).toEqual([]);
  });
});

describe("submissions and the ticker list", () => {
  const sub = parseSubmissions(JSON.parse(fx("pg-submissions.json")), "2026-10-01");
  it("the company as EDGAR describes it", () => {
    expect(sub).toMatchObject({ cik: "80424", name: "PROCTER & GAMBLE Co", tickers: ["PG"], exchanges: ["NYSE"], fiscalYearEnd: "0630", stateOfIncorporation: "OH" });
    expect(fiscalYearEnd(sub.fiscalYearEnd)).toBe("June 30");
    expect(fiscalYearEnd("1399")).toBeNull();
  });
  it("its filings since a date, with 8-K items and a link into EDGAR's archive", () => {
    expect(sub.filings.every(f => f.filedOn >= "2026-10-01")).toBe(true);
    const k = sub.filings.find(f => f.form === "8-K")!;
    expect(k).toMatchObject({ items: "8.01,9.01", filedOn: "2026-11-03" });
    expect(k.url).toMatch(/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/80424\/\d{18}\/[\w.-]+$/);
    expect(k.seenAt).toEqual(k.acceptedAt);
    expect(() => parseSubmissions({ cik: "x" }, "2000-01-01")).toThrow();
  });
  it("the ticker list: every ticker under its CIK, junk dropped", () => {
    const m = parseTickers({ 0: { cik_str: 1652044, ticker: "GOOGL", title: "Alphabet Inc." }, 1: { cik_str: 1652044, ticker: "GOOG", title: "Alphabet Inc." }, 2: { cik_str: "x", ticker: "BAD", title: "?" }, 3: { cik_str: 5, ticker: "<script>", title: "x" } });
    expect([...m]).toEqual([["1652044", { name: "Alphabet Inc.", tickers: ["GOOGL", "GOOG"] }]]);
  });
});

describe("EDGAR's live feed for 8-K and Schedule 13G (real pages)", () => {
  it("the company is the Filer of an 8-K", () => {
    const e = parseCurrent(fx("atom-8k.xml"), ["8-K", "8-K/A"]);
    expect(e.length).toBeGreaterThan(0);
    expect(e.every(x => x.role === "Filer" && /^\d{18}$/.test(x.accession) && x.acceptedAt !== null)).toBe(true);
  });
  it("the company is the Subject of a Schedule 13G, never the holder that filed it", () => {
    const e = parseCurrent(fx("atom-13g.xml"), ["SCHEDULE 13G", "SCHEDULE 13G/A"]);
    expect(e.map(x => x.name)).not.toContain("MORGAN STANLEY");
    expect(e.every(x => x.role === "Subject")).toBe(true);
    expect(e.find(x => x.name === "MDA Space Ltd.")?.cik).toBe("1857047");
    expect(parseCurrent(fx("atom-13g.xml"), ["8-K"])).toEqual([]);
  });
});

describe("Forms 3 and 5", () => {
  it("are read from the daily index and labelled as filed", () => {
    const idx = ["3                ACME                                                          11     20261105    edgar/data/11/0000000011-26-000001.txt",
      "5/A              ACME                                                          11     20261105    edgar/data/11/0000000011-26-000002.txt",
      "S-3              ACME                                                          11     20261105    edgar/data/11/0000000011-26-000003.txt"].join("\n");
    expect(parseFormIndex(idx).map(f => f.form)).toEqual(["3", "5/A"]);
    expect(["3", "4/A", "5", "4", "3/A"].map(t => formOf({ documentType: t }))).toEqual(["3", "4/A", "5", "4", "3/A"]);
  });
  it("a 5/A supersedes its Form 5, never a Form 4 in the same group", () => {
    const g = (accession: string, form: string, at: string, originalDate: string | null = null) => ({ accession, form, filedAt: new Date(at), lines: 1, originalDate });
    const l = amendmentLinks([g("f4", "4", "2026-02-10T15:00:00Z"), g("f5", "5", "2026-02-12T15:00:00Z"), g("f5a", "5/A", "2026-02-20T15:00:00Z", "2026-02-12")]);
    expect(l.supersededBy).toEqual(new Map([["f5", "f5a"]]));
  });
});

describe("journal and watchlist input", () => {
  it("a journal entry: a real CIK, one of three statuses, a note up to 5,000 characters", () => {
    expect(parseEntry({ cik: "0000080424", status: "watching", note: "Margins\r\nup" })).toEqual({ cik: "80424", status: "watching", note: "Margins\nup" });
    expect(parseEntry({ cik: "80424", status: "buy", note: "" })).toBeNull();
    expect(parseEntry({ cik: "0", status: "passed" })).toBeNull();
    expect(parseEntry({ cik: "1", status: "passed", note: "x".repeat(9000) })!.note).toHaveLength(5000);
  });
  it("watchlist names and alert forms are cleaned", () => {
    expect(cleanName("  My   list ")).toBe("My list");
    expect(cleanName("   ")).toBeNull();
    expect(cleanForms(["8-K", "ownership", "nope", "8-K"])).toEqual(["8-K", "ownership"]);
    expect(cleanForms("8-K")).toBeNull();
    expect(FAMILY_KEYS).toEqual(["ownership", "8-K", "10-Q", "10-K", "13D/G"]);
  });
});

describe("switching the SEC terminal on", () => {
  it("SEC_FEATURES_READY adds SEC features to FEATURES_READY and nothing else; the price chart never", () => {
    const r = readyFeatures({ FEATURES_READY: "feed,records", SEC_FEATURES_READY: "filings, journal,price_gaps,price_chart,nope" });
    expect([...r].sort()).toEqual(["feed", "filings", "journal", "records"]);
    expect([...readyFeatures({ SEC_FEATURES_READY: "people" })].sort()).toEqual(["feed", "follows", "people", "records"]);
    expect(readyFeatures({ FEATURES_READY: "price_chart" }).has("price_chart")).toBe(false);
  });
});
