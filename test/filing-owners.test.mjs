import test from "node:test";
import assert from "node:assert/strict";

/* Joint filings: every reporting owner of an imported Form 4 in sec_filing_owners (sql/008), written by
 * persistFiling and, for older imports, by scripts/backfill-filing-owners.mjs. Nothing here reaches the
 * network. The last test runs on PostgreSQL when INSIDIR_TEST_DATABASE_URL is set, inside a throwaway
 * schema: migrate, persistFiling, the backfill and a joint-only person's profile, end to end. */
process.env.SEC_USER_AGENT ||= "Insidir Research hello@aethric.llc";
const PG_URL = process.env.INSIDIR_TEST_DATABASE_URL || "";
const SCHEMA = "filing_owners_test_" + process.pid;
// db.mjs builds its pool from DATABASE_URL at import: point it at the throwaway schema, or at nothing.
if (PG_URL) process.env.DATABASE_URL = PG_URL + (PG_URL.includes("?") ? "&" : "?") + "options=" + encodeURIComponent("-c search_path=" + SCHEMA);
else delete process.env.DATABASE_URL;
const realFetch = globalThis.fetch;
globalThis.fetch = async url => { throw new Error("Network used in a unit test: " + url); };
const { parseOwnership, secFetch, secBacklogMs } = await import("../src/sec.mjs");
const db = await import("../src/db.mjs");
const { backfillFilingOwners, parseArgs, isSecBlock, PENDING_SQL, REMAINING_SQL, CHECKED_SQL, INGEST_LOCK } = await import("../scripts/backfill-filing-owners.mjs");
const { ownerRoles, ownerRole } = await import("../src/insiders.mjs");
const { rolesOf, personProfile } = await import("../src/person-profile.mjs");

const ACC = "000222222226000001";
const owner = (cik, name, rel) => `<reportingOwner><reportingOwnerId>${cik == null ? "" : `<rptOwnerCik>${cik}</rptOwnerCik>`}<rptOwnerName>${name}</rptOwnerName></reportingOwnerId><reportingOwnerRelationship>${rel}</reportingOwnerRelationship></reportingOwner>`;
const jointXml = (owners = [owner("0005555555", "FUND LP", "<isTenPercentOwner>1</isTenPercentOwner>"),
  owner("0004444444", "SMITH BOB", "<isDirector>1</isDirector><isOfficer>1</isOfficer><officerTitle>Chief  Executive Officer</officerTitle>")]) =>
  `<?xml version="1.0"?><ownershipDocument><documentType>4</documentType><periodOfReport>2026-10-07</periodOfReport>
  <issuer><issuerCik>0000099999</issuerCik><issuerName>Example Corp</issuerName><issuerTradingSymbol>EXMP</issuerTradingSymbol></issuer>${owners.join("")}
  <nonDerivativeTable><nonDerivativeTransaction><securityTitle><value>Common Stock</value></securityTitle><transactionDate><value>2026-10-07</value></transactionDate>
  <transactionCoding><transactionCode>P</transactionCode></transactionCoding><transactionAmounts><transactionShares><value>1000</value></transactionShares>
  <transactionPricePerShare><value>25.0005</value></transactionPricePerShare><transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode></transactionAmounts></nonDerivativeTransaction></nonDerivativeTable></ownershipDocument>`;
const base = "https://www.sec.gov/Archives/edgar/data/99999/" + ACC + "/";
const filingMeta = { accession: ACC, filerCik: "99999", title: "4 - Example Corp", formType: "4", publishedAt: new Date(Date.now() - 2 * 86400000).toISOString(), sourceUrl: base + ACC + "-index.htm" };

// A query function that records every statement and answers INSERTs with one row.
function recorder(answers = {}) {
  const fn = async (sql, params) => { fn.statements.push({ sql, params }); return answers[sql] ?? (sql.startsWith("INSERT") ? { rowCount: 1, rows: [] } : { rowCount: 0, rows: [] }); };
  fn.statements = [];
  return fn;
}

