import test from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { readFile } from "node:fs/promises";

/* Joint filings outside the follow routes: a Form 4 with several reporting owners is stored with
 * owner_cik NULL on its lines, and sec_filing_owners (sql/008) names each owner. GET /v1/insiders lists
 * those owners (so a joint-only filer can be found from the people directory and the header search),
 * and /v1/me/alerts, /v1/me/manual-holdings and the personnel file name every owner of a joint line
 * (owners: [{cik, name}]) so each links to their own file. The router runs with a stubbed session
 * loader and an injected query(sql, params); the last test runs the SQL on PostgreSQL when
 * INSIDIR_TEST_DATABASE_URL is set (inside a throwaway schema). Fixtures are fictional. */
process.env.SEC_USER_AGENT ||= "Insidir Research hello@aethric.llc";
const realFetch = globalThis.fetch;
globalThis.fetch = async url => { throw new Error("Network used in a unit test: " + url); };
const { createApiServer, INSIDERS_SQL, normalizePersonQuery } = await import("../src/api.mjs");
const { OWNERS_TABLE_SQL, JOINT_OWNERS_SQL } = await import("../src/person-profile.mjs");

const PAID = { id: "11111111-1111-4111-8111-111111111111", email: "paid@example.com", subscription_status: "active", current_period_end: null };
const flat = sql => sql.replace(/\s+/g, " ").trim();
function fakeQuery(answers = {}) {
  const fn = async (sql, params) => {
    const text = flat(sql);
    fn.statements.push({ sql: text, params });
    const hit = Object.hasOwn(answers, text) ? answers[text] : Object.entries(answers).find(([prefix]) => text.startsWith(prefix))?.[1];
    if (hit instanceof Error) throw hit;
    if (typeof hit === "function") return hit(params);
    return hit || { rows: [], rowCount: 0 };
  };
  fn.statements = [];
  fn.of = sql => fn.statements.filter(s => s.sql === flat(sql));
  return fn;
}
const PRESENT = { [flat(OWNERS_TABLE_SQL)]: { rows: [{ present: true }], rowCount: 1 } };
const OWNERS = { [flat(JOINT_OWNERS_SQL)]: { rows: [{ accession: "000222222226000001", owner_cik: "0005555555", owner_name: "FUND LP" }, { accession: "000222222226000001", owner_cik: "0004444444", owner_name: "SMITH BOB" }] } };
const BOTH = [{ cik: "0005555555", name: "FUND LP" }, { cik: "0004444444", name: "SMITH BOB" }];
function get(base, path) {
  return new Promise((resolve, reject) => {
    const u = new URL(base);
    const req = request({ host: u.hostname, port: u.port, path, headers: { cookie: "insidir_sid=paid" } }, res => {
      let text = ""; res.on("data", c => text += c); res.on("end", () => resolve({ status: res.statusCode, json: text ? JSON.parse(text) : null }));
    });
    req.on("error", reject); req.end();
  });
}
async function withApi(query, fn, user = PAID) {
  const server = createApiServer({ env: {}, currentUser: async () => user, query, quiet: true });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  try { await fn(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); }
}

test("natural-order people queries and SEC owner CIKs normalize safely",()=>{
  assert.equal(normalizePersonQuery("  Tim Cook "),"TIM COOK");
  assert.equal(normalizePersonQuery("Cook, Timothy D."),"COOK TIMOTHY D");
  assert.equal(normalizePersonQuery("Jensen Huang"),"JENSEN HUANG");
  assert.equal(normalizePersonQuery("0001214156"),"0001214156");
  assert.equal(normalizePersonQuery(""),"");
  assert.equal(normalizePersonQuery("  O'Neil—Mary  "),"O NEIL MARY");
});

