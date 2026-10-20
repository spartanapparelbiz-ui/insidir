/* Coverage on PostgreSQL: the SEC entity directory (ticker list sync, delisting, renames, share classes), search by
 * name, ticker, CIK, former name and with typos, on-demand EDGAR lookups and their failure states, reporting owners
 * from imported filings (joint filers, person vs entity), the EDGAR daily-index reconciliation, the durable import
 * queue (retry, backoff, permanent failures, crash recovery, concurrent workers, yielding), the coverage report, the
 * data-quality counts, the routes, and the alert guard for backfilled filings. SEC responses are real EDGAR documents
 * captured as fixtures (test/fixtures/sec-entities.mjs); expected values are read from those documents.
 * Runs only when INSIDIR_TEST_DATABASE_URL is set; everything happens in a throwaway schema. */
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { createHash, randomBytes } from "node:crypto";
import { SUBMISSIONS, EFTS_BERKSHIRE, DAILY_INDEX_20261015 } from "./fixtures/sec-entities.mjs";

const PG_URL = process.env.INSIDIR_TEST_DATABASE_URL || "";
const SCHEMA = "coverage_test_" + process.pid;
const skip = !PG_URL && "set INSIDIR_TEST_DATABASE_URL";
if (PG_URL) {
  process.env.DATABASE_URL = PG_URL + (PG_URL.includes("?") ? "&" : "?") + "options=" + encodeURIComponent("-c search_path=" + SCHEMA + ",public");
  process.env.ALLOWED_ORIGINS = "https://insidir.test";
  process.env.COOKIE_SECURE = "0";
  process.env.SEC_USER_AGENT = "Insidir Test test@example.com";
  process.env.INSIDIR_BACKGROUND_WORKERS = "0";
}
const sha = s => createHash("sha256").update(s).digest("hex");
const secError = status => Object.assign(new Error("SEC responded " + status), { status });

/* A fake EDGAR: submissions and the entity lookup from the fixtures; anything else answers 404 like EDGAR. */
function fakeSec({ down = false, calls = [] } = {}) {
  return async url => {
    calls.push(url);
    if (down) throw secError(503);
    const sub = /submissions\/CIK(\d{10})\.json$/.exec(url);
    if (sub) { if (SUBMISSIONS[sub[1]]) return structuredClone(SUBMISSIONS[sub[1]]); throw secError(404); }
    if (url.includes("efts.sec.gov") && /berkshire/i.test(decodeURIComponent(url))) return structuredClone(EFTS_BERKSHIRE);
    if (url.includes("efts.sec.gov")) return { hits: { hits: [] } };
    throw secError(404);
  };
}
const tickerList = rows => ({ fields: ["cik", "name", "ticker", "exchange"], data: rows });