test("a joint Form 4 keeps owner_cik NULL on its lines; writeFilingOwners stores every owner with a CIK, as filed", async () => {
  const parsed = parseOwnership(jointXml([...[owner("0005555555", "FUND LP", "<isTenPercentOwner>1</isTenPercentOwner>"), owner("0004444444", "SMITH BOB", "<isDirector>1</isDirector>")],
    owner(null, "NO CIK TRUST", "<otherText>Trust</otherText>"), owner("0000000000", "ZERO", ""), owner("0004444444", "SMITH BOB AGAIN", "")]), filingMeta);
  assert.equal(parsed.transactions.length, 1);
  assert.equal(parsed.transactions[0].ownerCik, null, "one line, counted once in market totals");
  assert.equal(parsed.transactions[0].ownerName, "FUND LP, SMITH BOB, NO CIK TRUST, ZERO, SMITH BOB AGAIN");
  const run = recorder();
  const written = await db.writeFilingOwners(run, ACC, parsed.owners);
  assert.deepEqual(run.statements[0], { sql: "DELETE FROM sec_filing_owners WHERE accession=$1", params: [ACC] }, "a re-import replaces the owners");
  assert.deepEqual(run.statements.slice(1).map(s => [s.sql, s.params]), [
    [db.FILING_OWNER_INSERT, [ACC, "0005555555", "FUND LP", false, false, null, true, null]],
    [db.FILING_OWNER_INSERT, [ACC, "0004444444", "SMITH BOB", true, false, null, false, null]],
    [db.FILING_OWNER_INSERT, [ACC, "0004444444", "SMITH BOB AGAIN", false, false, null, false, null]]
  ], "no CIK or an all-zero CIK is skipped; a repeated CIK is left to ON CONFLICT DO NOTHING");
  assert.equal(written, 3);
  assert.match(db.FILING_OWNER_INSERT, /ON CONFLICT \(accession,owner_cik\) DO NOTHING$/);
  assert.equal(await db.writeFilingOwners(recorder(), ACC, null), 0);
});

test("backfill: joint filings first, then newest; one transaction per filing that also records it as looked at; failures recorded and reported", async () => {
  const rows = [{ accession: ACC, xml_url: base + "doc4.xml", source_url: filingMeta.sourceUrl },
    { accession: "000333333326000001", xml_url: base.replace(ACC, "000333333326000001") + "doc4.xml", source_url: "x" },
    { accession: "000444444426000001", xml_url: base.replace(ACC, "000444444426000001") + "doc4.xml", source_url: "y" },
    { accession: "000555555526000001", xml_url: base.replace(ACC, "000555555526000001") + "doc4.xml", source_url: "z" }];
  const query = recorder({ [PENDING_SQL]: { rows }, [REMAINING_SQL]: { rows: [{ remaining: 7, failed_on_record: 1 }] } });
  const fetched = [], transactions = [], lines = [];
  const fetcher = async url => {
    fetched.push(url);
    if (url.includes("000333333326000001")) throw new Error("SEC responded 404");
    if (url.includes("000555555526000001")) return jointXml([owner(null, "NO CIK TRUST", "<otherText>Trust</otherText>")]);
    return url.includes("000444444426000001") ? jointXml([owner("0007777777", "SOLO JANE", "<isDirector>1</isDirector>")]).replace(/0000099999/, "0000088888") : jointXml();
  };
  const summary = await backfillFilingOwners({ query, fetcher, parseOwnership, limit: "25", log: line => lines.push(line), wait: async () => {},
    transaction: async work => { const run = recorder(); transactions.push(run); return work(run); }, writeFilingOwners: db.writeFilingOwners });
  assert.deepEqual(query.statements.map(s => [s.sql, s.params]), [[PENDING_SQL, [25, false]], [CHECKED_SQL, ["000333333326000001", 0, "SEC responded 404"]], [REMAINING_SQL, []]],
    "a failed filing is recorded as looked at (with its reason), outside any transaction");
  const pending = PENDING_SQL.replace(/\s+/g, " ");
  assert.match(pending, /WHERE f\.ingest_status='parsed' AND f\.xml_url IS NOT NULL AND NOT EXISTS \(SELECT 1 FROM sec_filing_owners o WHERE o\.accession=f\.accession\)/);
  assert.match(pending, /AND NOT EXISTS \(SELECT 1 FROM sec_filing_owners_checked c WHERE c\.accession=f\.accession AND \(NOT \$2::boolean OR c\.error IS NULL\)\)/, "looked-at filings are skipped; failed ones only come back with --retry-failed");
  assert.match(pending, /ORDER BY \(cardinality\(f\.owner_names\)>1\) DESC,f\.published_at DESC NULLS LAST,f\.accession DESC LIMIT \$1$/, "joint filings first");
  assert.deepEqual(fetched, rows.map(r => r.xml_url), "each filing's own XML, once");
  assert.equal(transactions.length, 3, "a failed fetch writes nothing in a transaction");
  assert.deepEqual(transactions.map(t => t.statements.filter(s => s.sql === db.FILING_OWNER_INSERT).map(s => s.params[1])), [["0005555555", "0004444444"], ["0007777777"], []]);
  assert.deepEqual(transactions.map(t => t.statements.at(-1)), [{ sql: CHECKED_SQL, params: [ACC, 2, null] }, { sql: CHECKED_SQL, params: ["000444444426000001", 1, null] },
    { sql: CHECKED_SQL, params: ["000555555526000001", 0, null] }], "recorded in the same transaction as the owners; no usable CIK is recorded with 0 owners, so it never comes back");
  assert.deepEqual(summary, { filings: 3, owners: 3, joint: 1, failed: 1, errors: [{ accession: "000333333326000001", reason: "SEC responded 404" }], stopped: null, requests: 4, remaining: 7, failedOnRecord: 1 });
  assert.deepEqual(lines, [ACC + " 2 owners (joint)", "000333333326000001 failed: SEC responded 404", "000444444426000001 1 owner", "000555555526000001 0 owners"]);
  assert.match(CHECKED_SQL, /ON CONFLICT \(accession\) DO UPDATE SET checked_at=now\(\),owners=EXCLUDED\.owners,error=EXCLUDED\.error$/);
  // A dry run reads and parses but writes nothing (not even a failure record); limits are clamped; --retry-failed is passed on.
  const dry = recorder({ [PENDING_SQL]: { rows: rows.slice(0, 2) } });
  const none = [];
  const result = await backfillFilingOwners({ query: dry, fetcher: async url => { if (url.includes("0003333")) throw new Error("SEC responded 404"); return jointXml(); }, parseOwnership, dryRun: true, limit: 0, retryFailed: true,
    wait: async () => {}, transaction: async () => { none.push(1); }, writeFilingOwners: db.writeFilingOwners });
  assert.deepEqual([result.filings, result.owners, result.failed, none.length, dry.statements.map(s => s.sql)], [1, 2, 1, 0, [PENDING_SQL, REMAINING_SQL]]);
  assert.deepEqual(dry.statements[0].params, [500, true]);
});

