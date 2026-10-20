/* XBRL accuracy regression on Apple's real company facts (test/fixtures/xbrl-aapl.mjs). The expected numbers were read
 * from Apple's filed financial statements, not from the company facts file:
 *   10-K for the fiscal year ended Sep 27, 2025 (0000320193-25-000079), Consolidated Statements of Operations:
 *     net sales $416,161M, operating income $133,050M, net income $112,010M, diluted EPS $7.46.
 *   10-Q for the quarter ended Jun 27, 2026 (0000320193-26-000020), Condensed Consolidated Statements of Operations:
 *     3 months: net sales $109,417M, operating income $35,695M, net income $29,789M, diluted EPS $2.02;
 *     9 months: net sales $364,357M, net income $101,464M; prior-year 9 months: net sales $313,695M, net income $84,544M.
 * The trailing twelve months are computed by hand from those statements. */
import test from "node:test";
import assert from "node:assert/strict";
import { AAPL_FACTS } from "./fixtures/xbrl-aapl.mjs";
import { extractFinancialFacts, extractTtm, extractAnnualSeries, periodTypeOf, trailingTwelveMonths } from "../src/intelligence.mjs";

const M = 1_000_000;

test("latest facts: the quarter, labelled as a quarter, never the year to date that shares its end date", () => {
  const facts = Object.fromEntries(extractFinancialFacts(AAPL_FACTS, "0000320193").map(f => [f.id, f]));
  assert.equal(facts.revenue.value, 109_417 * M);
  assert.equal(facts.revenue.periodType, "quarter"); assert.equal(facts.revenue.durationDays, 91);
  assert.equal(facts.revenue.start, "2026-03-29"); assert.equal(facts.revenue.periodEnd, "2026-06-27");
  assert.equal(facts.revenue.form, "10-Q"); assert.equal(facts.revenue.accession, "0000320193-26-000020");
  assert.equal(facts.revenue.concept, "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax");
  assert.match(facts.revenue.sourceUrl, /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/320193\/000032019326000020\//);
  assert.equal(facts.netIncome.value, 29_789 * M); assert.equal(facts.netIncome.periodType, "quarter");
  assert.equal(facts.operatingIncome.value, 35_695 * M);
  assert.equal(facts.assets.periodType, "instant"); assert.equal(facts.assets.periodEnd, "2026-06-27");
});

test("trailing twelve months: fiscal year + current year to date − prior year to date", () => {
  const ttm = extractTtm(AAPL_FACTS, "0000320193");
  assert.equal(ttm.revenue.value, (416_161 + 364_357 - 313_695) * M);
  assert.equal(ttm.revenue.basis, "ttm"); assert.equal(ttm.revenue.periodEnd, "2026-06-27"); assert.equal(ttm.revenue.periodStart, "2025-06-29");
  assert.equal(ttm.netIncome.value, (112_010 + 101_464 - 84_544) * M);
  // The prior-year nine months is the comparative column of the latest 10-Q (the figure as most recently reported), so
  // the three periods come from two filings: the 10-K and that 10-Q, both linked.
  assert.deepEqual(ttm.revenue.sources.map(u => u.split("/")[7]).sort(), ["000032019325000079", "000032019326000020"]);
});

test("EPS is never added across periods: the fiscal year's diluted EPS as reported", () => {
  const ttm = extractTtm(AAPL_FACTS, "0000320193");
  assert.equal(ttm.eps.value, 7.46);
  assert.equal(ttm.eps.basis, "fiscal-year"); assert.equal(ttm.eps.periodEnd, "2025-09-27");
});

test("annual series: full fiscal years only, each point its own filing", () => {
  const s = extractAnnualSeries(AAPL_FACTS, "0000320193");
  const fy25 = s.revenue.points.find(p => p.periodEnd === "2025-09-27");
  assert.equal(fy25.value, 416_161 * M); assert.equal(fy25.form, "10-K");
  assert.ok(s.revenue.points.every(p => (Date.parse(p.periodEnd) - Date.parse(p.start)) / 86400000 >= 350), "no quarter or year to date in an annual series");
  assert.equal(s.netIncome.points.find(p => p.periodEnd === "2025-09-27").value, 112_010 * M);
  assert.equal(s.operatingIncome.points.find(p => p.periodEnd === "2025-09-27").value, 133_050 * M);
});

test("period types", () => {
  assert.deepEqual(periodTypeOf({ start: "2026-03-29", end: "2026-06-27" }), { periodType: "quarter", durationDays: 91 });
  assert.deepEqual(periodTypeOf({ start: "2025-09-28", end: "2026-06-27" }), { periodType: "year-to-date", durationDays: 273 });
  assert.deepEqual(periodTypeOf({ start: "2024-09-29", end: "2025-09-27" }), { periodType: "fiscal-year", durationDays: 364 });
  assert.deepEqual(periodTypeOf({ end: "2025-09-27" }), { periodType: "instant", durationDays: null });
  // A 53-week fiscal year is still a fiscal year.
  assert.equal(periodTypeOf({ start: "2022-09-25", end: "2023-09-30" }).periodType, "fiscal-year");
  // Without a matching prior year to date, TTM falls back to the fiscal year and says so.
  const rows = [{ start: "2024-09-29", end: "2025-09-27", val: 10, form: "10-K", filed: "2025-10-31", accn: "a" }];
  assert.equal(trailingTwelveMonths(rows).basis, "fiscal-year");
});

test("changes: latest quarter against the same quarter a year earlier, both as filed (Apple Q3 FY2026 vs Q3 FY2025)", async () => {
  const { extractFactChanges } = await import("../src/intelligence.mjs");
  const by = Object.fromEntries(extractFactChanges(AAPL_FACTS, "0000320193").map(c => [c.id, c]));
  // The prior-year column of the 10-Q for the quarter ended Jun 27, 2026 (0000320193-26-000020): three months ended
  // Jun 28, 2025: net sales $94,036M, operating income $28,202M, net income $23,434M.
  assert.deepEqual([by.revenue.current.value, by.revenue.prior.value], [109_417 * M, 94_036 * M]);
  assert.deepEqual([by.revenue.current.periodType, by.revenue.prior.periodType], ["quarter", "quarter"]);
  assert.deepEqual([by.revenue.current.end, by.revenue.prior.end], ["2026-06-27", "2025-06-28"]);
  assert.equal(by.revenue.change, (109_417 - 94_036) * M);
  assert.equal(by.operatingIncome.prior.value, 28_202 * M); assert.equal(by.netIncome.prior.value, 23_434 * M);
  assert.equal(by.revenue.concept, "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax");
  assert.match(by.revenue.current.sourceUrl, /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/320193\/000032019326000020\//);
  // A balance is compared with the balance a year earlier, never with a flow.
  assert.equal(by.assets.current.periodType, "instant"); assert.equal(by.assets.prior.periodType, "instant");
  assert.ok(Object.values(by).every(c => c.current.periodType === c.prior.periodType), "never a quarter against a year to date");
});