test("unit: EDGAR formats, classification and URL rules", async () => {
  const cov = await import("../src/coverage-ingest.mjs");
  const dir = await import("../src/sec-directory.mjs");
  const sec = await import("../src/sec.mjs");
  const rows = cov.parseFormIndex(DAILY_INDEX_20261015);
  // The fixture holds six "4" lines, two "4/A", one Form 3, one 8-K, one 424B2 and one 40-F (read from the file).
  assert.equal(rows.length, 8);
  assert.deepEqual(rows.map(r => r.formType), ["4", "4", "4", "4", "4", "4", "4/A", "4/A"]);
  assert.deepEqual(rows[0], { formType: "4", filerName: "A.K.A. BRANDS HOLDING CORP.", filerCik: "1865107", filedDate: "2026-10-15",
    accession: "000162828026066035", dashed: "0001628280-26-066035", path: "edgar/data/1865107/0001628280-26-066035.txt" });
  assert.throws(() => cov.parseFormIndex("not an index"), /header not found/);
  assert.equal(cov.dailyIndexUrl("2026-10-15"), "https://www.sec.gov/Archives/edgar/daily-index/2026/QTR4/form.20261015.idx");
  assert.equal(cov.dailyIndexUrl("2026-03-31"), "https://www.sec.gov/Archives/edgar/daily-index/2026/QTR1/form.20260331.idx");
  assert.deepEqual(cov.windowDays(4, new Date("2026-10-19T12:00:00Z")), ["2026-10-19", "2026-10-16", "2026-10-15"], "weekends are not business days");
  assert.equal(dir.classifyOwnerName("ADAR1 Capital Management, LLC"), "organization");
  assert.equal(dir.classifyOwnerName("ARCH Venture Fund XII, L.P."), "organization");
  assert.equal(dir.classifyOwnerName("ABSHER JODY K"), "person");
  assert.equal(dir.classifyOwnerName("COOK TIMOTHY D"), "person");
  assert.equal(dir.padCik("320193"), "0000320193"); assert.equal(dir.padCik("0"), null); assert.equal(dir.padCik("12345678901"), null);
  assert.equal(dir.normalizeName("Berkshire Hathaway Inc. (BRK-B)"), "BERKSHIRE HATHAWAY INC BRK B");
  const cook = dir.profileFromSubmissions(SUBMISSIONS["0001214156"], "0001214156");
  assert.equal(cook.kind, "person"); assert.equal(cook.isReportingOwner, true); assert.equal(cook.kindBasis, "filed_name_pattern");
  const meta = dir.profileFromSubmissions(SUBMISSIONS["0001326801"], "0001326801");
  assert.equal(meta.kind, "company"); assert.deepEqual(meta.formerNames.map(f => f.name), ["Facebook Inc"]);
  const twtr = dir.profileFromSubmissions(SUBMISSIONS["0001418091"], "0001418091");
  assert.equal(twtr.kind, "company"); assert.deepEqual(twtr.tickers, [], "Twitter has no ticker on EDGAR any more");
  assert.equal(dir.profileFromSubmissions(SUBMISSIONS["0000320193"], "0000999999"), null, "a document for another CIK is rejected");
  const hits = dir.parseEntityHits(EFTS_BERKSHIRE);
  assert.equal(hits[0].cik, "0001067983"); assert.equal(hits[0].name, "BERKSHIRE HATHAWAY INC", "tickers in parentheses are not part of the name");
  assert.ok(hits.some(h => h.cik === "0001081316" && h.name === "BERKSHIRE HATHAWAY ENERGY CO"));
  const t = dir.parseTickerList(tickerList([[1067983, "BERKSHIRE HATHAWAY INC", "BRK-B", "NYSE"], [1067983, "BERKSHIRE HATHAWAY INC", "BRK-A", "NYSE"], ["x", "bad", "", ""]]));
  assert.equal(t.companies.length, 1); assert.deepEqual(t.companies[0].tickers, ["BRK-B", "BRK-A"]); assert.equal(t.rejected, 1);
  assert.throws(() => dir.parseTickerList({ data: [] }), /unexpected format/);
  assert.equal(sec.easternToIso("2026-10-15 15:22:00"), "2026-10-15T19:22:00.000Z", "EDT is UTC-4");
  assert.equal(sec.easternToIso("2026-01-15 15:22:00"), "2026-01-15T20:22:00.000Z", "EST is UTC-5");
  assert.equal(sec.easternToIso("garbage"), null);
  assert.ok(sec.allowedSecUrl("https://efts.sec.gov/LATEST/search-index?keysTyped=cook"));
  assert.ok(!sec.allowedSecUrl("https://efts.sec.gov/LATEST/search-index?keysTyped=cook&forms=4"), "only keysTyped");
  assert.ok(!sec.allowedSecUrl("https://efts.sec.gov/LATEST/search-index?q=cook"));
  assert.ok(sec.allowedSecUrl("https://www.sec.gov/Archives/edgar/daily-index/2026/QTR4/form.20261015.idx"));
  assert.ok(!sec.allowedSecUrl("https://www.sec.gov/Archives/edgar/daily-index/2026/QTR4/master.20261015.idx"));
  assert.ok(sec.allowedSecUrl("https://www.sec.gov/files/company_tickers_exchange.json"));
});