test("backfill: stops at the first sign of an SEC block (403, or 429 after retries) and leaves that filing as it was", async () => {
  for (const status of [403, 429]) {
    const rows = ["000100000026000001", "000100000026000002", "000100000026000003"].map(a => ({ accession: a, xml_url: base.replace(ACC, a) + "doc4.xml", source_url: "x" }));
    const query = recorder({ [PENDING_SQL]: { rows } });
    const fetched = [], lines = [];
    const summary = await backfillFilingOwners({ query, parseOwnership, writeFilingOwners: db.writeFilingOwners, wait: async () => {}, log: line => lines.push(line),
      transaction: async work => work(recorder()),
      fetcher: async url => { fetched.push(url); if (fetched.length === 2) throw new Error("SEC responded " + status); return jointXml(); } });
    assert.equal(fetched.length, 2, status + ": nothing is sent after the block");
    assert.deepEqual([summary.filings, summary.failed, summary.stopped, summary.requests], [1, 0, "sec_blocked", 2]);
    assert.deepEqual(query.statements.map(s => s.sql), [PENDING_SQL, REMAINING_SQL], status + ": the blocked filing is not recorded, so the next run takes it");
    assert.match(lines.at(-1), /the SEC is refusing requests; stopped\. Wait at least ten minutes/);
  }
  assert.equal(isSecBlock(new Error("SEC responded 403")), true);
  assert.equal(isSecBlock(new Error("SEC responded 429")), true);
  for (const other of ["SEC responded 404", "SEC responded 503", "SEC responded 4030", "fetch failed"]) assert.equal(isSecBlock(new Error(other)), false, other);
});

test("backfill: ten failures in a row stop the run (all recorded, retried with --retry-failed)", async () => {
  const rows = Array.from({ length: 15 }, (_, i) => ({ accession: "1000000000260000" + String(i).padStart(2, "0"), xml_url: base + "doc" + i + ".xml", source_url: "x" }));
  const query = recorder({ [PENDING_SQL]: { rows } });
  let sent = 0;
  const summary = await backfillFilingOwners({ query, parseOwnership, writeFilingOwners: db.writeFilingOwners, wait: async () => {}, transaction: async work => work(recorder()),
    fetcher: async () => { sent++; throw new Error("fetch failed"); } });
  assert.deepEqual([sent, summary.failed, summary.stopped, summary.errors.length], [10, 10, "repeated_failures", 10]);
  assert.equal(query.statements.filter(s => s.sql === CHECKED_SQL).length, 10);
});

