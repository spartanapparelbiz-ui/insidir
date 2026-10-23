import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

/* The insider track record: trades from Form 4 lines, returns at 1, 3 and 6 months, hit rates and the card line. */
// src/config.mjs reads DATABASE_URL once, when first imported: set it (to this suite's own schema) before any import.
const PG_URL = process.env.INSIDIR_TEST_DATABASE_URL || "";
const SCHEMA = "track_record_test_" + process.pid;
if (PG_URL) process.env.DATABASE_URL = PG_URL + (PG_URL.includes("?") ? "&" : "?") + "options=" + encodeURIComponent("-c search_path=" + SCHEMA);
const T = await import("../src/track-record.mjs");
const { dailyCloses } = await import("../src/prices.mjs");

/* A price series: one close per weekday from `from` for `days` days, from a function of the day index. */
function series(from, days, price) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = T.addDays(from, i), wd = new Date(d + "T00:00:00Z").getUTCDay();
    if (wd !== 0 && wd !== 6) out.push([d, price(i)]);
  }
  return out;
}
const line = over => ({ owner_cik: "0000000042", issuer_cik: "0000000099", ticker: "EXMP", owner_name: "DOE JANE", transaction_code: "P", derivative: false,
  transaction_date: "2025-01-06", shares: "1000", price_per_share: "10", estimated_value: "10000", accession: "0000000001-25-000001",
  source_url: "https://www.sec.gov/Archives/edgar/data/99/a.xml", published_at: "2025-01-07T21:00:00Z", rule_10b5_1: false, ...over });

test("trades: one per owner, issuer, date and code, at the share-weighted price as filed", () => {
  const trades = T.groupTrades([
    line({ shares: "1000", price_per_share: "10", estimated_value: "10000" }),
    line({ shares: "3000", price_per_share: "12", estimated_value: "36000" }),
    line({ transaction_code: "S", shares: "500", price_per_share: "15", estimated_value: "7500" }),
    line({ transaction_code: "M", shares: "9999" }),                             // an option exercise: not open market
    line({ derivative: true }),                                                    // a derivative line
    line({ transaction_date: "2025-02-03", shares: "200", price_per_share: "11" })]);
  assert.equal(trades.length, 3);
  const buy = trades.find(t => t.date === "2025-01-06" && t.code === "P");
  assert.deepEqual([buy.shares, buy.price, buy.value, buy.lines, buy.ownerKey, buy.issuerKey], [4000, 11.5, 46000, 2, "42", "99"]);
  assert.equal(buy.sourceUrl, "https://www.sec.gov/Archives/edgar/data/99/a.xml");
  assert.equal(trades[0].date, "2025-02-03", "newest first");
});

test("trades: a 4/A that repeats a line replaces it instead of doubling the trade", () => {
  const trades = T.groupTrades([line({}), line({ accession: "0000000001-25-000009", published_at: "2025-01-20T21:00:00Z" })]);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].shares, 1000);
  assert.equal(trades[0].lines, 1);
});

test("returns at 1, 3 and 6 months from the Form 4 price; a future horizon is pending, never guessed", () => {
  // Closes rise 1% a calendar day from $10 on 2025-01-06.
  const s = series("2025-01-01", 400, i => Math.round(10 * (1 + 0.01 * (i - 5)) * 100) / 100);
  const [trade] = T.groupTrades([line({})]);
  const o = T.tradeOutcome(trade, s, "2025-05-01");
  assert.equal(o.base, 10); assert.equal(o.baseSource, "form4");
  // 2025-02-05 is a Wednesday: day 35 from 01-01 -> 10 * 1.30 = 13.
  assert.equal(o.ret["1m"], 0.3);
  assert.equal(o.ret["3m"], 0.91, "first close on or after 2025-04-07 (a Monday, day 96): 10 * 1.91");
  assert.equal(o.ret["6m"], null); assert.equal(o.pending["6m"], true);
  assert.equal(o.pending["3m"], false);
});

test("a split since the trade: the filed price is replaced by the provider's adjusted close on the trade date", () => {
  const s = series("2025-01-01", 200, () => 5);                // a 2-for-1 split: the adjusted history shows $5
  const [trade] = T.groupTrades([line({ price_per_share: "10" })]);
  const o = T.tradeOutcome(trade, s, "2025-12-31");
  assert.deepEqual([o.base, o.baseSource, o.ret["1m"]], [5, "close", 0]);
  const noPrice = T.tradeOutcome(T.groupTrades([line({ price_per_share: null, estimated_value: null })])[0], s, "2025-12-31");
  assert.deepEqual([noPrice.base, noPrice.baseSource], [5, "close"]);
});