test("Coverage on PostgreSQL", { skip }, async t => {
  const admin = new pg.Client({ connectionString: PG_URL });
  await admin.connect();
  await admin.query("CREATE SCHEMA IF NOT EXISTS " + SCHEMA);
  let db, server;
  try {
    db = await import("../src/db.mjs");
    await db.migrate(); await db.migrate();
    const q = (sql, params) => db.query(sql, params);
    const dir = await import("../src/sec-directory.mjs");
    const cov = await import("../src/coverage-ingest.mjs");

    await t.test("ticker list: share classes, renames, delisting, refusal of a truncated snapshot", async () => {
      const first = tickerList([[320193, "Apple Inc.", "AAPL", "Nasdaq"], [1067983, "BERKSHIRE HATHAWAY INC", "BRK-B", "NYSE"], [1067983, "BERKSHIRE HATHAWAY INC", "BRK-A", "NYSE"],
        [1652044, "Alphabet Inc.", "GOOGL", "Nasdaq"], [1652044, "Alphabet Inc.", "GOOG", "Nasdaq"], [1418091, "Twitter, Inc.", "TWTR", "NYSE"], [1326801, "Facebook Inc", "FB", "Nasdaq"]]);
      const s1 = await dir.syncCompanyDirectory({ run: q, fetcher: async () => first, minimumCompanies: 3 });
      assert.deepEqual(s1, { companies: 5, listings: 7, rejectedRows: 0, noLongerListed: 0 });
      // The next day: Twitter is gone (acquired), Facebook is Meta Platforms under META.
      const second = tickerList([[320193, "Apple Inc.", "AAPL", "Nasdaq"], [1067983, "BERKSHIRE HATHAWAY INC", "BRK-B", "NYSE"], [1067983, "BERKSHIRE HATHAWAY INC", "BRK-A", "NYSE"],
        [1652044, "Alphabet Inc.", "GOOGL", "Nasdaq"], [1652044, "Alphabet Inc.", "GOOG", "Nasdaq"], [1326801, "Meta Platforms, Inc.", "META", "Nasdaq"]]);
      const s2 = await dir.syncCompanyDirectory({ run: q, fetcher: async () => second, minimumCompanies: 3 });
      assert.equal(s2.noLongerListed, 1);
      const tw = (await q("SELECT listed,delisted_at,tickers FROM sec_entities WHERE cik='0001418091'")).rows[0];
      assert.equal(tw.listed, false); assert.ok(tw.delisted_at); assert.deepEqual(tw.tickers, []);
      assert.deepEqual((await q("SELECT ticker FROM sec_ticker_history WHERE cik='0001418091'")).rows.map(r => r.ticker), ["TWTR"], "the old ticker is kept as history");
      const meta = (await q("SELECT name,tickers FROM sec_entities WHERE cik='0001326801'")).rows[0];
      assert.equal(meta.name, "Meta Platforms, Inc."); assert.deepEqual(meta.tickers, ["META"]);
      assert.deepEqual((await q("SELECT ticker FROM sec_ticker_history WHERE cik='0001326801' ORDER BY ticker")).rows.map(r => r.ticker), ["FB", "META"]);
      await assert.rejects(dir.syncCompanyDirectory({ run: q, fetcher: async () => tickerList([[320193, "Apple Inc.", "AAPL", "Nasdaq"]]), minimumCompanies: 3 }), /nothing changed/);
      assert.equal((await q("SELECT count(*)::int AS n FROM sec_entities WHERE listed")).rows[0].n, 4, "a truncated download marks nothing delisted");
      assert.equal((await q("SELECT status FROM sec_sync_runs WHERE job='company-directory' ORDER BY id DESC LIMIT 1")).rows[0].status, "error");
    });

    await t.test("search: ticker, share class, CIK, renamed company, typo, delisted company, true totals", async () => {
      const s = (text, o) => dir.searchLocal(text, { run: q, ...o });
      assert.equal((await s("AAPL")).items[0].cik, "0000320193");
      for (const form of ["BRK-B", "BRK.B", "brk b"]) assert.equal((await s(form)).items[0].cik, "0001067983", form);
      assert.equal((await s("GOOG")).items[0].cik, "0001652044");
      assert.equal((await s("320193")).items[0].name, "Apple Inc.", "CIK without zeros");
      assert.equal((await s("0001652044")).items[0].name, "Alphabet Inc.", "CIK with zeros");
      const fb = (await s("facebook")).items[0];
      assert.equal(fb.cik, "0001326801"); assert.equal(fb.name, "Meta Platforms, Inc."); assert.deepEqual(fb.matched, { name: "Facebook Inc", as: "name" });
      assert.equal((await s("hathaway berkshire")).items[0].cik, "0001067983", "words in any order");
      if (await dir.hasTrigram(q)) assert.equal((await s("Aple Inc")).items[0]?.cik, "0000320193", "one letter off");
      const tw = (await s("twitter")).items[0];
      assert.equal(tw.listed, false); assert.ok(tw.delistedAt); assert.equal(tw.url, "entity.html?cik=0001418091", "an unlisted company opens its SEC record, not a ticker report");
      assert.equal((await s("Apple Inc.")).items[0].url, "company.html?ticker=AAPL");
      const all = await s("inc", { limit: 2 });
      assert.equal(all.items.length, 2); assert.ok(all.total >= 4, "total counts every match, not the page");
      assert.deepEqual((await s("zzzzqqq")).items, []);
    });

    await t.test("on-demand EDGAR: entity lookup, submissions, former names, explicit unavailable and not-found states", async () => {
      const calls = [];
      const r = await dir.searchEntities("berkshire hath", { run: q, fetcher: fakeSec({ calls }), lookupBelow: 5 });
      assert.equal(r.state, "ok");
      assert.ok(calls.some(u => u.includes("efts.sec.gov")), "few local matches: EDGAR's entity lookup is asked");
      const bhe = r.items.find(i => i.cik === "0001081316");
      assert.ok(bhe, "Berkshire Hathaway Energy, a company with no ticker, is found");
      assert.equal(bhe.kind, "company"); assert.equal(bhe.listed, false); assert.equal(bhe.url, "entity.html?cik=0001081316");
      const midam = await dir.searchLocal("midamerican energy holdings", { run: q });
      assert.equal(midam.items[0]?.cik, "0001081316", "a former name from EDGAR submissions is searchable");
      assert.equal(midam.items[0].matched.as, "former name");
      const byCik = await dir.searchEntities("1214156", { run: q, fetcher: fakeSec(), kind: "owner" });
      assert.equal(byCik.items[0]?.name, "COOK TIMOTHY D"); assert.equal(byCik.items[0].kind, "person");
      assert.equal(byCik.items[0].url, "person.html?cik=0001214156");
      const nf = await dir.searchEntities("9999999", { run: q, fetcher: fakeSec() });
      assert.equal(nf.state, "no_match"); assert.equal(nf.lookups[0].state, "not_found");
      const down = await dir.searchEntities("quantum widgets", { run: q, fetcher: fakeSec({ down: true }) });
      assert.equal(down.state, "source_unavailable", "an unreachable EDGAR is never reported as no such company");
      const missing = await dir.entityRecord("0007777777", { run: q, fetcher: fakeSec({ down: true }) });
      assert.equal(missing.state, "source_unavailable");
      const rec = await dir.entityRecord("0001326801", { run: q, fetcher: fakeSec() });
      assert.equal(rec.state, "ok"); assert.ok(rec.names.some(n => n.name === "Facebook Inc" && n.as === "former"));
      assert.deepEqual(rec.tickerHistory.map(x => x.ticker).sort(), ["FB", "META"]);
      assert.equal(rec.edgar.recentFilings.length, 5); assert.match(rec.edgar.recentFilings[0].url, /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/1326801\/\d{18}\/\d{10}-\d{2}-\d{6}-index\.htm$/);
    });

    // Imported filings for the participants, queue and quality tests.
    const filing = (acc, issuerCik, issuer, ticker, publishedDaysAgo) => q(`INSERT INTO sec_filings(accession,filer_cik,issuer_cik,issuer_name,ticker,title,form_type,published_at,source_url,ingest_status)
      VALUES($1,$2,$2,$3,$4,'4','4',now()-make_interval(days=>$5),$6,'parsed')`, [acc, issuerCik, issuer, ticker, publishedDaysAgo, `https://www.sec.gov/Archives/edgar/data/${Number(issuerCik)}/${acc}/x-index.htm`]);
    const owner = (acc, cik, name, roles = {}) => q(`INSERT INTO sec_filing_owners(accession,owner_cik,owner_name,is_director,is_officer,officer_title,is_ten_percent_owner,other_text) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [acc, cik, name, !!roles.director, !!roles.officer, roles.title || null, !!roles.ten, roles.other || null]);
    const line = (acc, i, issuerCik, ticker, ownerCik, ownerName, o = {}) => q(`INSERT INTO sec_transactions(id,accession,issuer_cik,ticker,owner_cik,owner_name,transaction_date,transaction_code,acquired_disposed,category,derivative,shares,price_per_share,estimated_value,source_url)
      VALUES($1,$2,$3,$4,$5,$6,COALESCE($7::date,current_date-2),$8,$9,$10,false,$11,$12,$13,'https://www.sec.gov/Archives/edgar/data/1/'||$2||'/x.xml')`,
      [acc + ":N:" + i, acc, issuerCik, ticker, ownerCik, ownerName, o.date || null, o.code || "S", o.ad || "D", o.category || "reported_sale", o.shares ?? 100, o.price ?? 10, o.value ?? 1000]);

    await t.test("reporting owners from imported filings: joint filers, person vs entity, roles, exact counts", async () => {
      await filing("000111111126000001", "1555555", "Smallcap Biotech Inc", "SMBT", 2);
      await owner("000111111126000001", "0002000001", "DOE JANE Q", { director: true });
      await owner("000111111126000001", "0002000002", "Doe Family Capital Partners, L.P.", { ten: true });
      await line("000111111126000001", 0, "1555555", "SMBT", null, "DOE JANE Q, Doe Family Capital Partners, L.P.");
      await filing("000111111126000002", "320193", "Apple Inc.", "AAPL", 1);
      await owner("000111111126000002", "0002000001", "DOE JANE Q", { officer: true, title: "SVP, Finance" });
      await line("000111111126000002", 0, "320193", "AAPL", "0002000001", "DOE JANE Q");
      const r1 = await dir.indexFilingParticipants({ run: q });
      assert.deepEqual(r1, { filings: 2, issuers: 2, owners: 2 });
      const jane = (await q("SELECT * FROM sec_entities WHERE cik='0002000001'")).rows[0];
      assert.equal(jane.kind, "person"); assert.equal(jane.is_reporting_owner, true); assert.equal(jane.owner_filings, 2);
      assert.equal(jane.last_issuer_name, "Apple Inc."); assert.equal(jane.last_role, "Officer: SVP, Finance");
      const fund = (await q("SELECT kind FROM sec_entities WHERE cik='0002000002'")).rows[0];
      assert.equal(fund.kind, "organization", "a partnership named on a joint filing is an entity, not a person");
      const smbt = (await q("SELECT kind,is_issuer,listed,issuer_filings FROM sec_entities WHERE cik='0001555555'")).rows[0];
      assert.deepEqual(smbt, { kind: "company", is_issuer: true, listed: false, issuer_filings: 1 });
      assert.equal((await dir.searchLocal("SMBT", { run: q })).items[0]?.cik, "0001555555", "a ticker as filed is searchable for an issuer not on the SEC list");
      assert.deepEqual(await dir.indexFilingParticipants({ run: q }), { filings: 0, issuers: 0, owners: 0 }, "incremental: nothing new, nothing counted twice");
      await q("UPDATE sec_filings SET updated_at=now() WHERE accession='000111111126000002'");
      await dir.indexFilingParticipants({ run: q });
      await dir.recountParticipation(q);
      assert.equal((await q("SELECT owner_filings FROM sec_entities WHERE cik='0002000001'")).rows[0].owner_filings, 2, "a re-imported filing is not counted twice after the recount");
      const people = await dir.searchLocal("jane doe", { run: q, kind: "person" });
      assert.equal(people.items.length, 1); assert.equal(people.items[0].latestRole.role, "Officer: SVP, Finance");
      assert.equal((await dir.searchLocal("doe", { run: q, kind: "owner" })).total, 2, "the owner filter includes entities");
    });

    await t.test("daily index reconciliation and the durable import queue", async () => {
      // 2026-10-15 is published (the fixture); EDGAR answers 403 for the other days, as it does for an index not yet there.
      const fetcher = async url => { if (url.endsWith("form.20261015.idx")) return DAILY_INDEX_20261015; throw secError(403); };
      await filing("000162828026066035", "1865107", "A.K.A. BRANDS HOLDING CORP.", "AKA", 5); // already imported by the live feed
      const s = await cov.syncDailyIndexes({ run: q, fetcher, days: 4, now: new Date("2026-10-16T22:00:00Z") });
      assert.deepEqual(s, { daysRead: 1, listed: 8, queued: 7, alreadyImported: 1, noIndex: 4, errors: 0 }, "Oct 12 to 16: five business days, one published");
      assert.deepEqual((await q("SELECT status,count(*)::int AS n FROM sec_ingest_queue GROUP BY 1 ORDER BY 1")).rows, [{ status: "done", n: 1 }, { status: "pending", n: 7 }]);
      const again = await cov.syncDailyIndexes({ run: q, fetcher, days: 4, now: new Date("2026-10-16T22:00:00Z") });
      assert.equal(again.queued, 0, "re-reading an index queues nothing twice");
      const loaded = [];
      const load = async f => {
        loaded.push(f.accession);
        assert.match(f.indexBase, /^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/\d+\/\d{18}\/$/);
        if (f.accession === "000168316826007878") throw new Error("SEC responded 500");
        if (f.accession === "000168316826007879") throw new Error("No parsable ownership XML in this SEC accession");
        return { accession: f.accession, filerCik: f.filerCik, issuerCik: "882291", issuerName: "AETHLON MEDICAL INC", ticker: "AEMD", title: f.title, formType: f.formType,
          sourceUrl: f.sourceUrl, publishedAt: "2026-10-15T19:22:00Z", periodOfReport: "2026-10-14", isAmendment: f.formType === "4/A", xmlUrl: f.indexBase + "doc.xml",
          owners: [{ cik: "0003000001", name: "ROE RICHARD", isDirector: true }], transactions: [] };
      };
      // Two workers at once: every pending row is claimed by exactly one of them.
      const [a, b] = await Promise.all([cov.drainIngestQueue({ run: q, load, persist: db.persistFiling, budget: 4, workerId: "a" }),
        cov.drainIngestQueue({ run: q, load, persist: db.persistFiling, budget: 4, workerId: "b" })]);
      assert.equal(a.claimed + b.claimed, 7); assert.equal(new Set(loaded).size, loaded.length, "no accession loaded twice");
      assert.equal(a.imported + b.imported, 5); assert.equal(a.retried + b.retried, 2);
      const row = acc => q("SELECT status,attempts,next_attempt_at>now() AS later,last_error FROM sec_ingest_queue WHERE accession=$1", [acc]).then(r => r.rows[0]);
      const transient = await row("000168316826007878");
      assert.equal(transient.status, "retry"); assert.equal(transient.later, true); assert.match(transient.last_error, /500/);
      assert.equal((await q("SELECT published_at FROM sec_filings WHERE accession='000168316826007880'")).rows[0].published_at.toISOString(), "2026-10-15T19:22:00.000Z");
      // Second attempt of the unparseable filing: a permanent error after two attempts is failed, kept with its reason.
      await q("UPDATE sec_ingest_queue SET next_attempt_at=now() WHERE status='retry'");
      await cov.drainIngestQueue({ run: q, load, persist: db.persistFiling, budget: 10 });
      const perm = await row("000168316826007879");
      assert.equal(perm.status, "failed"); assert.equal(perm.attempts, 2); assert.match(perm.last_error, /No parsable ownership XML/);
      const still = await row("000168316826007878");
      assert.equal(still.status, "retry"); assert.equal(still.attempts, 2, "a transient error keeps retrying (up to six attempts)");
      // A worker that died mid-row: the row goes back to the queue.
      await q("UPDATE sec_ingest_queue SET status='running',locked_at=now()-interval '1 hour',locked_by='dead' WHERE accession='000168316826007878'");
      const rec = await cov.drainIngestQueue({ run: q, load: async () => { throw new Error("SEC responded 500"); }, persist: db.persistFiling, budget: 0 });
      assert.equal(rec.recovered, 1);
      // People waiting on the SEC throttle: the worker hands its claims back untouched.
      await q("UPDATE sec_ingest_queue SET next_attempt_at=now() WHERE status='retry'");
      const y = await cov.drainIngestQueue({ run: q, load, persist: db.persistFiling, budget: 5, backlog: () => 9000 });
      assert.equal(y.yielded, true); assert.equal(y.imported, 0); assert.equal(y.released, y.claimed);
      assert.equal((await row("000168316826007878")).status, "pending");
      const report = await cov.coverageReport({ run: q, days: 4, now: new Date("2026-10-16T22:00:00Z") });
      assert.equal(report.backfill.listedByEdgar, 8); assert.equal(report.backfill.imported, 6); assert.equal(report.backfill.indexDaysRead, 1);
      assert.deepEqual(report.reconciliation, [{ day: "2026-10-15", listedByEdgar: 8, imported: 6, failed: 1, waiting: 1, missing: 0 }]);
      assert.equal(report.queue.failed, 1); assert.ok(report.entities.total >= 9);
      assert.ok(report.universe.notCovered.some(x => /Forms 3 and 5/.test(x)));
    });

    await t.test("data-quality counts find real problems and nothing else", async () => {
      const before = Object.fromEntries((await cov.qualityChecks({ run: q })).map(c => [c.key, c.count]));
      await filing("000222222226000001", "320193", "Apple Inc.", "AAPL", 1);
      await owner("000222222226000001", "0002000001", "DOE JANE Q", { officer: true, title: "SVP, Finance" });
      // An award (code A) wrongly classed as a purchase, and a trade dated after the filing.
      await line("000222222226000001", 0, "320193", "AAPL", "0002000001", "DOE JANE Q", { code: "A", ad: "A", category: "reported_purchase" });
      await line("000222222226000001", 1, "320193", "AAPL", "0002000001", "DOE JANE Q", { date: "2099-01-01" });
      await q("UPDATE sec_filings SET source_url='https://example.com/x' WHERE accession='000222222226000001'");
      const after = Object.fromEntries((await cov.qualityChecks({ run: q })).map(c => [c.key, c]));
      assert.equal(after.purchase_misclassified.count, before.purchase_misclassified + 1);
      assert.deepEqual(after.purchase_misclassified.examples.slice(-1), ["000222222226000001:N:0"]);
      assert.equal(after.transaction_after_filing.count, before.transaction_after_filing + 1);
      assert.equal(after.implausible_transaction_date.count, before.implausible_transaction_date + 1);
      assert.equal(after.broken_source_link.count, before.broken_source_link + 1);
      assert.equal(after.sale_misclassified.count, 0); assert.equal(after.value_mismatch.count, 0);
      assert.equal(after.queue_failed.count, 1);
      assert.equal(after.stale_filings.stale, false);
    });

    await t.test("backfilled filings are never pushed as new", async () => {
      const { MATCH_SQL } = await import("../src/push.mjs");
      const uid = (await q("INSERT INTO users(email,password_hash,subscription_status) VALUES('push@insidir.test','x','active') RETURNING id")).rows[0].id;
      await q("INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth_key,created_at) VALUES($1,'https://fcm.googleapis.com/fcm/send/cov','k'||repeat('a',20),'a'||repeat('b',20),now()-interval '1 day')", [uid]);
      await q("INSERT INTO watchlist(user_id,ticker) VALUES($1,'SMBT')", [uid]);
      await filing("000333333326000001", "1555555", "Smallcap Biotech Inc", "SMBT", 60); // backfilled today, published two months ago
      await filing("000333333326000002", "1555555", "Smallcap Biotech Inc", "SMBT", 0);
      const pushed = (await q(MATCH_SQL)).rows.map(r => r.accession);
      assert.ok(pushed.includes("000333333326000002")); assert.ok(!pushed.includes("000333333326000001"));
    });

    await t.test("routes: open coverage, gated entity search, entity records, following an owner not yet imported", async () => {
      const token = randomBytes(32).toString("hex");
      const uid = (await q("INSERT INTO users(email,password_hash,subscription_status,current_period_end) VALUES('cov@insidir.test','x','active',now()+interval '20 days') RETURNING id")).rows[0].id;
      await q("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')", [sha(token), uid]);
      const cookie = "insidir_sid=" + token;
      const { createApiServer } = await import("../src/api.mjs");
      server = createApiServer({ quiet: true, env: { ...process.env, INSIDIR_PAYWALL: "1" }, secFetch: fakeSec(), marketCache: false });
      await new Promise(r => server.listen(0, "127.0.0.1", r));
      const base = "http://127.0.0.1:" + server.address().port;
      const get = (p, c) => fetch(base + p, { headers: c ? { cookie: c } : {} });
      const covRes = await get("/v1/coverage");
      assert.equal(covRes.status, 200, "coverage counts are public");
      const c = await covRes.json();
      assert.equal(c.backfill.listedByEdgar, 8); assert.ok(Array.isArray(c.quality) && c.quality.every(x => !("examples" in x)), "no example rows in public");
      assert.equal((await get("/v1/entities/search?q=berkshire")).status, 401, "entity search is product data");
      const found = await (await get("/v1/entities/search?q=smallcap", cookie)).json();
      assert.equal(found.items[0].cik, "0001555555"); assert.equal(found.state, "ok"); assert.ok(found.total >= 1);
      assert.equal((await get("/v1/entities/0009999999", cookie)).status, 404);
      assert.equal((await get("/v1/entities/abc", cookie)).status, 400);
      const rec = await (await get("/v1/entities/1214156", cookie)).json();
      assert.equal(rec.entity.kind, "person"); assert.equal(rec.entity.isReportingOwner, true);
      // Tim Cook has no imported Form 4 in this database, but EDGAR lists him as a reporting owner: he can be followed.
      const follow = await fetch(base + "/v1/me/people", { method: "POST", headers: { cookie, origin: "https://insidir.test", "content-type": "application/json" }, body: JSON.stringify({ owner_cik: "1214156" }) });
      assert.equal(follow.status, 200);
      const list = await (await get("/v1/me/people", cookie)).json();
      assert.equal(list.items.find(p => p.owner_cik === "0001214156")?.owner_name, "COOK TIMOTHY D");
      // A company is not a reporting owner and cannot be followed as one.
      const notOwner = await fetch(base + "/v1/me/people", { method: "POST", headers: { cookie, origin: "https://insidir.test", "content-type": "application/json" }, body: JSON.stringify({ owner_cik: "1081316" }) });
      assert.equal(notOwner.status, 404);
    });
  } finally {
    if (server) await new Promise(r => server.close(r));
    await db?.pool?.end().catch(() => {});
    await admin.query("DROP SCHEMA IF EXISTS " + SCHEMA + " CASCADE");
    await admin.end();
  }
});
