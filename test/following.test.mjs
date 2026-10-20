import test from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { readFile } from "node:fs/promises";
import { createApiServer, FOLLOW_SQL, FOLLOW_INSERT_SQL, FOLLOW_DELETE_SQL, JOINT_OWNERS_SQL, canonicalOwnerCik } from "../src/api.mjs";
import { classifyApi } from "../src/paywall.mjs";
import { OWNERS_TABLE_SQL, SAME_LINE, RECENT_DISCLOSED, personProfile } from "../src/person-profile.mjs";

/* Followed people: GET/POST /v1/me/people, DELETE /v1/me/people/<cik> and GET /v1/me/people/updates
 * (the "People you follow" feed on the signed-in home page). The router runs with a stubbed session
 * loader and an injected query(sql, params). The last test runs the SQL itself on PostgreSQL when
 * INSIDIR_TEST_DATABASE_URL is set (inside a throwaway schema). */

const ON = {}; // paywall on (the default)
const USERS = {
  paid: { id: "11111111-1111-4111-8111-111111111111", email: "paid@example.com", subscription_status: "active", current_period_end: null },
  other: { id: "66666666-6666-4666-8666-666666666666", email: "other@example.com", subscription_status: "trialing", current_period_end: null },
  lapsed: { id: "33333333-3333-4333-8333-333333333333", email: "lapsed@example.com", subscription_status: "past_due", current_period_end: null },
  none: { id: "44444444-4444-4444-8444-444444444444", email: "new@example.com", subscription_status: null, current_period_end: null },
  burst: { id: "77777777-7777-4777-8777-777777777777", email: "burst@example.com", subscription_status: "active", current_period_end: null }
};
const flat = sql => sql.replace(/\s+/g, " ").trim();
const S = Object.fromEntries(Object.entries(FOLLOW_SQL.single).map(([k, v]) => [k, flat(v)]));
const J = Object.fromEntries(Object.entries(FOLLOW_SQL.joint).map(([k, v]) => [k, flat(v)]));
// The follow set every follow query starts from: at most the 150 newest follows, each person once.
const FOLLOW_SET = "fp AS MATERIALIZED (SELECT n.bare,LPAD(n.bare,10,'0') AS owner_cik,MIN(n.created_at) AS created_at FROM (SELECT LTRIM(owner_cik,'0') AS bare,created_at FROM followed_people WHERE user_id=$1 ORDER BY created_at DESC LIMIT 150) n WHERE n.bare<>'' GROUP BY n.bare)";
const BY_ID_SQL = "SELECT t.*,f.issuer_name,f.published_at,f.is_amendment FROM sec_transactions t JOIN sec_filings f ON f.accession=t.accession WHERE t.id=ANY($1::text[])";
const TABLE = flat(OWNERS_TABLE_SQL);
const PRESENT = { [TABLE]: { rows: [{ present: true }], rowCount: 1 } };
const DISCLAIMER = "Reported purchases and sales are not recommendations or predictive signals.";

// Answers by exact SQL text (whitespace folded), else by prefix, and records every statement.
function fakeQuery(rows = {}) {
  const fn = async (sql, params) => {
    const text = flat(sql);
    fn.statements.push({ sql: text, params });
    const hit = Object.hasOwn(rows, text) ? rows[text] : Object.entries(rows).find(([prefix]) => text.startsWith(prefix))?.[1];
    if (hit !== undefined) {
      if (hit instanceof Error) throw hit;
      return typeof hit === "function" ? hit(params) : hit;
    }
    return { rows: [], rowCount: 0 };
  };
  fn.statements = [];
  fn.of = sql => fn.statements.filter(s => s.sql === flat(sql));
  return fn;
}
function send(base, path, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(base);
    const req = request({ host: u.hostname, port: u.port, path, method, headers }, res => {
      let text = ""; res.on("data", c => text += c); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, text, json: () => JSON.parse(text) }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}
async function withApi(query, fn, env = ON) {
  const currentUser = async req => USERS[/insidir_sid=(\w+)/.exec(req.headers.cookie || "")?.[1]] || null;
  const server = createApiServer({ env, currentUser, query, quiet: true });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base); } finally { server.close(); }
}
const as = (sid, extra = {}) => ({ ...extra, headers: { cookie: "insidir_sid=" + sid, ...(extra.headers || {}) } });
const follow = (base, sid, cik) => send(base, "/v1/me/people", as(sid, { method: "POST",
  headers: { origin: base.replace("http:", "https:"), "content-type": "application/json" }, body: typeof cik === "string" && cik.startsWith("{") ? cik : JSON.stringify({ owner_cik: cik }) }));

