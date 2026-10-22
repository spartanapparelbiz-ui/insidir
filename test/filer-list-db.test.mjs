/* Every EDGAR filer is searchable (sec_filer_names, from the SEC's cik-lookup-data.txt), and opening a person queues
 * their own older Form 4s for import. Runs only with INSIDIR_TEST_DATABASE_URL, in a throwaway schema. No network:
 * the SEC list is a small sample in its published format, and no EDGAR lookup is made. */
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const PG_URL = process.env.INSIDIR_TEST_DATABASE_URL || "";
const SCHEMA = "fl_test_" + process.pid;
const skip = !PG_URL && "set INSIDIR_TEST_DATABASE_URL";
if (PG_URL) process.env.DATABASE_URL = PG_URL + (PG_URL.includes("?") ? "&" : "?") + "options=" + encodeURIComponent("-c search_path=" + SCHEMA + ",public");

// The published format: "NAME:CIK:" per line; a name may contain a colon.
const SAMPLE = [":0001003197:", "THIEL PETER:0001211060:", "TRUMP DONALD J:0000947033:", "DONALD J. TRUMP REVOCABLE TRUST DATED APRIL 7, 2014:0002050191:",
  "WOOD CATHERINE D.:0001697833:", "ACKMAN WILLIAM ALBERT:0001336528:", "HOFFMAN REID:0001536599:",
  "REID HOFFMAN & MICHELLE YEE LIVING TRUST:0001780325:", "RATIO: A COMPANY LLC:0001999999:", "BAD LINE WITHOUT CIK"].join("\n") + "\n";
const filler = Array.from({ length: 100_000 }, (_, i) => "FILLER NAME " + i + ":" + String(3_000_000 + i).padStart(10, "0") + ":").join("\n");

test("every EDGAR filer is searchable, and a person's older filings are queued when opened", { skip }, async t => {
  const admin = new pg.Client({ connectionString: PG_URL });
  await admin.connect();
  await admin.query("CREATE SCHEMA IF NOT EXISTS " + SCHEMA);
  t.after(async () => { const db = await import("../src/db.mjs"); await db.pool.end().catch(() => {}); await admin.query("DROP SCHEMA IF EXISTS " + SCHEMA + " CASCADE"); await admin.end(); });
  const db = await import("../src/db.mjs");
  await db.migrate();
  const run = (sql, p) => db.query(sql, p);
  const { parseFilerList, syncFilerList, searchEntities } = await import("../src/sec-directory.mjs");
  const { queueOwnerHistory } = await import("../src/coverage-ingest.mjs");

  await t.test("the list is read as published, including a name with a colon", () => {
    const rows = parseFilerList(SAMPLE);
    assert.deepEqual(rows.find(r => r[0] === "0001211060"), ["0001211060", "THIEL PETER", "THIEL PETER"]);
    assert.ok(rows.some(r => r[1] === "RATIO: A COMPANY LLC"));
    assert.ok(!rows.some(r => r[0] === "0001003197"), "a line with no name is skipped");
    assert.equal(rows.length, 8);
  });

  await t.test("sync loads it once, then skips while it is fresh; a truncated list is refused", async () => {
    await assert.rejects(syncFilerList({ run, fetcher: async () => SAMPLE }), /looks incomplete/);
    const first = await syncFilerList({ run, fetcher: async () => SAMPLE + filler });
    assert.equal(first.added, 100_008);
    const again = await syncFilerList({ run, fetcher: async () => { throw new Error("must not fetch"); } });
    assert.equal(again.skipped, true);
  });

  await t.test("search finds people who were never in Insidir's directory, closest name first", async () => {
    const s = async q => (await searchEntities(q, { run, edgar: false, limit: 5 })).items.map(i => i.displayName || i.name);
    assert.deepEqual((await s("peter thiel")).slice(0, 1), ["Peter Thiel"]);
    assert.deepEqual((await s("Donald Trump")).slice(0, 1), ["Donald J. Trump"], "the person before the trust named after him");
    assert.deepEqual((await s("reid hoffman")).slice(0, 1), ["Reid Hoffman"]);
    const cathie = await searchEntities("Cathie Wood", { run, edgar: false });
    assert.equal(cathie.searchedAs, "catherine wood"); assert.equal(cathie.items[0].displayName, "Catherine D. Wood");
    assert.equal((await searchEntities("bill ackman", { run, edgar: false })).items[0].displayName, "William Albert Ackman");
    const none = await searchEntities("Mohammed bin Salman", { run, edgar: false });
    assert.equal(none.items.length, 0); assert.equal(none.state, "no_match");
    const hit = (await searchEntities("peter thiel", { run, edgar: false })).items[0];
    assert.equal(hit.url, "entity.html?cik=0001211060", "an unopened filer opens its SEC record");
  });

  await t.test("opening a person queues their own Form 4s, once, ahead of the backfill", async () => {
    const entries = [{ form_type: "4", accession: "0001211060-26-000007", filed_at: "2026-03-04" }, { form_type: "4/A", accession: "0001211060-25-000002", filed_at: "2025-02-01" },
      { form_type: "SC 13G", accession: "0001211060-25-000001", filed_at: "2025-01-01" }, { form_type: "4", accession: "bad", filed_at: "2025-01-01" }];
    assert.equal(await queueOwnerHistory(run, "0001211060", entries), 2, "only Form 4 and 4/A with a valid accession");
    assert.equal(await queueOwnerHistory(run, "0001211060", entries), 0, "already queued");
    await run("INSERT INTO sec_ingest_queue(accession,filer_cik,form_type,filed_date,source,status) VALUES('000999999926000001','999','4','2026-10-20','daily-index','pending')");
    const claimed = (await run(`SELECT accession FROM sec_ingest_queue WHERE status IN ('pending','retry') ORDER BY (source='on_demand') DESC,filed_date DESC NULLS LAST,accession DESC LIMIT 1`)).rows[0];
    assert.equal(claimed.accession, "000121106026000007", "what someone is looking at goes before the backfill");
  });
});
