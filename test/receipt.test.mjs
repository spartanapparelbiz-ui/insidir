import test from "node:test";
import assert from "node:assert/strict";
import { stampOf, stakeChange, receiptLines, renderReceipt, tapeText, renderTape, headlineOf, liveHeadlines, MAX_HEADLINE } from "../src/receipt.mjs";

/* The receipt (src/receipt.mjs): every value from the filing, nothing estimated. Fixtures are fictional. */
const NOW = Date.parse("2026-10-23T15:00:00Z");
const r = (extra = {}) => ({ id: "x", ticker: "EXMP", issuer_name: "EXAMPLE CORP", owner_name: "DOE JANE", role: "director", transaction_code: "P", transaction_date: "2026-10-22",
  shares: "10000", shares_after: "60000", price_per_share: "24.5", estimated_value: "245000", source_url: "https://www.sec.gov/Archives/edgar/data/99/x/form4.xml",
  published_at: "2026-10-23T14:45:00Z", rule_10b5_1: false, ...extra });

test("the stamp says what the insider did; a plan sale is PRE-SCHEDULED, never hidden", () => {
  assert.equal(stampOf(r()), "bought");
  assert.equal(stampOf(r({ transaction_code: "S" })), "sold");
  assert.equal(stampOf(r({ transaction_code: "S", rule_10b5_1: true })), "planned");
  assert.equal(stampOf(r({ transaction_code: "A" })), null, "grants get no stamp");
});

test("stake change: from shares traded and shares held after, as filed", () => {
  assert.deepEqual(stakeChange(r()), { text: "+20%", pct: 0.2 }, "50,000 → 60,000");
  assert.equal(stakeChange(r({ transaction_code: "S", shares: "10000", shares_after: "30000" })).text, "−25%", "40,000 → 30,000");
  assert.equal(stakeChange(r({ shares_after: "10000" })).text, "NEW POSITION");
  assert.equal(stakeChange(r({ transaction_code: "S", shares_after: "0" })).text, "−100% (ALL)");
  assert.equal(stakeChange(r({ shares: "100", shares_after: "1000100" })).text, "+0.0%");
  assert.equal(stakeChange(r({ shares_after: null })), null, "no holding in the filing: the line is left off");
});

test("the slip: real values only, the filing link, a label for screen readers", () => {
  assert.deepEqual(receiptLines(r(), NOW), [["INSIDER", "Jane Doe"], ["ROLE", "DIRECTOR"], ["SHARES", "10,000"], ["PRICE", "$24.50"], ["TOTAL", "$245K"], ["STAKE CHANGE", "+20%"], ["FILED", "15 MIN AGO"]]);
  assert.deepEqual(receiptLines(r({ role: null, price_per_share: null, shares_after: null }), NOW).map(x => x[0]), ["INSIDER", "SHARES", "TOTAL", "FILED"]);
  const html = renderReceipt(r(), { now: NOW, print: true, id: "x" });
  assert.match(html, /^<article class="rc rc--bought rc--print" data-id="x" aria-label="Jane Doe, director, bought \$245K of EXMP">/);
  assert.match(html, /<p class="rc__co"><a href="\/EXMP">EXAMPLE \(EXMP\)<\/a><\/p>/);
  assert.match(html, /<a class="rc__link" href="https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/99\/x\/form4\.xml" rel="nofollow noopener" target="_blank">view SEC filing →<\/a>/);
  assert.match(html, /rc__stamp--bought" aria-hidden="true">BOUGHT</);
  assert.ok(!/<b>x/i.test(renderReceipt(r({ owner_name: "<B>X</B>" }), { now: NOW })), "names are escaped");
  assert.doesNotMatch(renderReceipt(r({ source_url: "https://evil.example/x" }), { now: NOW }), /rc__link/, "only sec.gov links");
  assert.match(renderReceipt(r({ transaction_code: "S", rule_10b5_1: true }), { now: NOW }), /aria-label="Jane Doe, director, sold \$245K of EXMP under a pre-scheduled plan"[\s\S]*PRE-SCHEDULED/);
});

test("the tape: ticker, arrow, role, verb and amount; links to the stock page", () => {
  assert.equal(tapeText(r()), "DIR BOUGHT $245K");
  assert.equal(tapeText(r({ role: "CEO", transaction_code: "S", estimated_value: "28000000", rule_10b5_1: true })), "CEO SOLD $28M · PLAN");
  const html = renderTape([r(), r({ transaction_code: "A" })]);
  assert.equal((html.match(/<li>/g) || []).length, 2, "one item, twice (the second copy closes the loop)");
  assert.match(html, /<ul aria-hidden="true" inert>/);
  assert.equal(renderTape([]), "");
});

test("the live headline: facts only, 'just' only when it is fresh", () => {
  assert.equal(headlineOf(r(), NOW), "A director at Example just bought $245K of EXMP.");
  assert.equal(headlineOf(r({ role: "CEO", issuer_name: "SAMPLE HOLDINGS INC", ticker: "SMPL", transaction_code: "S", estimated_value: "28000000" }), NOW), "Sample Holdings' CEO just sold $28M of SMPL.");
  assert.equal(headlineOf(r({ published_at: "2026-10-20T14:00:00Z", transaction_date: "2026-10-16" }), NOW), "A director at Example bought $245K of EXMP on Oct 16.");
  assert.equal(headlineOf(r({ transaction_code: "S", rule_10b5_1: true }), NOW), "A director at Example just sold $245K of EXMP on a pre-set plan.");
  assert.equal(headlineOf(r({ role: null }), NOW), "An insider at Example just bought $245K of EXMP.");
  const many = [r({ estimated_value: "50000" }), r(), r(), r({ issuer_name: "A COMPANY WITH A VERY LONG NAME INDEED HOLDINGS" })];
  assert.deepEqual(liveHeadlines(many, NOW), ["A director at Example just bought $245K of EXMP."], "small trades, repeats and lines too long to read at display size are skipped");
  assert.ok(liveHeadlines(many, NOW).every(h => h.length <= MAX_HEADLINE));
});