// Rows as pg returns them: timestamps as Date, COUNT/SUM/NUMERIC as strings.
const tx = (id, owner, published, extra = {}) => ({
  id, accession: id.split(":")[0], issuer_cik: "320193", ticker: "AAPL", owner_cik: owner, owner_name: "Owner " + owner,
  transaction_date: new Date("2026-10-01T00:00:00Z"), security_title: "Common Stock", transaction_code: "P", acquired_disposed: "A",
  category: "reported_purchase", derivative: false, shares: "10.00000000", price_per_share: "100.05000000", estimated_value: "1000.50",
  direct_ownership: "D", source_url: "https://www.sec.gov/x", created_at: new Date("2026-10-02T00:00:00Z"),
  issuer_name: "Apple Inc.", published_at: published, is_amendment: false, ...extra
});
const person = (owner, lastId, extra = {}) => ({
  owner_cik: owner, followed_at: new Date("2026-09-01T12:00:00Z"), following: "3", last_id: lastId, owner_name: "Owner " + owner,
  ticker: "AAPL", issuer_name: "Apple Inc.", last_published_at: new Date("2026-10-12T15:00:00Z"),
  last_transaction_date: new Date("2026-10-01T00:00:00Z"), filings_30d: "2", transactions_30d: "5",
  purchases_30d_value: "1300.50", sales_30d_value: "0", ...extra
});
const iso = value => JSON.parse(JSON.stringify(value));

test("GET /v1/me/people/updates is gated exactly like the other /v1/me product routes", async () => {
  for (const method of ["GET", "HEAD", "POST"]) assert.equal(classifyApi("/v1/me/people/updates", method), "product", method);
  const query = fakeQuery();
  await withApi(query, async base => {
    let r = await send(base, "/v1/me/people/updates");
    assert.equal(r.status, 401);
    assert.deepEqual(r.json(), { error: "Sign in required", signin: "/signin.html" });
    for (const sid of ["lapsed", "none"]) {
      r = await send(base, "/v1/me/people/updates?limit=5", as(sid));
      assert.equal(r.status, 402, sid);
      assert.deepEqual(r.json(), { error: "An active Insidir subscription is required", subscribe: "/subscribe.html" });
    }
    // Same answers as an existing /v1/me product read.
    assert.equal((await send(base, "/v1/me/people")).status, 401);
    assert.equal((await send(base, "/v1/me/people", as("lapsed"))).status, 402);
  });
  assert.equal(query.statements.length, 0, "a rejected request never reaches the database");
});

test("following nobody answers 200 with an empty feed after one query (plus the remembered table check)", async () => {
  const query = fakeQuery();
  await withApi(query, async base => {
    for (let i = 0; i < 2; i++) {
      const r = await send(base, "/v1/me/people/updates", as("paid"));
      assert.equal(r.status, 200);
      assert.deepEqual(r.json(), { people: [], items: [], following: 0, source: "SEC Form 4", disclaimer: DISCLAIMER });
      assert.equal(r.headers["cache-control"], "no-store");
      assert.match(r.headers.vary, /\bCookie\b/);
    }
  });
  assert.deepEqual(query.statements.map(s => s.sql), [TABLE, S.people, S.people], "sec_filing_owners is looked up once, then remembered");
  assert.deepEqual(query.statements[1].params, [USERS.paid.id]);
});

test("limit: default 40, clamped to 1..100, garbage falls back to the default (the /v1 convention)", async () => {
  const query = fakeQuery({ [S.people]: { rows: [person("0000000100", null)] } });
  const cases = [["", 40], ["?limit=", 40], ["?limit=25", 25], ["?limit=100", 100], ["?limit=101", 100], ["?limit=100000", 100],
    ["?limit=0", 1], ["?limit=-5", 1], ["?limit=abc", 40], ["?limit=2.5", 40], ["?limit=1e1", 10], ["?limit=%20", 40]];
  await withApi(query, async base => {
    for (const [search, expected] of cases) {
      query.statements.length = 0;
      const r = await send(base, "/v1/me/people/updates" + search, as("paid"));
      assert.equal(r.status, 200, search);
      assert.deepEqual(query.of(S.items)[0].params, [USERS.paid.id, expected], search);
    }
  });
});

