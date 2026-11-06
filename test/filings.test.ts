/* Filings, pure (lib/filings): the 8-K feed and Form 4 payload parsing, the Stream rules at their edges, the member's
 * calculators (nothing filled in for them), the formatting of figures as filed, and the ticker directory. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { expectedValue, parseInput, positionPnl, positionProblem } from "@/lib/filings/calc";
import { codeLabel, itemLabel } from "@/lib/filings/codes";
import { codeTotal, filingDetail, filingTitle, usd } from "@/lib/filings/format";
import { eightKItems, easternDate, filedRole, form4Payload, parse8kAtom } from "@/lib/filings/parse";
import { clustersOf, velocityOf, weekOf, whaleOf } from "@/lib/filings/rules";
import { parseTickers } from "@/lib/filings/tickers";
import type { FiledLine, FilingRow, Position } from "@/lib/filings/types";
import { parseOwnership } from "@/lib/stocks/form4";

const fx = (name: string) => readFileSync(join(__dirname, "fixtures/sec", name), "utf8");
const DAY = 86_400_000;

let seq = 0;
function f4(o: { cik?: string; owners: Array<[string | null, string]>; lines: Array<Partial<FiledLine>>; form?: "4" | "4/A"; filedOn?: string }): FilingRow {
  seq++;
  return { id: seq, accession: String(seq).padStart(18, "0"), form: o.form ?? "4", cik: o.cik ?? "100", ticker: "EXDV", company: "Example Devices", acceptedAt: 0, detectedAt: 0,
    filedOn: o.filedOn ?? "2026-10-23", url: `https://www.sec.gov/x/${seq}`,
    payload: { kind: "4", owners: o.owners.map(([cik, name]) => ({ cik, name, role: "Director" })), codes: ["P"], derivativeLines: 0,
      lines: o.lines.map(l => ({ code: "P", ad: "A", date: "2026-10-21", shares: 100, price: 10, value: 1000, ...l })) } };
}

describe("8-K feed", () => {
  const rows = parse8kAtom(fx("atom-8k.xml"));
  it("keeps 8-K and 8-K/A once each, on sec.gov only, with items, acceptance time and filed date", () => {
    expect(rows.map(r => [r.form, r.cik, r.accession])).toEqual([["8-K", "320193", "000032019326000205"], ["8-K/A", "2", "000000000226000999"]]);
    expect(rows[0]).toMatchObject({ company: "Example Devices Inc.", items: ["2.02", "9.01"], filedOn: "2026-10-26", acceptedAt: Date.parse("2026-10-26T16:31:07-04:00") });
    expect(rows[1]!.items).toEqual(["5.02"]);
  });
  it("reads item numbers from the summary, once each, and none when absent", () => {
    expect(eightKItems("<b>Filed:</b> x<br>Item 1.01: A<br>Item 1.01: A<br>Item 7.01: B")).toEqual(["1.01", "7.01"]);
    expect(eightKItems("<b>Filed:</b> 2026-10-26")).toEqual([]);
  });
  it("labels items and codes with the SEC's words, and unknown ones neutrally", () => {
    expect(itemLabel("2.02")).toBe("Results of Operations and Financial Condition");
    expect(codeLabel("P")).toBe("Open market or private purchase");
    expect(itemLabel("99.99")).toBe("Item as filed");
  });
  it("dates in New York time", () => {
    expect(easternDate(Date.parse("2026-10-27T02:00:00Z"))).toBe("2026-10-26");
  });
});

describe("Form 4 payload", () => {
  const p = form4Payload(parseOwnership(fx("form4-ceo-buy.xml")));
  it("keeps non-derivative lines as filed, counts derivative ones, lists every code", () => {
    expect(p.lines).toHaveLength(3);
    expect(p.lines[0]).toEqual({ code: "P", ad: "A", date: "2026-10-21", shares: 5000, price: 182.405, value: 912025 });
    expect(p.derivativeLines).toBe(1);
    expect(p.codes).toEqual(["F", "P"]);
    expect(p.owners).toEqual([{ cik: "1214156", name: "Doe Jane", role: "Chief Executive Officer · Director" }]);
  });
  it("the role is the relationship as filed", () => {
    expect(filedRole({ cik: null, name: "x", isDirector: false, isOfficer: false, isTenPercentOwner: true, officerTitle: null, otherText: null })).toBe("10% owner");
    expect(filedRole({ cik: null, name: "x", isDirector: false, isOfficer: true, isTenPercentOwner: false, officerTitle: null, otherText: null })).toBe("Officer");
  });
});

describe("Stream rules", () => {
  it("whale: $1,000,000.00 qualifies, $999,999.99 doesn't; amendments and sales never do", () => {
    expect(whaleOf(f4({ owners: [["1", "A"]], lines: [{ value: 1_000_000, shares: 1, price: 1_000_000 }] }))?.total).toBe(1_000_000);
    expect(whaleOf(f4({ owners: [["1", "A"]], lines: [{ value: 999_999.99 }] }))).toBeNull();
    expect(whaleOf(f4({ form: "4/A", owners: [["1", "A"]], lines: [{ value: 2_000_000 }] }))).toBeNull();
    expect(whaleOf(f4({ owners: [["1", "A"]], lines: [{ code: "S", ad: "D", value: 5_000_000 }] }))).toBeNull();
  });
  it("whale: lines without a reported price are left out", () => {
    expect(whaleOf(f4({ owners: [["1", "A"]], lines: [{ value: 600_000 }, { value: null, price: null }, { value: 500_000 }] }))?.total).toBe(1_100_000);
  });
  it("the CEO fixture is a whale purchase at the filed total", () => {
    const p = form4Payload(parseOwnership(fx("form4-ceo-buy.xml")));
    const row: FilingRow = { ...f4({ owners: [], lines: [] }), payload: p };
    expect(whaleOf(row)?.total).toBe(1_401_817.5);
  });
  it("cluster: two owner groups buying in one Monday–Sunday week", () => {
    const out = clustersOf([f4({ owners: [["1", "A"]], lines: [{ date: "2026-10-19" }] }), f4({ owners: [["2", "B"]], lines: [{ date: "2026-10-25" }] })]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "cluster", windowStart: "2026-10-19", windowEnd: "2026-10-25", total: 2000, facts: { groups: 2 } });
    expect(out[0]!.key).toBe("cluster:100:2026-10-19");
  });
  it("cluster: joint filers on one filing count once; the same owner twice is one group", () => {
    expect(clustersOf([f4({ owners: [["1", "Fund LP"], ["2", "Fund GP"]], lines: [{}] })])).toEqual([]);
    expect(clustersOf([f4({ owners: [["1", "A"]], lines: [{}] }), f4({ owners: [["1", "A"]], lines: [{}] })])).toEqual([]);
  });
  it("cluster: different weeks don't combine; sales and amendments don't count", () => {
    expect(clustersOf([f4({ owners: [["1", "A"]], lines: [{ date: "2026-10-18" }] }), f4({ owners: [["2", "B"]], lines: [{ date: "2026-10-19" }] })])).toEqual([]);
    expect(clustersOf([f4({ owners: [["1", "A"]], lines: [{}] }), f4({ owners: [["2", "B"]], lines: [{ code: "S", ad: "D" }] })])).toEqual([]);
    expect(clustersOf([f4({ owners: [["1", "A"]], lines: [{}] }), f4({ form: "4/A", owners: [["2", "B"]], lines: [{}] })])).toEqual([]);
  });
  it("weeks start on Monday", () => {
    expect(weekOf("2026-10-25")).toBe("2026-10-19"); // Sunday
    expect(weekOf("2026-10-19")).toBe("2026-10-19"); // Monday
  });
  const NOW = Date.UTC(2026, 10, 6, 15);
  const v = (count: number, baselineCount: number, weeksCollecting: number) => velocityOf({ cik: "100", ticker: "EXDV", company: "Example", now: NOW,
    window: Array.from({ length: count }, () => ({ codes: ["A", "M"] })), baselineCount, collectingSince: NOW - 7 * DAY - weeksCollecting * 7 * DAY });
  it("velocity: 5+ in 7 days and 3× the weekly mean, once 8 weeks are collected", () => {
    expect(v(5, 10, 10)).toMatchObject({ kind: "velocity", facts: { count: 5, weeklyMean: 1, baselineWeeks: 10, codes: { A: 5, M: 5 } } });
    expect(v(4, 0, 10)).toBeNull();          // under 5
    expect(v(6, 30, 10)).toBeNull();         // mean 3 → needs 9
    expect(v(9, 30, 10)).not.toBeNull();
    expect(v(20, 0, 7)).toBeNull();          // only 7 weeks collected
    expect(v(5, 0, 100)?.facts.baselineWeeks).toBe(52);
  });
});

describe("calculators use only what the member typed", () => {
  it("an empty field is missing, never zero", () => {
    expect(parseInput("")).toBeNull();
    expect(parseInput("  ")).toBeNull();
    expect(parseInput("42¢")).toBe(42);
    expect(parseInput("$1,250.50")).toBe(1250.5);
    expect(parseInput("abc")).toBeNull();
  });
  it("EV needs all four inputs, in range", () => {
    expect(expectedValue({ priceCents: 42, probabilityPct: null, contracts: 100, feePerContract: 0.02 })).toBeNull();
    expect(expectedValue({ priceCents: 42, probabilityPct: 55, contracts: 100, feePerContract: null })).toBeNull();
    expect(expectedValue({ priceCents: 100, probabilityPct: 55, contracts: 100, feePerContract: 0 })).toBeNull();
    expect(expectedValue({ priceCents: 42, probabilityPct: 55, contracts: 1.5, feePerContract: 0 })).toBeNull();
  });
  it("EV arithmetic: 0.55 × 0.58 − 0.45 × 0.42 − 0.02 = 0.11", () => {
    const r = expectedValue({ priceCents: 42, probabilityPct: 55, contracts: 100, feePerContract: 0.02 })!;
    expect(r.perContract).toBe(0.11);
    expect(r.total).toBe(11);
    expect(r.breakevenPct).toBe(44);
    expect(r.formula).toBe("0.55 × (1 − 0.42) − 0.45 × 0.42 − 0.02 = 0.11");
  });
  const pos = (o: Partial<Position>): Position => ({ id: "x", kind: "equity", tickers: ["EXDV"], venue: null, label: null, side: "long", quantity: 100, entryPrice: 40,
    entryDate: "2026-10-01", fees: 1, exitPrice: null, resolution: null, closedOn: null, note: "", ...o });
  it("P&L is arithmetic on the member's mark, exit or resolution", () => {
    expect(positionPnl(pos({}), null)).toBeNull();
    expect(positionPnl(pos({}), 43.1)).toBe(309);
    expect(positionPnl(pos({ side: "short" }), 43.1)).toBe(-311);
    expect(positionPnl(pos({ exitPrice: 38 }), 99)).toBe(-201);
    const ev = pos({ kind: "event", side: "yes", tickers: [], label: "Q4 revenue above $2B", entryPrice: 0.41, quantity: 300, fees: 3 });
    expect(positionPnl({ ...ev, resolution: "yes" }, null)).toBe(174);
    expect(positionPnl({ ...ev, resolution: "no" }, null)).toBe(-126);
    expect(positionPnl({ ...ev, resolution: "void" }, null)).toBe(-3);
    expect(positionPnl(ev, 0.5)).toBe(24);
  });
  it("a position is checked for shape only", () => {
    expect(positionProblem(pos({}))).toBeNull();
    expect(positionProblem(pos({ tickers: [] }))).toBe("Pick one ticker.");
    expect(positionProblem(pos({ kind: "event", side: "yes", label: "x", entryPrice: 1.2 }))).toBe("Contract prices are under $1.");
    expect(positionProblem(pos({ quantity: Number.NaN }))).toBe("Quantity must be more than 0.");
  });
});

describe("figures as filed", () => {
  it("money to the cent; titles and details are factual", () => {
    expect(usd(1_401_817.5)).toBe("$1,401,817.50");
    const p = form4Payload(parseOwnership(fx("form4-ceo-buy.xml")));
    const row: FilingRow = { ...f4({ owners: [], lines: [] }), payload: p };
    expect(codeTotal(p.lines, "P")).toBe(1_401_817.5);
    expect(filingTitle(row)).toBe("EXDV · Form 4 · F, P");
    expect(filingDetail(row)).toBe("Doe Jane (Chief Executive Officer · Director) · P $1,401,817.50 · Trade Oct 21, 2026 to Oct 22, 2026");
    const k: FilingRow = { ...row, form: "8-K", payload: { kind: "8-K", items: ["2.02"] } };
    expect(filingTitle(k)).toBe("EXDV · 8-K · Items 2.02");
    expect(filingDetail(k)).toBe("Results of Operations and Financial Condition");
  });
});

describe("ticker directory", () => {
  it("parses company_tickers.json: upper case, CIK without zeros, first ticker wins, junk dropped", () => {
    expect(parseTickers({ 0: { cik_str: 320193, ticker: "aapl", title: "Apple Inc." }, 1: { cik_str: "0000001", ticker: "BRK-B", title: "Berkshire" },
      2: { cik_str: 5, ticker: "AAPL", title: "Dup" }, 3: { cik_str: "x", ticker: "BAD", title: "Bad" }, 4: { cik_str: 6, ticker: "TOO LONG NAME", title: "T" } }))
      .toEqual([{ ticker: "AAPL", cik: "320193", title: "Apple Inc." }, { ticker: "BRK-B", cik: "1", title: "Berkshire" }]);
  });
});