test("GET /v1/insiders: each person once by CIK without leading zeros; with sec_filing_owners, joint filers too", async () => {
  for (const sql of Object.values(INSIDERS_SQL)) {
    const text = flat(sql);
    assert.match(text, /^SELECT LPAD\(l\.bare,10,'0'\) AS owner_cik,/, "answered in the 10-digit form");
    assert.match(text, /GROUP BY l\.bare ORDER BY last_transaction_date DESC NULLS LAST,l\.bare LIMIT \$2 OFFSET \$3$/);
    assert.match(text, /t\.owner_cik IS NOT NULL AND \(\$1::text='' OR CASE WHEN \$1 ~/, "q is parameterized and supports owner CIK");
    assert.ok(!text.includes("${"), "no unexpanded template");
  }
  assert.ok(!flat(INSIDERS_SQL.single).includes("sec_filing_owners"));
  assert.match(flat(INSIDERS_SQL.joint), /UNION ALL SELECT LTRIM\(o\.owner_cik,'0'\),o\.owner_name,t\.ticker,t\.issuer_cik,t\.accession,t\.transaction_date FROM sec_filing_owners o JOIN sec_transactions t ON t\.accession=o\.accession AND t\.owner_cik IS NULL WHERE \(\$1::text='' OR CASE WHEN \$1 ~/,
    "a joint owner is matched using their own filed name and CIK");
  const row = { owner_cik: "0004444444", owner_name: "SMITH BOB", ticker: "EXMP", issuer_cik: "0000099999", filings: 1, last_transaction_date: "2026-10-07" };
  const joint = fakeQuery({ ...PRESENT, [flat(INSIDERS_SQL.joint)]: params => ({ rows: params[0] === "SMITH" ? [row] : [] }) });
  await withApi(joint, async base => {
    const r = await get(base, "/v1/insiders?q=%20SMITH%20");
    assert.deepEqual([r.status, r.json], [200, { items: [row], offset:0, limit:100, hasMore:false, source:"Imported SEC Form 4 reporting owners", coverage:"Only imported reporting owners, not all public officials or SEC filers" }]);
    assert.deepEqual(joint.of(INSIDERS_SQL.joint).map(s => s.params), [["SMITH",101,0]]);
  });
  const single = fakeQuery();
  await withApi(single, async base => {
    assert.equal((await get(base, "/v1/insiders")).status, 200);
    assert.deepEqual(single.statements.map(s => s.sql), [flat(OWNERS_TABLE_SQL), flat(INSIDERS_SQL.single)], "without the table, own lines only");
  });
});

test("/v1/me/alerts and /v1/me/manual-holdings name every owner of a joint line, in one read", async () => {
  const line = (owner, name) => ({ id: "000222222226000001:N:0", accession: "000222222226000001", issuer_cik: "0000099999", ticker: "EXMP", owner_cik: owner, owner_name: name,
    transaction_date: "2026-10-07", category: "reported_purchase", estimated_value: "25000.50", source_url: "https://www.sec.gov/x", published_at: "2026-10-08T12:00:00.000Z" });
  const solo = { ...line("0001111111", "DOE JOHN"), id: "000111111126000001:N:0", accession: "000111111126000001", ticker: "SOLO" };
  const query = fakeQuery({
    ...PRESENT, ...OWNERS,
    "SELECT t.id,t.accession,t.issuer_cik,t.ticker,t.owner_cik": { rows: [line(null, "FUND LP, SMITH BOB"), solo] },
    "SELECT ticker,quantity,updated_at FROM manual_holdings": { rows: [{ ticker: "EXMP", quantity: "5" }, { ticker: "SOLO", quantity: "1" }] },
    "SELECT DISTINCT ON(t.ticker) t.ticker,t.accession,t.issuer_cik,t.owner_cik": { rows: [line(null, "FUND LP, SMITH BOB"), solo] }
  });
  await withApi(query, async base => {
    const alerts = await get(base, "/v1/me/alerts");
    assert.equal(alerts.status, 200);
    assert.deepEqual(alerts.json.items.map(x => [x.owner_cik, x.owners]), [[null, BOTH], ["0001111111", undefined]]);
    assert.equal(alerts.json.items[0].accession, "000222222226000001");
    const holdings = await get(base, "/v1/me/manual-holdings");
    assert.equal(holdings.status, 200);
    assert.deepEqual(holdings.json.recentSecActivity.map(x => [x.ticker, x.owner_cik, x.owners]), [["EXMP", null, BOTH], ["SOLO", "0001111111", undefined]]);
  });
  assert.deepEqual(query.of(JOINT_OWNERS_SQL).map(s => s.params), [[["000222222226000001"]], [["000222222226000001"]]], "one owners read per answer");
  const alertsSql = query.statements.find(s => s.sql.startsWith("SELECT t.id,t.accession"));
  assert.deepEqual(alertsSql.params, [PAID.id], "scoped to the member");
  // No table: the same answers without owners and without the owners read.
  const plain = fakeQuery({ "SELECT t.id,t.accession,t.issuer_cik,t.ticker,t.owner_cik": { rows: [line(null, "FUND LP, SMITH BOB")] } });
  await withApi(plain, async base => assert.equal("owners" in (await get(base, "/v1/me/alerts")).json.items[0], false));
  assert.equal(plain.of(JOINT_OWNERS_SQL).length, 0);
});

const PG_URL = process.env.INSIDIR_TEST_DATABASE_URL || "";
test("on PostgreSQL: a joint-only filer is in /v1/insiders, and joint lines carry owners on alerts, holdings, the feed and the personnel file", { skip: PG_URL ? false : "INSIDIR_TEST_DATABASE_URL is not set" }, async () => {
  const { default: pg } = await import("pg");
  const schema = "joint_lines_test_" + process.pid;
  const pool = new pg.Pool({ connectionString: PG_URL, max: 1, options: "-c search_path=" + schema });
  const query = (sql, params = []) => pool.query(sql, params);
  const file = f => readFile(new URL("../sql/" + f, import.meta.url), "utf8");
  try {
    await query(`CREATE SCHEMA ${schema}`);
    for (const f of ["001_initial.sql", "002_billing.sql", "005_manual_holdings.sql", "006_followed_people.sql", "008_filing_owners.sql"]) await query(await file(f));
    const day = n => new Date(Date.now() - n * 86400000).toISOString();
    const filing = (acc, days, owners) => query(`INSERT INTO sec_filings(accession,filer_cik,issuer_cik,issuer_name,ticker,title,form_type,published_at,is_amendment,source_url,owner_names,ingest_status)
      VALUES($1,'1111111','0000099999','Example Corp','EXMP','4','4',$2,false,'https://www.sec.gov/x',$3,'parsed')`, [acc, day(days), owners]);
    const line = (acc, owner, name, n = 0) => query(`INSERT INTO sec_transactions(id,accession,issuer_cik,ticker,owner_cik,owner_name,transaction_date,transaction_code,acquired_disposed,category,derivative,shares,price_per_share,estimated_value,source_url)
      VALUES($1,$2,'0000099999','EXMP',$3,$4,$5,'P','A','reported_purchase',false,1000,25,25000,'https://www.sec.gov/')`, [acc + ":N:" + n, acc, owner, name, day(4 + n).slice(0, 10)]);
    // DOE JOHN files alone (one line stored unpadded, one padded: one person); SMITH BOB (4444444) only ever files jointly with FUND LP.
    await filing("000111111126000001", 3, ["DOE JOHN"]); await line("000111111126000001", "0001111111", "DOE JOHN"); await line("000111111126000001", "1111111", "DOE JOHN", 1);
    await filing("000222222226000001", 2, ["FUND LP", "SMITH BOB"]); await line("000222222226000001", null, "FUND LP, SMITH BOB");
    for (const [cik, name] of [["0005555555", "FUND LP"], ["0004444444", "SMITH BOB"]]) await query(`INSERT INTO sec_filing_owners(accession,owner_cik,owner_name,is_ten_percent_owner) VALUES('000222222226000001',$1,$2,true)`, [cik, name]);
    const user = (await query("INSERT INTO users(email,password_hash,subscription_status) VALUES('joint@example.com','x','active') RETURNING id")).rows[0].id;
    await query("INSERT INTO watchlist(user_id,ticker) VALUES($1,'EXMP')", [user]);
    await query("INSERT INTO manual_holdings(user_id,ticker,quantity) VALUES($1,'EXMP',5)", [user]);
    await query("INSERT INTO followed_people(user_id,owner_cik) VALUES($1,'0004444444')", [user]);
    await withApi(query, async base => {
      const all = (await get(base, "/v1/insiders")).json.items;
      assert.deepEqual(all.map(x => [x.owner_cik, x.owner_name, x.ticker, x.issuer_cik, x.filings]).sort(), [
        ["0001111111", "DOE JOHN", "EXMP", "0000099999", 1], ["0004444444", "SMITH BOB", "EXMP", "0000099999", 1], ["0005555555", "FUND LP", "EXMP", "0000099999", 1]]);
      assert.deepEqual((await get(base, "/v1/insiders?q=smith")).json.items.map(x => x.owner_cik), ["0004444444"]);
      assert.deepEqual((await get(base, "/v1/insiders?q=FUND")).json.items.map(x => x.owner_name), ["FUND LP"], "matched by the name filed, not the joined line name");
      assert.deepEqual((await get(base, "/v1/insiders?q=Bob%20Smith")).json.items.map(x=>x.owner_name), ["SMITH BOB"], "natural first-name order");
      assert.deepEqual((await get(base, "/v1/insiders?q=0004444444")).json.items.map(x=>x.owner_name), ["SMITH BOB"], "SEC reporting owner CIK");
      const profile = (await get(base, "/v1/people/4444444")).json;
      assert.deepEqual(profile.person, { cik: "0004444444", name: "SMITH BOB", filed_names: ["SMITH BOB"] });
      assert.deepEqual(profile.transactions.map(x => [x.owner_cik, x.owners]), [[null, BOTH]]);
      const alerts = (await get(base, "/v1/me/alerts")).json.items;
      assert.deepEqual(alerts.filter(x => x.owner_cik == null).map(x => x.owners), [BOTH]);
      // EXMP's newest line is the joint one (filed 2 days ago, DOE JOHN's 3 days ago).
      assert.deepEqual((await get(base, "/v1/me/manual-holdings")).json.recentSecActivity.map(x => [x.ticker, x.owner_cik, x.owners]), [["EXMP", null, BOTH]]);
      const feed = (await get(base, "/v1/me/people/updates")).json;
      assert.deepEqual(feed.items.map(x => x.owners), [BOTH]);
    }, { ...PAID, id: user });
  } finally {
    await query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    await pool.end();
    globalThis.fetch = realFetch;
  }
});