test("SQL is parameterised, scoped to the signed-in user, keyed without leading zeros and ordered most recent first", async () => {
  const query = fakeQuery({ [S.people]: { rows: [person("0000000100", null)] } });
  await withApi(query, async base => {
    assert.equal((await send(base, "/v1/me/people/updates?limit=7", as("paid"))).status, 200);
    assert.equal((await send(base, "/v1/me/people/updates?limit=7", as("other"))).status, 200);
  });
  const [peopleA, peopleB] = query.of(S.people), [itemsA, itemsB] = query.of(S.items);
  for (const s of [peopleA, peopleB]) {
    assert.ok(s.sql.startsWith("WITH " + FOLLOW_SET + " SELECT fp.owner_cik,fp.created_at AS followed_at,"));
    assert.match(s.sql, /ORDER BY s\.last_published_at DESC NULLS LAST,fp\.created_at DESC,fp\.owner_cik LIMIT 150$/);
    // One pass per person: their lines in both stored forms (index-friendly), parsed filings probed once per line.
    assert.ok(s.sql.includes("LEFT JOIN LATERAL (WITH lines AS MATERIALIZED (SELECT t.*,f.published_at,f.is_amendment,f.issuer_name," + SAME_LINE + " AS same FROM (SELECT t.id,"));
    assert.match(s.sql, /FROM sec_transactions t WHERE t\.owner_cik IN \(fp\.bare,fp\.owner_cik\)\) t JOIN sec_filings f ON f\.accession=t\.accession WHERE f\.ingest_status='parsed'\)/);
    // The latest line by the feed's ordering, from the same rows.
    assert.ok(s.sql.includes("latest AS (SELECT t.id,t.owner_name,t.ticker,t.issuer_name FROM lines t ORDER BY t.published_at DESC NULLS LAST,t.transaction_date DESC NULLS LAST,t.id DESC LIMIT 1)"));
    assert.match(s.sql, /COUNT\(DISTINCT c\.accession\) FILTER \(WHERE c\.published_at>=now\(\)-interval '30 days'\)\)::integer AS filings_30d/);
    // One rule with the profile: SAME_LINE keys the copies (only keys a 4/A carries are grouped), restated lines count once, by first filing date.
    assert.ok(s.sql.includes("amended AS (SELECT t.same,MAX(t.published_at) AS amended_at FROM lines t WHERE t.is_amendment GROUP BY t.same)"));
    assert.ok(s.sql.includes("copies AS (SELECT a.same,a.amended_at,MIN(t.published_at) AS first_published_at FROM amended a JOIN lines t ON t.same=a.same GROUP BY a.same,a.amended_at)"));
    assert.ok(s.sql.includes("(k.amended_at IS NOT NULL AND (t.published_at IS NULL OR k.amended_at>t.published_at)) AS superseded"));
    assert.ok(s.sql.includes("CASE WHEN t.is_amendment THEN k.first_published_at ELSE t.published_at END AS disclosed_at"));
    for (const measure of ["(COUNT(*) FILTER (WHERE NOT c.superseded AND " + RECENT_DISCLOSED + "))::integer AS transactions_30d",
      "SUM(c.estimated_value) FILTER (WHERE c.category='reported_purchase' AND NOT c.superseded AND " + RECENT_DISCLOSED + "),0) AS purchases_30d_value",
      "SUM(c.estimated_value) FILTER (WHERE c.category='reported_sale' AND NOT c.superseded AND " + RECENT_DISCLOSED + "),0) AS sales_30d_value"])
      assert.ok(s.sql.includes(measure), measure);
    assert.doesNotMatch(s.sql, /sec_filing_owners/, "no joint table without sec_filing_owners");
  }
  for (const s of [itemsA, itemsB]) {
    assert.ok(s.sql.startsWith("WITH " + FOLLOW_SET + " SELECT t.*,f.issuer_name,f.published_at,f.is_amendment FROM (SELECT t.* FROM fp JOIN sec_transactions t ON t.owner_cik IN (fp.bare,fp.owner_cik)) t JOIN sec_filings f ON f.accession=t.accession"));
    assert.match(s.sql, /WHERE f\.ingest_status='parsed' ORDER BY f\.published_at DESC NULLS LAST,t\.transaction_date DESC NULLS LAST,t\.id DESC LIMIT \$2$/);
  }
  assert.deepEqual(peopleA.params, [USERS.paid.id]);
  assert.deepEqual(itemsA.params, [USERS.paid.id, 7]);
  assert.deepEqual(peopleB.params, [USERS.other.id]);
  assert.deepEqual(itemsB.params, [USERS.other.id, 7]);
  for (const s of query.statements) assert.doesNotMatch(s.sql, /11111111|66666666/, "user ids are bound, never interpolated");
});

test("feed work is bounded: every follow query reads the capped follow set once, before any per-person join", async () => {
  for (const variant of [S, J]) for (const name of ["people", "items", "list"]) {
    const sql = variant[name];
    assert.equal(sql.split(FOLLOW_SET).length, 2, name + ": the follow set is read exactly once");
    assert.ok(sql.indexOf(FOLLOW_SET) < sql.search(/ JOIN /), name);
    // Every other read of followed_people is the follow count (people only).
    const reads = sql.split("followed_people").length - 1;
    assert.equal(reads, name === "people" ? 2 : 1, name);
    assert.doesNotMatch(sql, /FROM followed_people fp\b/);
  }
  // "following" counts every person followed (each once), not just the 150 shown.
  assert.match(S.people, /SELECT fp\.owner_cik,fp\.created_at AS followed_at,\(SELECT count\(DISTINCT LTRIM\(owner_cik,'0'\)\) FROM followed_people WHERE user_id=\$1\)::integer AS following,/);
});