test("no close within a week of the horizon (halted or delisted): no return rather than a stale one", () => {
  const s = series("2025-01-01", 20, () => 10);                 // the series stops in January
  const o = T.tradeOutcome(T.groupTrades([line({})])[0], s, "2025-12-31");
  assert.deepEqual(o.ret, { "1m": null, "3m": null, "6m": null });
  assert.deepEqual(T.closeOnOrAfter([["2025-01-02", 1], ["2025-01-20", 2]], "2025-01-03"), null);
  assert.deepEqual(T.closeOnOrAfter([["2025-01-02", 1], ["2025-01-09", 2]], "2025-01-03"), { day: "2025-01-09", close: 2 });
  assert.deepEqual(T.closeOnOrBefore([["2025-01-02", 1], ["2025-01-09", 2]], "2025-01-05"), { day: "2025-01-02", close: 1 });
});

test("hit rates: a buy hits when the stock rose, a sale when it fell; only matured trades count", () => {
  const o = (code, r3, r1 = r3) => ({ code, ret: { "1m": r1, "3m": r3, "6m": null } });
  const sum = T.summarize([o("P", 0.10), o("P", 0.02), o("P", -0.05), o("P", 0.30), o("P", 0.01), o("P", 0.00), o("P", 0.04), o("P", -0.20), o("P", null),
    o("S", -0.10), o("S", 0.05), o("S", -0.01)]);
  assert.deepEqual(sum.buys["3m"], { n: 8, hits: 5, avg: 0.0275 });
  assert.equal(sum.buys.count, 9);
  assert.deepEqual(sum.sells["3m"], { n: 3, hits: 2, avg: -0.02 });
  assert.deepEqual(sum.buys["6m"], { n: 0, hits: 0, avg: null });
  assert.equal(T.hitSentence(sum.buys, "P"), "5 of their last 8 buys were up 3 months later.");
  assert.equal(T.hitSentence(sum.sells, "S"), "2 of their last 3 sales were followed by a drop 3 months later.");
  assert.equal(T.hitSentence({ "3m": { n: 2, hits: 2 } }, "P"), "2 of their last 2 buys were up 3 months later (too few to judge).");
  assert.equal(T.hitSentence(sum.buys, "P", "6m"), null);
  assert.equal(T.isHit("P", 0), false, "flat is not up");
});

test("the card line: the row's own side, the role as filed, and nothing invented", () => {
  const record = { buys: { count: 8, "3m": { n: 8, hits: 6 } }, sells: { count: 2, "3m": { n: 2, hits: 1 } } };
  assert.equal(T.cardLine(record, { code: "P", role: "director" }), "This director's past buys: 6/8 up after 3 months.");
  assert.equal(T.cardLine(record, { code: "S", role: "CFO" }), "This CFO's past sales: 1/2 followed by a drop after 3 months.");
  assert.equal(T.cardLine({ buys: { count: 3, "3m": { n: 3, hits: 2 } }, sells: { count: 1, "3m": { n: 0, hits: 0 } } }, { code: "S" }), "This insider's past buys: 2/3 up after 3 months.");
  assert.equal(T.cardLine({ buys: { count: 1, "3m": { n: 0, hits: 0 } }, sells: { count: 0, "3m": { n: 0 } } }, { code: "P" }), "This insider's open-market trades here are under 3 months old: no track record yet.");
  assert.equal(T.cardLine(null), null);
  assert.equal(T.roleWord({ is_officer: true, officer_title: "Chief Financial Officer" }), "CFO");
  assert.equal(T.roleWord({ is_director: true }), "director");
  assert.equal(T.roleWord({ is_officer: true, is_director: true, officer_title: "EVP, Sales" }), "director");
  assert.equal(T.roleWord({ is_ten_percent_owner: true }), "10% owner");
});

test("daily closes from the provider's chart payload, by the exchange's trading day", () => {
  const payload = { chart: { result: [{ meta: { symbol: "BRK-B", gmtoffset: -14400 }, timestamp: [1736173800, 1736260200, 1736346600],
    indicators: { quote: [{ close: [450.5, null, 452.25] }] } }] } };
  assert.deepEqual(dailyCloses(payload, "BRK.B"), [["2025-01-06", 450.5], ["2025-01-08", 452.25]]);
  assert.deepEqual(dailyCloses(payload, "AAPL"), [], "another symbol's data is refused");
});