test("backfill: paces its own SEC requests (--rate, default 4 a second)", async () => {
  const rows = Array.from({ length: 4 }, (_, i) => ({ accession: "1000000000260000" + String(i).padStart(2, "0"), xml_url: base + "doc" + i + ".xml", source_url: "x" }));
  for (const [rate, gap] of [[undefined, 250], [2, 500], [100, 125]]) {
    let clock = 1000;
    const waits = [];
    await backfillFilingOwners({ query: recorder({ [PENDING_SQL]: { rows } }), parseOwnership, writeFilingOwners: db.writeFilingOwners, transaction: async work => work(recorder()),
      fetcher: async () => jointXml(), rate, now: () => clock, wait: async ms => { waits.push(ms); clock += ms; } });
    assert.deepEqual(waits, [gap, gap, gap], "rate " + rate + " (8 at most)");
  }
});

test("backfill arguments: --limit=N and --rate=R only, anything else is refused (never read as 1)", () => {
  assert.deepEqual(parseArgs([]), { limit: 500, rate: 4, retryFailed: false, dryRun: false });
  assert.deepEqual(parseArgs(["--limit=1000", "--rate=2.5", "--retry-failed", "--dry-run"]), { limit: 1000, rate: 2.5, retryFailed: true, dryRun: true });
  for (const bad of [["--limit", "1000"], ["--limit"], ["--limit=0"], ["--limit=1e3"], ["--limit=100001"], ["--rate=9"], ["--rate=0"], ["--rate=fast"], ["--dry-run=yes"], ["--force"], ["1000"]])
    assert.throws(() => parseArgs(bad), e => e.usage === true && /usage: node scripts\/backfill-filing-owners\.mjs/.test(e.message), JSON.stringify(bad));
});

test("secBacklogMs reports the shared SEC throttle's queue without changing it", async () => {
  assert.equal(secBacklogMs(), 0, "nothing queued");
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response("<ownershipDocument/>", { status: 200 }); };
  try {
    const url = base + "doc4.xml";
    const runs = [secFetch(url), secFetch(url), secFetch(url)];
    const queued = secBacklogMs();
    assert.ok(queued > 125 && queued <= 375, "three requests 125 ms apart: " + queued);
    assert.equal(secBacklogMs() <= queued, true, "reading it starts nothing");
    await Promise.all(runs);
    assert.equal(calls, 3);
    await new Promise(r => setTimeout(r, 250));
    assert.equal(secBacklogMs(), 0);
  } finally { globalThis.fetch = async url => { throw new Error("Network used in a unit test: " + url); }; }
});

test("the engine's pool runs with JIT off unless DATABASE_URL sets its own options", () => {
  assert.deepEqual(db.poolOptions("postgresql://u@db:5432/insidir"), { options: "-c jit=off" });
  assert.deepEqual(db.poolOptions("postgresql://u@db:5432/insidir?sslmode=require"), { options: "-c jit=off" });
  assert.deepEqual(db.poolOptions("postgresql://u@db:5432/insidir?options=-c%20search_path%3Dx"), {}, "the operator's options apply as given");
  assert.deepEqual(db.poolOptions("postgresql://u@db/insidir?sslmode=require&options=-c%20jit%3Don"), {});
});

test("roles have one wording source: insiders.mjs ownerRoles (person-profile's rolesOf is the same function)", () => {
  assert.equal(rolesOf, ownerRoles);
  const cases = [
    [{ isOfficer: true, officerTitle: "  Chief  Executive\nOfficer ", isDirector: true, isTenPercentOwner: true }, ["Chief Executive Officer", "Director", "10% owner"]],
    [{ isOfficer: true, officerTitle: "   " }, ["Officer"]],
    [{ isOfficer: false, isDirector: false, otherText: "Member of 13(d) group" }, ["Member of 13(d) group"]],
    [{ isDirector: true, otherText: "ignored when a box is ticked" }, ["Director"]],
    [{}, []], [null, []]
  ];
  for (const [o, roles] of cases) {
    assert.deepEqual(ownerRoles(o), roles, JSON.stringify(o));
    assert.equal(ownerRole(o), roles.length ? roles.join(" · ") : null);
  }
  assert.equal(ownerRole({ isOfficer: true, officerTitle: "X".repeat(200), isDirector: true }).length, 120);
});