test("one canonical owner CIK: POST stores the 10-digit form, and padded, unpadded or legacy rows are one follow", async () => {
  assert.equal(canonicalOwnerCik("1214156"), "0001214156");
  assert.equal(canonicalOwnerCik(" 0001214156 "), "0001214156");
  assert.equal(canonicalOwnerCik("000001214156"), "0001214156", "12 digits with leading zeros");
  for (const bad of ["", "0", "000", "12a", "12345678901", "1234567890123", null, 1214156.5]) assert.equal(canonicalOwnerCik(bad), null, String(bad));
  assert.equal(canonicalOwnerCik(1214156), "0001214156");
  // The duplicate check, the insert and the delete compare without leading zeros.
  assert.match(flat(FOLLOW_INSERT_SQL), /^WITH existing AS \(SELECT owner_cik FROM followed_people WHERE user_id=\$1 AND LTRIM\(owner_cik,'0'\)=LTRIM\(\$2,'0'\) ORDER BY created_at LIMIT 1\)/);
  assert.match(flat(FOLLOW_INSERT_SQL), /SELECT \$1,\$2 WHERE NOT EXISTS\(SELECT 1 FROM existing\) AND \(SELECT count\(\*\) FROM followed_people WHERE user_id=\$1\)<150 ON CONFLICT\(user_id,owner_cik\) DO UPDATE SET created_at=followed_people\.created_at RETURNING owner_cik\) SELECT owner_cik FROM existing UNION ALL SELECT owner_cik FROM inserted$/);
  assert.equal(FOLLOW_DELETE_SQL, "DELETE FROM followed_people WHERE user_id=$1 AND LTRIM(owner_cik,'0')=LTRIM($2,'0')");

  let stored = null;
  const query = fakeQuery({
    [S.known]: { rows: [{ "?column?": 1 }], rowCount: 1 },
    [flat(FOLLOW_INSERT_SQL)]: params => { const row = stored ?? params[1]; return row ? { rows: [{ owner_cik: row }], rowCount: 1 } : { rows: [], rowCount: 0 }; }
  });
  await withApi(query, async base => {
    for (const sent of ["1214156", "0001214156", " 000001214156 "]) {
      const r = await follow(base, "paid", sent);
      assert.deepEqual([r.status, r.json()], [200, { saved: true, owner_cik: "0001214156" }], sent);
      // (Funnel measurement records a first follow too; it is not part of the follow itself.)
      const [known, insert] = query.statements.filter(x => !/funnel_events/.test(x.sql)).slice(-2);
      assert.deepEqual(known.params, [["1214156", "0001214156"]], "the person is looked up in both forms");
      assert.equal(insert.sql, flat(FOLLOW_INSERT_SQL));
      assert.deepEqual(insert.params, [USERS.paid.id, "0001214156"], "always stored as the 10-digit form");
    }
    // Already followed as a legacy "1214156" row: that row answers, nothing new is stored.
    stored = "1214156";
    let r = await follow(base, "paid", "0001214156");
    assert.deepEqual([r.status, r.json()], [200, { saved: true, owner_cik: "1214156" }]);
    // DELETE with either form removes every stored form.
    const origin = { origin: base.replace("http:", "https:") };
    r = await send(base, "/v1/me/people/0001214156", as("paid", { method: "DELETE", headers: origin }));
    assert.deepEqual([r.status, r.json()], [200, { deleted: true, owner_cik: "0001214156" }]);
    assert.deepEqual([query.statements.at(-1).sql, query.statements.at(-1).params], [FOLLOW_DELETE_SQL, [USERS.paid.id, "0001214156"]]);
  });
});

test("POST /v1/me/people caps the follow set at 150 like manual holdings cap theirs", async () => {
  let inserted = 1;
  const query = fakeQuery({
    [S.known]: { rows: [{ "?column?": 1 }], rowCount: 1 },
    [flat(FOLLOW_INSERT_SQL)]: params => ({ rows: inserted ? [{ owner_cik: params[1] }] : [], rowCount: inserted })
  });
  await withApi(query, async base => {
    let r = await follow(base, "paid", " 0001234 ");
    assert.deepEqual([r.status, r.json()], [200, { saved: true, owner_cik: "0000001234" }]);
    // At the cap the guarded insert returns nothing: 409, and the web client shows the message.
    inserted = 0;
    r = await follow(base, "paid", "5678");
    assert.deepEqual([r.status, r.json()], [409, { error: "150 people maximum; unfollow someone first" }]);
    // Validation runs before the existence check and the insert.
    const before = query.statements.length;
    for (const bad of ["12a", "0000", "12345678901", '{"owner_cik":null}', "null"]) {
      r = await follow(base, "paid", bad);
      assert.deepEqual([r.status, r.json()], [400, { error: "Valid reporting-person SEC CIK required" }], bad);
    }
    assert.equal(query.statements.length, before);
  });
  const missing = fakeQuery();
  await withApi(missing, async base => {
    const r = await follow(base, "paid", "999");
    assert.deepEqual([r.status, r.json()], [404, { error: "No SEC reporting owner with this CIK, in imported filings or in EDGAR" }]);
  });
  assert.equal(missing.of(FOLLOW_INSERT_SQL).length, 0, "an unknown CIK is never inserted");
});

test("POST /v1/me/people is rate limited per member (60 per 15 minutes) before touching the database", async () => {
  const query = fakeQuery({
    [S.known]: { rows: [{}], rowCount: 1 },
    [flat(FOLLOW_INSERT_SQL)]: params => ({ rows: [{ owner_cik: params[1] }], rowCount: 1 })
  });
  await withApi(query, async base => {
    // Rejected attempts count too, so probing for CIKs is bounded as well.
    for (let i = 0; i < 60; i++) assert.equal((await follow(base, "burst", i % 2 ? "x" : String(1000 + i))).status, i % 2 ? 400 : 200, "attempt " + i);
    const before = query.statements.length;
    const r = await follow(base, "burst", "4242");
    assert.deepEqual([r.status, r.json()], [429, { error: "Too many follow updates" }]);
    assert.equal(query.statements.length, before, "a limited request never reaches the database");
    // Unfollowing, reading the feed and another member's follows are unaffected.
    const origin = { origin: base.replace("http:", "https:") };
    assert.equal((await send(base, "/v1/me/people/1000", as("burst", { method: "DELETE", headers: origin }))).status, 200);
    assert.equal((await send(base, "/v1/me/people/updates", as("burst"))).status, 200);
    assert.equal((await follow(base, "other", "4242")).status, 200);
  });
});