test("track records on PostgreSQL: the worker, the person page and the trade cards", { skip: !PG_URL && "set INSIDIR_TEST_DATABASE_URL" }, async () => {
  const admin = new pg.Client({ connectionString: PG_URL });
  await admin.connect();
  await admin.query("CREATE SCHEMA IF NOT EXISTS " + SCHEMA);
  const db = await import("../src/db.mjs");
  try {
    await db.migrate();
    const q = (sql, p) => db.query(sql, p);
    const filing = (acc, day) => q(`INSERT INTO sec_filings(accession,filer_cik,issuer_cik,issuer_name,ticker,title,source_url,ingest_status,published_at,rule_10b5_1)
      VALUES($1,'42','0000000099','EXAMPLE CORP','EXMP','4',$2,'parsed',$3,false)`, [acc, "https://www.sec.gov/Archives/edgar/data/99/" + acc + ".xml", day + "T21:00:00Z"]);
    const tx = (id, acc, day, code, shares, price) => q(`INSERT INTO sec_transactions(id,accession,issuer_cik,ticker,owner_cik,owner_name,transaction_date,transaction_code,acquired_disposed,category,shares,price_per_share,estimated_value,source_url)
      VALUES($1,$2,'0000000099','EXMP','0000000042','DOE JANE',$3,$4,$5,$6,$7,$8,$7::numeric*$8::numeric,$9)`,
      [id, acc, day, code, code === "P" ? "A" : "D", code === "P" ? "reported_purchase" : "reported_sale", shares, price, "https://www.sec.gov/Archives/edgar/data/99/" + acc + ".xml"]);
    // Three buys and one sale over 2024; the price climbs steadily, then falls from 2024-09.
    const trades = [["2024-01-08", "P", 10], ["2024-03-04", "P", 11], ["2024-05-06", "P", 12.5], ["2024-08-05", "S", 15]];
    for (const [i, [day, code, price]] of trades.entries()) { const acc = "0000000042-24-00000" + i; await filing(acc, day); await tx("t" + i, acc, day, code, 1000, price); }
    await q(`INSERT INTO sec_filing_owners(accession,owner_cik,owner_name,is_director) VALUES('0000000042-24-000003','0000000042','DOE JANE',true)`);
    const closes = series("2023-12-01", 500, i => i < 280 ? 10 + i * 0.02 : 15.6 - (i - 280) * 0.03);
    let downloads = 0;
    const fetcher = async url => { downloads++; assert.match(url, /chart\/EXMP\?range=10y&interval=1d/);
      return { chart: { result: [{ meta: { symbol: "EXMP", gmtoffset: 0 }, timestamp: closes.map(c => Date.parse(c[0] + "T14:30:00Z") / 1000), indicators: { quote: [{ close: closes.map(c => c[1]) }] } }] } }; };
    const now = Date.parse("2025-01-15T12:00:00Z");

    const run = await T.refreshTrackRecords(q, { fetcher, now });
    assert.deepEqual([run.pairs, run.done, run.failed], [1, 1, 0]);
    assert.equal(downloads, 1);
    assert.equal((await T.refreshTrackRecords(q, { fetcher, now })).pairs, 0, "fresh records are not recomputed");

    const record = (await q("SELECT * FROM insider_track_records WHERE owner_key='42' AND issuer_key='99'")).rows[0];
    assert.equal(record.role, "director");
    assert.deepEqual(record.buys["3m"].n, 3);
    assert.equal(record.buys["3m"].hits, 3, "every buy was up 3 months later");
    assert.deepEqual([record.sells["3m"].n, record.sells["3m"].hits], [1, 1], "the sale was followed by a drop");

    const page = await T.personTrackRecord(q, "0000000042", { fetcher, now });
    assert.equal(page.overall.sentences.buys, "3 of their last 3 buys were up 3 months later.");
    assert.equal(page.companies[0].card, "This director's past buys: 3/3 up after 3 months.");
    assert.equal(page.trades.length, 4);
    const sale = page.trades.find(t => t.code === "S");
    assert.equal(sale.hits["3m"], true);
    assert.equal(sale.evidence.url, "https://www.sec.gov/Archives/edgar/data/99/0000000042-24-000003.xml", "every trade links to its Form 4");
    assert.equal(sale.evidence.source, "SEC Form 4");
    assert.match(sale.evidence.methodology, /Yahoo Finance/);
    assert.equal(page.disclaimer, "Past trades and past returns. Research, not investment advice.");

    const rows = [{ owner_cik: "0000000042", issuer_cik: "0000000099", transaction_code: "P", derivative: false }, { owner_cik: null, issuer_cik: "99", transaction_code: "P" },
      { owner_cik: "0000000042", issuer_cik: "0000000099", transaction_code: "A" }];
    await T.withTrackRecords(rows, q);
    assert.equal(rows[0].track_record.line, "This director's past buys: 3/3 up after 3 months.");
    assert.equal(rows[0].track_record.url, "person.html?cik=42#track-record");
    assert.equal(rows[1].track_record, undefined, "joint lines: no single owner to attribute");
    assert.equal(rows[2].track_record, undefined, "an award is not an open-market trade");

    // A new line makes the pair stale again.
    await filing("0000000042-25-000009", "2025-01-10"); await tx("t9", "0000000042-25-000009", "2025-01-10", "P", 500, 9);
    assert.equal((await T.refreshTrackRecords(q, { fetcher, now })).pairs, 1);
  } finally {
    await db.pool?.end();
    await admin.query("DROP SCHEMA IF EXISTS " + SCHEMA + " CASCADE");
    await admin.end();
  }
});

test("the track record is Pro: its route is a paywalled product route", async () => {
  const { classifyApi } = await import("../src/paywall.mjs");
  assert.equal(classifyApi("/v1/people/42/track-record", "GET"), "product");
  assert.equal(T.isTrackRecordRoute("/v1/people/0000000042/track-record"), true);
  assert.equal(T.isTrackRecordRoute("/v1/people/42"), false, "the profile route is untouched");
});