test("on PostgreSQL: migrate, persistFiling and the backfill give a joint-only filer a profile with roles", { skip: PG_URL ? false : "INSIDIR_TEST_DATABASE_URL is not set" }, async () => {
  const { default: pg } = await import("pg");
  const admin = new pg.Pool({ connectionString: PG_URL, max: 1 });
  await admin.query(`CREATE SCHEMA ${SCHEMA}`);
  try {
    await db.migrate();
    await db.migrate(); // idempotent
    assert.equal((await db.query("SELECT to_regclass('sec_filing_owners') IS NOT NULL AS present")).rows[0].present, true);
    const parsed = { ...parseOwnership(jointXml(), filingMeta), xmlUrl: base + "doc4.xml" };
    await db.persistFiling(parsed);
    const stored = async () => (await db.query("SELECT owner_cik,owner_name,is_director,is_officer,officer_title,is_ten_percent_owner FROM sec_filing_owners WHERE accession=$1 ORDER BY owner_cik", [ACC])).rows;
    const expected = [
      { owner_cik: "0004444444", owner_name: "SMITH BOB", is_director: true, is_officer: true, officer_title: "Chief  Executive Officer", is_ten_percent_owner: false },
      { owner_cik: "0005555555", owner_name: "FUND LP", is_director: false, is_officer: false, officer_title: null, is_ten_percent_owner: true }];
    assert.deepEqual(await stored(), expected);
    assert.equal((await db.query("SELECT owner_cik FROM sec_transactions WHERE accession=$1", [ACC])).rows[0].owner_cik, null);
    await db.persistFiling(parsed); // a re-import replaces, never duplicates
    assert.deepEqual(await stored(), expected);

    // An import from before the table: no owner rows. The backfill restores them from the filed XML.
    await db.query("DELETE FROM sec_filing_owners");
    const transaction = async work => {
      const client = await db.pool.connect();
      try { await client.query("BEGIN"); const r = await work((sql, params) => client.query(sql, params)); await client.query("COMMIT"); return r; }
      catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
    };
    const fetched = [];
    const summary = await backfillFilingOwners({ query: db.query, transaction, parseOwnership, writeFilingOwners: db.writeFilingOwners, wait: async () => {},
      fetcher: async url => { fetched.push(url); return jointXml(); } });
    assert.deepEqual([summary.filings, summary.owners, summary.joint, summary.failed, summary.remaining, summary.failedOnRecord, fetched], [1, 2, 1, 0, 0, 0, [base + "doc4.xml"]]);
    assert.deepEqual(await stored(), expected);
    const again = await backfillFilingOwners({ query: db.query, transaction, parseOwnership, writeFilingOwners: db.writeFilingOwners, fetcher: async () => { throw new Error("not again"); } });
    assert.deepEqual([again.filings, again.requests, again.remaining], [0, 0, 0], "nothing left to do");

    // Progress never depends on failures: five older single filings, the newest of them with an XML that is
    // gone and the next with no usable owner CIK. Two at a time, each run moves on; nothing is fetched twice.
    const older = [1, 2, 3, 4, 5].map(i => "00066666662600000" + i);
    for (const [i, acc] of older.entries()) {
      const xml = jointXml([owner(i === 1 ? "0000000000" : "000888888" + i, "SOLO " + i, "<isDirector>1</isDirector>")]).replace(/2026-10-07/g, "2026-09-0" + (i + 1));
      await db.persistFiling({ ...parseOwnership(xml, { ...filingMeta, accession: acc, publishedAt: new Date(Date.now() - (10 + i) * 86400000).toISOString() }), xmlUrl: base.replace(ACC, acc) + "doc4.xml" });
    }
    await db.query("DELETE FROM sec_filing_owners WHERE accession=ANY($1::text[])", [older]);
    const docs = new Map(older.map((acc, i) => [base.replace(ACC, acc) + "doc4.xml", i === 0 ? null : jointXml([owner(i === 1 ? "0000000000" : "000888888" + i, "SOLO " + i, "<isDirector>1</isDirector>")]).replace(ACC, acc)]));
    const asked = [];
    const xmlFor = async url => { asked.push(url); const doc = docs.get(url); if (!doc) throw new Error("SEC responded 404"); return doc; };
    const runs = [];
    for (let i = 0; i < 4; i++) runs.push(await backfillFilingOwners({ query: db.query, transaction, parseOwnership, writeFilingOwners: db.writeFilingOwners, limit: 2, wait: async () => {}, fetcher: xmlFor }));
    assert.deepEqual(runs.map(r => [r.filings, r.failed, r.remaining, r.failedOnRecord]), [[1, 1, 3, 1], [2, 0, 1, 1], [1, 0, 0, 1], [0, 0, 0, 1]],
      "the 404 and the no-CIK filing are looked at once; the run moves on; remaining reaches 0");
    assert.equal(new Set(asked).size, asked.length, "no filing is fetched twice");
    assert.equal(asked.length, 5);
    // --retry-failed asks for the failed one again (and only it); once it reads, it is done.
    docs.set([...docs.keys()][0], jointXml([owner("0008888880", "SOLO 0", "")]).replace(ACC, older[0]));
    const retry = await backfillFilingOwners({ query: db.query, transaction, parseOwnership, writeFilingOwners: db.writeFilingOwners, retryFailed: true, wait: async () => {}, fetcher: xmlFor });
    assert.deepEqual([retry.filings, retry.owners, retry.failed, retry.remaining, retry.failedOnRecord, asked.length], [1, 1, 0, 0, 0, 6]);
    assert.deepEqual((await db.query("SELECT accession,owners,error FROM sec_filing_owners_checked WHERE accession=ANY($1::text[]) ORDER BY 1", [older])).rows,
      older.map((accession, i) => ({ accession, owners: i === 1 ? 0 : 1, error: null })));

    // The script itself refuses to run while an ingest holds the lock, and changes nothing.
    const { execFile } = await import("node:child_process");
    const holder = await admin.connect();
    try {
      assert.equal((await holder.query("SELECT pg_try_advisory_lock($1) AS locked", [INGEST_LOCK])).rows[0].locked, true);
      const out = await new Promise(resolve => execFile(process.execPath, [new URL("../scripts/backfill-filing-owners.mjs", import.meta.url).pathname, "--limit=5"],
        { env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL, SEC_USER_AGENT: "Insidir Research hello@aethric.llc" } }, (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr })));
      assert.equal(out.code, 75, out.stderr);
      assert.match(out.stderr, /An ingest is running \(advisory lock 813076522 is held\)\. Nothing was changed/);
      const bad = await new Promise(resolve => execFile(process.execPath, [new URL("../scripts/backfill-filing-owners.mjs", import.meta.url).pathname, "--limit", "5"],
        { env: { ...process.env } }, (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stderr })));
      assert.equal(bad.code, 2);
      assert.match(bad.stderr, /--limit needs a whole number from 1 to 100000, as --limit=N/, "\"--limit 5\" is refused, never read as 1");
    } finally { await holder.query("SELECT pg_advisory_unlock($1)", [INGEST_LOCK]).catch(() => {}); holder.release(); }

    // SMITH BOB files nothing alone: the profile attributes the joint line and reads his roles from the table.
    const offline = { query: db.query, fetcher: async () => { throw new Error("offline"); }, ownerIssuers: async () => [], tickerIndex: null };
    const body = await personProfile("4444444", offline);
    assert.deepEqual(body.person, { cik: "0004444444", name: "SMITH BOB", filed_names: ["SMITH BOB"] });
    assert.deepEqual(body.companies.map(c => [c.ticker, c.roles, c.transactions, c.purchases_value]), [["EXMP", ["Chief Executive Officer", "Director"], 1, 25000.5]]);
    assert.deepEqual([body.totals.d30.purchases.count, body.totals.d30.purchases.value], [1, 25000.5]);
    assert.equal(body.transactions[0].owner_cik, null);
    assert.deepEqual(body.transactions[0].owners, [{ cik: "0005555555", name: "FUND LP" }, { cik: "0004444444", name: "SMITH BOB" }], "every co-filer, in filing order, to link");
    assert.equal((await personProfile("5555555", offline)).companies[0].roles[0], "10% owner");
  } finally {
    await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`).catch(() => {});
    await admin.end();
    await db.pool?.end();
    globalThis.fetch = realFetch;
  }
});