test("joint filers: with sec_filing_owners a joint-only person can be followed, is in the feed, and joint lines name every owner", async () => {
  // The joint statements attribute a joint filing's lines (owner_cik NULL) to every owner it lists.
  assert.match(J.known, /^SELECT 1 FROM sec_transactions WHERE owner_cik=ANY\(\$1::text\[\]\) UNION ALL SELECT 1 FROM sec_filing_owners WHERE owner_cik=ANY\(\$1::text\[\]\) LIMIT 1$/);
  for (const name of ["people", "list"]) assert.ok(J[name].includes("UNION ALL SELECT t.accession") || J[name].includes("UNION ALL SELECT o.owner_name") || J[name].includes("UNION ALL SELECT t.id"), name);
  assert.ok(J.people.includes("UNION ALL SELECT t.id,t.accession,o.owner_name,t.ticker,t.issuer_cik,t.transaction_date,t.transaction_code,t.acquired_disposed,t.derivative,t.shares,t.category,t.estimated_value FROM sec_filing_owners o JOIN sec_transactions t ON t.accession=o.accession AND t.owner_cik IS NULL WHERE o.owner_cik IN (fp.bare,fp.owner_cik)"),
    "the person's own filed name, not the joined names");
  assert.ok(J.items.includes("UNION ALL SELECT t.* FROM sec_transactions t WHERE t.owner_cik IS NULL AND t.accession IN (SELECT o.accession FROM fp JOIN sec_filing_owners o ON o.owner_cik IN (fp.bare,fp.owner_cik))"),
    "a semi-join: a joint line listing two followed people appears once");

  const joint = tx("000222222226000001:N:0", null, new Date("2026-10-12T15:00:00Z"), { owner_name: "FUND LP, SMITH BOB", category: "reported_sale" });
  const own = tx("000222222226000002:N:0", "0003333333", new Date("2026-10-11T15:00:00Z"));
  const query = fakeQuery({
    ...PRESENT,
    [J.known]: { rows: [{ "?column?": 1 }], rowCount: 1 },
    [flat(FOLLOW_INSERT_SQL)]: params => ({ rows: [{ owner_cik: params[1] }], rowCount: 1 }),
    [J.people]: { rows: [person("0004444444", joint.id, { owner_name: "SMITH BOB", following: "2" }), person("0003333333", own.id, { following: "2" })] },
    [J.items]: { rows: [joint, own] },
    [J.list]: { rows: [{ owner_cik: "0004444444", created_at: new Date("2026-09-01T12:00:00Z"), owner_name: "SMITH BOB", ticker: "AAPL", last_transaction_date: null, last_published_at: null }] },
    [flat(JOINT_OWNERS_SQL)]: { rows: [{ accession: "000222222226000001", owner_cik: "0005555555", owner_name: "FUND LP" }, { accession: "000222222226000001", owner_cik: "0004444444", owner_name: "SMITH BOB" }] }
  });
  await withApi(query, async base => {
    const r = await follow(base, "paid", "4444444");
    assert.deepEqual([r.status, r.json()], [200, { saved: true, owner_cik: "0004444444" }]);
    assert.deepEqual(query.of(J.known)[0].params, [["4444444", "0004444444"]]);
    const body = (await send(base, "/v1/me/people/updates", as("paid"))).json();
    assert.deepEqual(body.people.map(p => [p.owner_cik, p.owner_name, p.last?.id]), [["0004444444", "SMITH BOB", joint.id], ["0003333333", "Owner 0003333333", own.id]]);
    assert.deepEqual(body.items[0].owners, [{ cik: "0005555555", name: "FUND LP" }, { cik: "0004444444", name: "SMITH BOB" }], "every owner of a joint line, in filing order");
    assert.equal(body.items[0].owner_cik, null, "the line itself is unchanged");
    assert.equal("owners" in body.items[1], false, "a single-owner line needs no owners list");
    assert.deepEqual(body.people[0].last.owners, body.items[0].owners);
    const owners = query.of(JOINT_OWNERS_SQL);
    assert.deepEqual(owners.map(s => s.params), [[["000222222226000001"]]], "one owners query for every joint line in the answer");
    assert.equal((await send(base, "/v1/me/people", as("paid"))).json().items[0].owner_name, "SMITH BOB");
  });
  assert.equal(query.of(TABLE).length, 1, "the table check is remembered");
  assert.match(flat(JOINT_OWNERS_SQL), /ORDER BY o\.accession,array_position\(f\.owner_names,o\.owner_name\) NULLS LAST,o\.owner_cik$/);
});

