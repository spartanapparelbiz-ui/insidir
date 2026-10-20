/* Form 4 accuracy regression: nine real SEC filings (test/fixtures/form4/<accession>.xml, downloaded from EDGAR on
 * 2026-10-20) run through the production parser. Every expected value below was read by hand from the XML document
 * itself, not produced by this parser: the transaction codes, share counts, prices, the A/D code, direct or indirect
 * ownership, roles, and the dollar values (shares × price as filed, computed by hand to the cent).
 * The cases: an open-market purchase filed late, a sale under a Rule 10b5-1 plan, an exercise of subscription rights
 * (derivative and non-derivative lines), a gift, tax withholding, a class conversion with no price, a stock award with
 * a zero price, an amended Form 4 (4/A), and a joint filing by two reporting owners with seventeen lines. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseOwnership, filedValue, validateOwnership } from "../src/sec.mjs";

const parse = acc => parseOwnership(readFileSync(new URL("./fixtures/form4/" + acc + ".xml", import.meta.url), "utf8"),
  { accession: acc, filerCik: "1", sourceUrl: "https://www.sec.gov/Archives/edgar/data/1/" + acc + "/x-index.htm", title: "4", formType: "4", publishedAt: "2026-10-16T00:00:00Z" });
const pick = t => ({ code: t.code, ad: t.acquiredDisposed, derivative: t.derivative, category: t.category, shares: t.shares, price: t.pricePerShare, value: t.estimatedValue, direct: t.directOwnership, date: t.transactionDate });

test("open-market purchase (P/A), reported nearly a month after the trade", () => {
  const f = parse("000070686326000085");
  assert.equal(f.issuerCik, "0000706863"); assert.equal(f.issuerName, "UNION BANKSHARES INC"); assert.equal(f.ticker, "UNB");
  assert.deepEqual(f.owners.map(o => [o.cik, o.name, o.isDirector, o.isOfficer]), [["0002108967", "Cote Steven P", true, false]]);
  assert.equal(f.transactions.length, 1);
  assert.deepEqual(pick(f.transactions[0]), { code: "P", ad: "A", derivative: false, category: "reported_purchase", shares: 418, price: 23.725, value: 9917.05, direct: "D", date: "2026-09-17" });
  assert.equal(f.transactions[0].sharesAfter, 1212);
  assert.equal(f.periodOfReport, "2026-09-17");
  assert.equal(f.rule10b51, false);
});

test("sale (S/D) marked as made under a Rule 10b5-1 plan; fractional holdings after", () => {
  const f = parse("000090445426000519");
  assert.equal(f.ticker, "TER"); assert.equal(f.rule10b51, true);
  assert.deepEqual(pick(f.transactions[0]), { code: "S", ad: "D", derivative: false, category: "reported_sale", shares: 800, price: 341.28, value: 273024, direct: "D", date: "2026-10-15" });
  assert.equal(f.transactions[0].sharesAfter, 13040.675);
});

test("exercise of subscription rights: an acquisition at the exercise price, not an open-market purchase", () => {
  const f = parse("000101297526000957");
  assert.equal(f.ticker, "RENT");
  // A joint filing by five related entities, every one a 10% owner (five reportingOwner elements in the document).
  assert.deepEqual(f.owners.map(o => [o.name, o.isTenPercentOwner]), [["CHS US Investments LLC", true], ["CHS GP LP", true], ["CHS UGP LLC", true],
    ["CHS Platform Holdings Pte. Ltd.", true], ["CHS (US) Management LLC", true]]);
  const [common, rights] = f.transactions;
  assert.deepEqual(pick(common), { code: "M", ad: "A", derivative: false, category: "other", shares: 2495391, price: 3.55, value: 8858638.05, direct: "D", date: "2026-10-14" });
  // The derivative line counts rights, not shares: 19,947,174 rights for 2,495,391 underlying shares at $3.55.
  assert.deepEqual(pick(rights), { code: "M", ad: "D", derivative: true, category: "other", shares: 19947174, price: 0, value: null, direct: "D", date: "2026-10-14" });
  assert.equal(rights.securityTitle, "Subscription Rights (right to buy)");
  assert.equal(rights.underlyingTitle, "Class A Common Stock"); assert.equal(rights.underlyingShares, 2495391);
  assert.equal(rights.exercisePrice, 3.55); assert.equal(rights.exerciseDate, "2026-09-25"); assert.equal(rights.expirationDate, "2026-10-14");
});

test("gift (G/D): no price, so no value; a gift is neither a sale nor a purchase", () => {
  const f = parse("000119312526422866");
  assert.equal(f.ticker, "FHI");
  // Relationship flags filed as "true"/"false" words; the officer title's &amp; decoded.
  assert.deepEqual(f.owners.map(o => [o.isDirector, o.isOfficer, o.officerTitle]), [[true, true, "VP, CFO & Treasurer"]]);
  assert.equal(f.transactions.length, 1, "holdings without a transaction are not transactions");
  assert.deepEqual(pick(f.transactions[0]), { code: "G", ad: "D", derivative: false, category: "other", shares: 17670, price: 0, value: null, direct: "D", date: "2026-10-15" });
});

test("tax withholding (F/D) is not an open-market sale", () => {
  const f = parse("000005513526000165");
  assert.equal(f.ticker, "KELYA");
  assert.deepEqual(pick(f.transactions[0]), { code: "F", ad: "D", derivative: false, category: "other", shares: 27716, price: 15.57, value: 431538.12, direct: "D", date: "2026-10-15" });
});

test("class conversion (C) with no price on the filing: no value, indirect ownership with its nature", () => {
  const f = parse("000119312526424188");
  assert.equal(f.ticker, "NTSK");
  const [a, b] = f.transactions;
  assert.deepEqual(pick(a), { code: "C", ad: "A", derivative: false, category: "other", shares: 421600, price: null, value: null, direct: "I", date: "2026-10-15" });
  assert.equal(a.natureOfOwnership, "See footnote");
  assert.equal(b.derivative, true); assert.equal(b.underlyingShares, 421600); assert.equal(b.exercisePrice, null, "the price is only in a footnote");
});

test("stock award (A/A) with a zero price: no value, and not a purchase", () => {
  const f = parse("000110465926115984");
  assert.equal(f.ticker, "GDS");
  assert.deepEqual(pick(f.transactions[0]), { code: "A", ad: "A", derivative: false, category: "other", shares: 1330, price: 0, value: null, direct: "D", date: "2026-10-15" });
  assert.equal(f.transactions[0].securityTitle, "American Depositary Shares", "ADSs are not ordinary shares; the title says so");
});

test("amended Form 4 (4/A) names the filing it amends", () => {
  const f = parse("000207570426000038");
  assert.equal(f.formType, "4/A"); assert.equal(f.isAmendment, true); assert.equal(f.originalFiledOn, "2026-09-17");
  assert.equal(f.rule10b51, true);
  assert.deepEqual(pick(f.transactions[0]), { code: "S", ad: "D", derivative: false, category: "reported_sale", shares: 1991, price: 36.78, value: 73228.98, direct: "D", date: "2026-09-15" });
});

test("joint filing: two reporting owners, seventeen lines, lines not attributed to one owner", () => {
  const f = parse("000007085826000486");
  assert.equal(f.ticker, "PCQ");
  assert.deepEqual(f.owners.map(o => [o.cik, o.name]), [["0000070858", "BANK OF AMERICA CORP /DE/"], ["0000728612", "MERRILL LYNCH, PIERCE, FENNER & SMITH INC."]]);
  assert.equal(f.transactions.length, 17);
  assert.ok(f.transactions.every(t => t.ownerCik === null), "a joint line belongs to both owners, so to neither alone");
  const buys = f.transactions.filter(t => t.category === "reported_purchase"), sells = f.transactions.filter(t => t.category === "reported_sale");
  assert.deepEqual(buys.map(pick), [{ code: "P", ad: "A", derivative: false, category: "reported_purchase", shares: 2000, price: 8.1303, value: 16260.6, direct: "I", date: "2026-10-14" }]);
  assert.equal(sells.length, 16);
  assert.equal(sells.reduce((s, t) => s + t.shares, 0), 2000);
  // 500 × 7.7016 = 3,850.80 and fifteen × (100 × 7.715 = 771.50) = 11,572.50; total 15,423.30, summed in cents.
  assert.equal(sells.reduce((s, t) => s + Math.round(t.estimatedValue * 100), 0), 1542330);
  assert.deepEqual(sells.map(t => t.sharesAfter).slice(0, 3), [1900, 1800, 1300]);
});

test("filed values are exact to the cent", () => {
  assert.equal(filedValue("1", "1.005"), 1.01, "a float product would round this down");
  assert.equal(filedValue("3", "0.335"), 1.01);
  assert.equal(filedValue("2", "0.0025"), 0.01);
  assert.equal(filedValue("10", "0"), null);
  assert.equal(filedValue("10", null), null);
  assert.equal(filedValue("-5", "2"), null);
  assert.equal(filedValue("1000000000", "123.45678"), 123456780000);
});

test("validation: every real filing above passes; broken records are flagged with the reason", () => {
  for (const acc of ["000070686326000085", "000090445426000519", "000101297526000957", "000119312526422866", "000005513526000165",
    "000119312526424188", "000110465926115984", "000207570426000038", "000007085826000486"]) {
    const v = validateOwnership(parse(acc));
    assert.notEqual(v.status, "flagged", acc + " " + JSON.stringify(v.issues));
  }
  const good = parse("000070686326000085");
  const codes = f => validateOwnership(f).issues.filter(i => i.severity === "error").map(i => i.code);
  assert.deepEqual(codes({ ...good, transactions: [{ ...good.transactions[0], transactionDate: "2026-12-01" }] }), ["date_after_filing"]);
  assert.deepEqual(codes({ ...good, sourceUrl: "https://example.com/x" }), ["source_url"]);
  assert.deepEqual(codes({ ...good, owners: [] }), ["no_owner"]);
  assert.deepEqual(codes({ ...good, issuerCik: "" }), ["issuer_cik"]);
  assert.deepEqual(codes({ ...good, transactions: [{ ...good.transactions[0], shares: -5 }] }), ["negative_shares"]);
  assert.deepEqual(codes({ ...good, isAmendment: true, originalFiledOn: "2027-01-01" }), ["amendment_date"]);
  assert.equal(validateOwnership({ ...good, owners: [{ name: "No CIK" }] }).status, "warnings");
});