test("response shape: numbers are numbers, dates ISO strings, rows like /v1/transactions, latest line per person", async () => {
  const newest = tx("000000000000000001:N:1", "0000000100", new Date("2026-10-12T15:00:00Z"), { category: "reported_sale", estimated_value: "200.25" });
  const older = tx("000000000000000002:N:0", "0000000100", new Date("2026-10-04T15:00:00Z"));
  const bobLast = tx("000000000000000003:N:1", "0000000200", new Date("2026-08-15T15:00:00Z"));
  const people = [
    person("0000000100", newest.id),
    person("0000000200", bobLast.id, { following: 3, last_published_at: new Date("2026-08-15T15:00:00Z"), filings_30d: 0, transactions_30d: 0,
      purchases_30d_value: null, sales_30d_value: "7000.00" }),
    person("0000000300", null, { owner_name: "Carol", ticker: null, issuer_name: null, last_published_at: null, last_transaction_date: null,
      filings_30d: "0", transactions_30d: "0", purchases_30d_value: "0", sales_30d_value: "0" })
  ];
  const query = fakeQuery({
    [S.people]: { rows: people },
    [S.items]: { rows: [newest, older] },
    [BY_ID_SQL]: params => ({ rows: [bobLast].filter(row => params[0].includes(row.id)) })
  });
  let body;
  await withApi(query, async base => {
    const r = await send(base, "/v1/me/people/updates?limit=2", as("paid"));
    assert.equal(r.status, 200);
    body = r.json();
  });
  assert.deepEqual(Object.keys(body), ["people", "items", "following", "source", "disclaimer"]);
  assert.equal(body.following, 3);
  assert.equal(body.source, "SEC Form 4");
  assert.equal(body.disclaimer, DISCLAIMER);
  // Feed rows pass through unchanged (same shape as GET /v1/transactions items), in SQL order.
  assert.deepEqual(body.items, iso([newest, older]));
  assert.equal(body.items[0].published_at, "2026-10-12T15:00:00.000Z");
  assert.deepEqual(body.people.map(p => p.owner_cik), ["0000000100", "0000000200", "0000000300"], "SQL order is kept");
  assert.deepEqual(body.people[0], {
    owner_cik: "0000000100", owner_name: "Owner 0000000100", followed_at: "2026-09-01T12:00:00.000Z", ticker: "AAPL", issuer_name: "Apple Inc.",
    last_published_at: "2026-10-12T15:00:00.000Z", last_transaction_date: "2026-10-01T00:00:00.000Z", last: iso(newest),
    filings_30d: 2, transactions_30d: 5, purchases_30d_value: 1300.5, sales_30d_value: 0
  });
  assert.deepEqual(body.people[1].last, iso(bobLast), "a latest line outside the feed is fetched by id");
  assert.deepEqual([body.people[1].filings_30d, body.people[1].transactions_30d, body.people[1].purchases_30d_value, body.people[1].sales_30d_value], [0, 0, 0, 7000]);
  assert.deepEqual(body.people[2], {
    owner_cik: "0000000300", owner_name: "Carol", followed_at: "2026-09-01T12:00:00.000Z", ticker: null, issuer_name: null,
    last_published_at: null, last_transaction_date: null, last: null, filings_30d: 0, transactions_30d: 0, purchases_30d_value: 0, sales_30d_value: 0
  });
  for (const p of body.people) for (const key of ["filings_30d", "transactions_30d", "purchases_30d_value", "sales_30d_value"])
    assert.equal(typeof p[key], "number", p.owner_cik + " " + key);
  // Three fixed round trips after the table check; only the missing latest line is looked up, never one query per person.
  assert.deepEqual(query.statements.map(s => s.sql), [TABLE, S.people, S.items, BY_ID_SQL]);
  assert.deepEqual(query.statements[3].params, [[bobLast.id]]);
});

test("no by-id lookup when every latest line is already in the feed; a vanished line becomes null", async () => {
  const a = tx("000000000000000001:N:0", "0000000100", new Date("2026-10-12T15:00:00Z"));
  const b = tx("000000000000000002:N:0", "0000000200", new Date("2026-10-11T15:00:00Z"));
  let query = fakeQuery({ [S.people]: { rows: [person("0000000100", a.id, { following: "2" }), person("0000000200", b.id, { following: "2" })] }, [S.items]: { rows: [a, b] } });
  await withApi(query, async base => {
    const body = (await send(base, "/v1/me/people/updates", as("paid"))).json();
    assert.deepEqual(body.people.map(p => p.last?.id), [a.id, b.id]);
    assert.equal(body.following, 2);
  });
  assert.deepEqual(query.statements.map(s => s.sql), [TABLE, S.people, S.items]);
  // Two people sharing one missing id (cannot happen, but the lookup is de-duplicated) and a line deleted by a re-ingest.
  query = fakeQuery({ [S.people]: { rows: [person("0000000100", "gone:N:0"), person("0000000100", "gone:N:0")] } });
  await withApi(query, async base => {
    const body = (await send(base, "/v1/me/people/updates", as("paid"))).json();
    assert.deepEqual(body.people.map(p => p.last), [null, null]);
  });
  assert.deepEqual(query.of(BY_ID_SQL)[0].params, [["gone:N:0"]]);
});

test("the updates route does not shadow the existing people routes", async () => {
  const query = fakeQuery({ [S.list]: { rows: [{ owner_cik: "0000000100", created_at: new Date("2026-09-01T12:00:00Z"), owner_name: "Owner 100",
    ticker: "AAPL", last_transaction_date: new Date("2026-10-01T00:00:00Z"), last_published_at: new Date("2026-10-12T15:00:00Z") }] } });
  await withApi(query, async base => {
    // GET /v1/me/people keeps its shape (plus last_published_at), one row per person.
    let r = await send(base, "/v1/me/people", as("paid"));
    assert.equal(r.status, 200);
    assert.deepEqual(r.json(), { items: [{ owner_cik: "0000000100", created_at: "2026-09-01T12:00:00.000Z", owner_name: "Owner 100", ticker: "AAPL",
      last_transaction_date: "2026-10-01T00:00:00.000Z", last_published_at: "2026-10-12T15:00:00.000Z" }], source: "SEC Form 4" });
    assert.equal(query.statements.at(-1).sql, S.list);
    // The name falls back to the SEC entity directory for a person followed before any of their filings is imported.
    assert.match(S.list, /^WITH fp AS MATERIALIZED .* SELECT fp\.owner_cik,fp\.created_at,COALESCE\(s\.owner_name,\(SELECT e\.name FROM sec_entities e WHERE e\.cik=LPAD\(LTRIM\(fp\.owner_cik,'0'\),10,'0'\)\)\) AS owner_name,s\.ticker,s\.last_transaction_date,s\.last_published_at FROM fp /);
    assert.match(S.list, /ORDER BY fp\.created_at DESC,fp\.owner_cik LIMIT 150$/);
    assert.deepEqual(query.statements.at(-1).params, [USERS.paid.id]);
    const origin = { origin: base.replace("http:", "https:") };
    // DELETE /v1/me/people/:cik still owns DELETEs under the prefix; "updates" is not a CIK.
    r = await send(base, "/v1/me/people/updates", as("paid", { method: "DELETE", headers: origin }));
    assert.deepEqual([r.status, r.json()], [400, { error: "Invalid SEC reporting-person CIK" }]);
    r = await send(base, "/v1/me/people/1234", as("paid", { method: "DELETE", headers: origin }));
    assert.deepEqual([r.status, r.json()], [200, { deleted: true, owner_cik: "1234" }]);
    assert.equal(query.statements.at(-1).sql, FOLLOW_DELETE_SQL);
    assert.deepEqual(query.statements.at(-1).params, [USERS.paid.id, "1234"]);
    // Only GET is served on the updates path.
    r = await send(base, "/v1/me/people/updates", as("paid", { method: "POST", headers: { ...origin, "content-type": "application/json" }, body: "{}" }));
    assert.equal(r.status, 404);
    assert.equal(query.of(S.people).length, 0, "the feed never ran for a non-GET request");
  });
});

test("a database failure is a 500 with a safe message", async () => {
  const query = fakeQuery({ [S.people]: new Error("connection refused") });
  const errors = console.error;
  console.error = () => {};
  try {
    await withApi(query, async base => {
      const r = await send(base, "/v1/me/people/updates", as("paid"));
      assert.deepEqual([r.status, r.json()], [500, { error: "Internal error" }]);
    });
  } finally { console.error = errors; }
});

/* The SQL itself, on PostgreSQL: set INSIDIR_TEST_DATABASE_URL to a database this test may use. It
 * works only inside its own schema (created and dropped here), so no existing table is touched. */
const PG_URL = process.env.INSIDIR_TEST_DATABASE_URL || "";
test("on PostgreSQL: canonical follows, joint filers, and a restated line counted once like the profile counts it", { skip: PG_URL ? false : "INSIDIR_TEST_DATABASE_URL is not set" }, async () => {
  const { default: pg } = await import("pg");
  const schema = "following_test_" + process.pid;
  const pool = new pg.Pool({ connectionString: PG_URL, max: 1, options: "-c search_path=" + schema });
  const query = (sql, params = []) => pool.query(sql, params);
  const sql = file => readFile(new URL("../sql/" + file, import.meta.url), "utf8");
  try {
    await query(`CREATE SCHEMA ${schema}`);
    for (const file of ["001_initial.sql", "006_followed_people.sql", "008_filing_owners.sql", "018_coverage.sql"]) await query(await sql(file));
    const day = n => new Date(Date.now() - n * 86400000).toISOString();
    const filing = (acc, days, form, owners) => query(`INSERT INTO sec_filings(accession,filer_cik,issuer_cik,issuer_name,ticker,title,form_type,published_at,is_amendment,source_url,owner_names,ingest_status)
      VALUES($1,'1111111','0000099999','Example Corp','EXMP','4',$2,$3,$4,$5,$6,'parsed')`, [acc, form, day(days), form === "4/A", "https://www.sec.gov/Archives/edgar/data/1111111/" + acc + "/", owners]);
    const line = (acc, owner, name, tradeDaysAgo, code = "S", value = 50000) => query(`INSERT INTO sec_transactions(id,accession,issuer_cik,ticker,owner_cik,owner_name,transaction_date,transaction_code,acquired_disposed,category,derivative,shares,price_per_share,estimated_value,source_url)
      VALUES($1,$2,'0000099999','EXMP',$3,$4,$5,$6,$7,$8,false,1000,50,$9,'https://www.sec.gov/')`,
      [acc + ":N:0", acc, owner, name, day(tradeDaysAgo).slice(0, 10), code, code === "P" ? "A" : "D", code === "P" ? "reported_purchase" : "reported_sale", value]);
    // DOE JOHN: a sale filed 10 days ago and repeated line for line on a 4/A 5 days ago (one sale), plus a
    // sale first filed 40 days ago that a 4/A 3 days ago restates (outside the window: first filed then).
    await filing("000111111126000001", 10, "4", ["DOE JOHN"]); await line("000111111126000001", "0001111111", "DOE JOHN", 12);
    await filing("000111111126000002", 5, "4/A", ["DOE JOHN"]); await line("000111111126000002", "1111111", "DOE JOHN", 12);
    await filing("000111111126000003", 40, "4", ["DOE JOHN"]); await line("000111111126000003", "0001111111", "DOE JOHN", 41, "S", 70000);
    await filing("000111111126000004", 3, "4/A", ["DOE JOHN"]); await line("000111111126000004", "0001111111", "DOE JOHN", 41, "S", 70000);
    // A joint purchase by a fund and SMITH BOB, who files nothing alone.
    await filing("000222222226000001", 2, "4", ["FUND LP", "SMITH BOB"]); await line("000222222226000001", null, "FUND LP, SMITH BOB", 4, "P", 25000.5);
    for (const [cik, name] of [["0005555555", "FUND LP"], ["0004444444", "SMITH BOB"]])
      await query(`INSERT INTO sec_filing_owners(accession,owner_cik,owner_name,is_ten_percent_owner) VALUES('000222222226000001',$1,$2,true)`, [cik, name]);
    const user = (await query("INSERT INTO users(email,password_hash) VALUES('pg-follow@example.com','x') RETURNING id")).rows[0].id;
    // A legacy unpadded row for DOE JOHN, written before follows were canonical.
    await query("INSERT INTO followed_people(user_id,owner_cik,created_at) VALUES($1,'1111111',now()-interval '2 days')", [user]);

    const server = createApiServer({ env: ON, currentUser: async () => ({ ...USERS.paid, id: user }), query, quiet: true });
    await new Promise(r => server.listen(0, "127.0.0.1", r));
    const base = `http://127.0.0.1:${server.address().port}`;
    try {
      // Following DOE JOHN again in the padded form is the same follow; SMITH BOB (joint only) can be followed.
      assert.deepEqual((await follow(base, "paid", "0001111111")).json(), { saved: true, owner_cik: "1111111" });
      assert.deepEqual((await follow(base, "paid", "4444444")).json(), { saved: true, owner_cik: "0004444444" });
      assert.equal((await follow(base, "paid", "9999999")).status, 404);
      assert.deepEqual((await query("SELECT owner_cik FROM followed_people WHERE user_id=$1 ORDER BY 1", [user])).rows.map(r => r.owner_cik), ["0004444444", "1111111"]);

      const feed = (await send(base, "/v1/me/people/updates", as("paid"))).json();
      assert.equal(feed.following, 2);
      const doe = feed.people.find(p => p.owner_cik === "0001111111"), bob = feed.people.find(p => p.owner_cik === "0004444444");
      assert.deepEqual([doe.owner_name, doe.transactions_30d, doe.sales_30d_value, doe.filings_30d], ["DOE JOHN", 1, 50000, 3],
        "one sale in the window: its 4/A copy is the same line; the old trade restated on a 4/A keeps its first filing date");
      assert.deepEqual([bob.owner_name, bob.ticker, bob.transactions_30d, bob.purchases_30d_value, bob.last.id], ["SMITH BOB", "EXMP", 1, 25000.5, "000222222226000001:N:0"]);
      assert.deepEqual(bob.last.owners, [{ cik: "0005555555", name: "FUND LP" }, { cik: "0004444444", name: "SMITH BOB" }]);
      assert.equal(feed.items.length, 5, "every line, each once");
      // The profile counts DOE JOHN's last 30 days the same way.
      const profile = await personProfile("1111111", { query, fetcher: async () => { throw new Error("offline"); }, ownerIssuers: async () => [], tickerIndex: null });
      assert.deepEqual([profile.totals.d30.transactions, profile.totals.d30.sales.value], [doe.transactions_30d, doe.sales_30d_value]);
      const bobProfile = await personProfile("4444444", { query, fetcher: async () => { throw new Error("offline"); }, ownerIssuers: async () => [], tickerIndex: null });
      assert.deepEqual([bobProfile.totals.d30.transactions, bobProfile.totals.d30.purchases.value, bobProfile.companies[0].roles], [1, 25000.5, ["10% owner"]]);

      const list = (await send(base, "/v1/me/people", as("paid"))).json().items;
      assert.deepEqual(list.map(p => [p.owner_cik, p.owner_name]), [["0004444444", "SMITH BOB"], ["0001111111", "DOE JOHN"]]);
      // Unfollowing by the padded form removes the legacy row too.
      const origin = { origin: base.replace("http:", "https:") };
      assert.equal((await send(base, "/v1/me/people/0001111111", as("paid", { method: "DELETE", headers: origin }))).status, 200);
      assert.deepEqual((await query("SELECT owner_cik FROM followed_people WHERE user_id=$1", [user])).rows.map(r => r.owner_cik), ["0004444444"]);
    } finally { server.close(); }
  } finally {
    await query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    await pool.end();
  }
});
