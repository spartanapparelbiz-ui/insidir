import test from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { createApiServer } from "../src/api.mjs";
import { classifyApi } from "../src/paywall.mjs";

/* GET /v1/me/people/updates: the "People you follow" feed on the signed-in home page.
 * The router runs with a stubbed session loader and an injected query(sql, params). */

const ON = {}; // paywall on (the default)
const USERS = {
  paid: { id: "11111111-1111-4111-8111-111111111111", email: "paid@example.com", subscription_status: "active", current_period_end: null },
  other: { id: "66666666-6666-4666-8666-666666666666", email: "other@example.com", subscription_status: "trialing", current_period_end: null },
  lapsed: { id: "33333333-3333-4333-8333-333333333333", email: "lapsed@example.com", subscription_status: "past_due", current_period_end: null },
  none: { id: "44444444-4444-4444-8444-444444444444", email: "new@example.com", subscription_status: null, current_period_end: null },
  burst: { id: "77777777-7777-4777-8777-777777777777", email: "burst@example.com", subscription_status: "active", current_period_end: null }
};
// The follow set every feed query starts from: at most the 150 newest follows, read before any per-person join.
const FOLLOW_SET = "(SELECT owner_cik,created_at FROM followed_people WHERE user_id=$1 ORDER BY created_at DESC LIMIT 150) fp";
const PEOPLE_SQL = "SELECT fp.owner_cik,fp.created_at AS followed_at";
const ITEMS_SQL = "SELECT t.*,f.issuer_name,f.published_at,f.is_amendment FROM " + FOLLOW_SET;
const FOLLOW_INSERT = "INSERT INTO followed_people(user_id,owner_cik)";
const BY_ID_SQL = "SELECT t.*,f.issuer_name,f.published_at,f.is_amendment FROM sec_transactions t";
const LIST_SQL = "SELECT fp.owner_cik,fp.created_at, (SELECT owner_name";
const DISCLAIMER = "Reported purchases and sales are not recommendations or predictive signals.";

// Same style as fakeQuery in paywall.test.mjs: answers by SQL prefix and records every statement.
function fakeQuery(rows = {}) {
  const fn = async (sql, params) => {
    const text = sql.replace(/\s+/g, " ").trim();
    fn.statements.push({ sql: text, params });
    for (const [prefix, result] of Object.entries(rows)) if (text.startsWith(prefix)) return typeof result === "function" ? result(params) : result;
    return { rows: [], rowCount: 0 };
  };
  fn.statements = [];
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

test("following nobody answers 200 with an empty feed after one query", async () => {
  const query = fakeQuery();
  await withApi(query, async base => {
    const r = await send(base, "/v1/me/people/updates", as("paid"));
    assert.equal(r.status, 200);
    assert.deepEqual(r.json(), { people: [], items: [], following: 0, source: "SEC Form 4", disclaimer: DISCLAIMER });
    assert.equal(r.headers["cache-control"], "no-store");
    assert.match(r.headers.vary, /\bCookie\b/);
  });
  assert.equal(query.statements.length, 1);
  assert.ok(query.statements[0].sql.startsWith(PEOPLE_SQL));
  assert.deepEqual(query.statements[0].params, [USERS.paid.id]);
});

test("limit: default 40, clamped to 1..100, garbage falls back to the default (the /v1 convention)", async () => {
  const query = fakeQuery({ [PEOPLE_SQL]: { rows: [person("100", null)] } });
  const cases = [["", 40], ["?limit=", 40], ["?limit=25", 25], ["?limit=100", 100], ["?limit=101", 100], ["?limit=100000", 100],
    ["?limit=0", 1], ["?limit=-5", 1], ["?limit=abc", 40], ["?limit=2.5", 40], ["?limit=1e1", 10], ["?limit=%20", 40]];
  await withApi(query, async base => {
    for (const [search, expected] of cases) {
      query.statements.length = 0;
      const r = await send(base, "/v1/me/people/updates" + search, as("paid"));
      assert.equal(r.status, 200, search);
      const items = query.statements.find(s => s.sql.startsWith(ITEMS_SQL));
      assert.deepEqual(items.params, [USERS.paid.id, expected], search);
    }
  });
});

test("SQL is parameterised, scoped to the signed-in user and ordered most recent first", async () => {
  const query = fakeQuery({ [PEOPLE_SQL]: { rows: [person("100", null)] } });
  await withApi(query, async base => {
    assert.equal((await send(base, "/v1/me/people/updates?limit=7", as("paid"))).status, 200);
    assert.equal((await send(base, "/v1/me/people/updates?limit=7", as("other"))).status, 200);
  });
  const [peopleA, itemsA, peopleB, itemsB] = query.statements;
  for (const s of [peopleA, peopleB]) {
    assert.ok(s.sql.startsWith(PEOPLE_SQL));
    assert.ok(s.sql.includes(" FROM " + FOLLOW_SET + " LEFT JOIN LATERAL ("), s.sql);
    assert.match(s.sql, /\) s ON true ORDER BY s\.last_published_at DESC NULLS LAST,fp\.created_at DESC,fp\.owner_cik LIMIT 150$/);
    // Latest line per person: same ordering as the feed, via LATERAL ... LIMIT 1.
    assert.match(s.sql, /WHERE t\.owner_cik=fp\.owner_cik AND f\.ingest_status='parsed' ORDER BY f\.published_at DESC NULLS LAST,t\.transaction_date DESC NULLS LAST,t\.id DESC LIMIT 1\) l ON true/);
    assert.match(s.sql, /COUNT\(DISTINCT t\.accession\) FILTER \(WHERE f\.published_at>=now\(\)-interval '30 days'\)\)::integer AS filings_30d/);
    assert.match(s.sql, /SUM\(t\.estimated_value\) FILTER \(WHERE t\.category='reported_purchase' AND f\.published_at>=now\(\)-interval '30 days'\)/);
    assert.match(s.sql, /SUM\(t\.estimated_value\) FILTER \(WHERE t\.category='reported_sale' AND f\.published_at>=now\(\)-interval '30 days'\)/);
  }
  for (const s of [itemsA, itemsB]) {
    assert.ok(s.sql.startsWith(ITEMS_SQL));
    assert.match(s.sql, /JOIN sec_transactions t ON t\.owner_cik=fp\.owner_cik JOIN sec_filings f ON f\.accession=t\.accession WHERE f\.ingest_status='parsed' ORDER BY f\.published_at DESC NULLS LAST,t\.transaction_date DESC NULLS LAST,t\.id DESC LIMIT \$2$/);
  }
  assert.deepEqual(peopleA.params, [USERS.paid.id]);
  assert.deepEqual(itemsA.params, [USERS.paid.id, 7]);
  assert.deepEqual(peopleB.params, [USERS.other.id]);
  assert.deepEqual(itemsB.params, [USERS.other.id, 7]);
  for (const s of query.statements) assert.doesNotMatch(s.sql, /11111111|66666666/, "user ids are bound, never interpolated");
});

test("feed work is bounded: both queries pre-limit the follow set before any per-person join", async () => {
  const query = fakeQuery({ [PEOPLE_SQL]: { rows: [person("100", null)] } });
  await withApi(query, async base => assert.equal((await send(base, "/v1/me/people/updates", as("paid"))).status, 200));
  const [people, items] = query.statements;
  for (const s of [people, items]) {
    // Every read of followed_people is either the bounded, index-ordered follow set or the
    // follow count; nothing joins or aggregates over an unbounded follow list.
    const reads = s.sql.match(/followed_people[^)]*\)/g);
    for (const read of reads) assert.ok(FOLLOW_SET.includes(read) || read === "followed_people WHERE user_id=$1)", read);
    assert.equal(s.sql.split(FOLLOW_SET).length, 2, "the follow set is read exactly once");
    // The bounded set comes before the joins that cost per person.
    assert.ok(s.sql.indexOf(FOLLOW_SET) < s.sql.search(/ JOIN /));
    assert.doesNotMatch(s.sql, /FROM followed_people fp\b/);
  }
  // "following" still counts every follow, not just the 150 shown.
  assert.match(people.sql, /^SELECT fp\.owner_cik,fp\.created_at AS followed_at, \(SELECT count\(\*\) FROM followed_people WHERE user_id=\$1\)::integer AS following,/);
  assert.equal(people.sql.split("followed_people").length - 1, 2);
  assert.equal(items.sql.split("followed_people").length - 1, 1);
});

test("POST /v1/me/people caps the follow set at 150 like manual holdings cap theirs", async () => {
  let inserted = 1;
  const query = fakeQuery({
    "SELECT 1 FROM sec_transactions WHERE owner_cik=$1 LIMIT 1": { rows: [{ "?column?": 1 }], rowCount: 1 },
    [FOLLOW_INSERT]: params => ({ rows: inserted ? [{ owner_cik: params[1] }] : [], rowCount: inserted })
  });
  const follow = (base, cik) => send(base, "/v1/me/people", as("paid", { method: "POST",
    headers: { origin: base.replace("http:", "https:"), "content-type": "application/json" }, body: JSON.stringify({ owner_cik: cik }) }));
  await withApi(query, async base => {
    let r = await follow(base, " 0001234 ");
    assert.deepEqual([r.status, r.json()], [200, { saved: true, owner_cik: "0001234" }]);
    const insert = query.statements.at(-1);
    assert.equal(insert.sql, "INSERT INTO followed_people(user_id,owner_cik) SELECT $1,$2 WHERE"
      + " (SELECT count(*) FROM followed_people WHERE user_id=$1)<150"
      + " OR EXISTS(SELECT 1 FROM followed_people WHERE user_id=$1 AND owner_cik=$2)"
      + " ON CONFLICT(user_id,owner_cik) DO UPDATE SET created_at=followed_people.created_at RETURNING owner_cik");
    assert.deepEqual(insert.params, [USERS.paid.id, "0001234"]);
    // At the cap the guarded insert returns nothing: 409, and the web client shows the message.
    inserted = 0;
    r = await follow(base, "5678");
    assert.deepEqual([r.status, r.json()], [409, { error: "150 people maximum; unfollow someone first" }]);
    // Validation and the existence check still run first.
    const before = query.statements.length;
    r = await follow(base, "12a");
    assert.deepEqual([r.status, r.json()], [400, { error: "Valid reporting-person SEC CIK required" }]);
    assert.equal(query.statements.length, before);
  });
  const missing = fakeQuery();
  await withApi(missing, async base => {
    const r = await follow(base, "999");
    assert.deepEqual([r.status, r.json()], [404, { error: "Reporting person not found in imported SEC records" }]);
  });
  assert.ok(!missing.statements.some(s => s.sql.startsWith(FOLLOW_INSERT)), "an unknown CIK is never inserted");
});

test("POST /v1/me/people is rate limited per member (60 per 15 minutes) before touching the database", async () => {
  const query = fakeQuery({
    "SELECT 1 FROM sec_transactions WHERE owner_cik=$1 LIMIT 1": { rows: [{}], rowCount: 1 },
    [FOLLOW_INSERT]: params => ({ rows: [{ owner_cik: params[1] }], rowCount: 1 })
  });
  const post = (base, sid, body) => send(base, "/v1/me/people", as(sid, { method: "POST",
    headers: { origin: base.replace("http:", "https:"), "content-type": "application/json" }, body }));
  await withApi(query, async base => {
    // Rejected attempts count too, so probing for CIKs is bounded as well.
    for (let i = 0; i < 60; i++) assert.equal((await post(base, "burst", i % 2 ? '{"owner_cik":"x"}' : JSON.stringify({ owner_cik: String(1000 + i) }))).status, i % 2 ? 400 : 200, "attempt " + i);
    const before = query.statements.length;
    const r = await post(base, "burst", JSON.stringify({ owner_cik: "4242" }));
    assert.deepEqual([r.status, r.json()], [429, { error: "Too many follow updates" }]);
    assert.equal(query.statements.length, before, "a limited request never reaches the database");
    // Unfollowing, reading the feed and another member's follows are unaffected.
    const origin = { origin: base.replace("http:", "https:") };
    assert.equal((await send(base, "/v1/me/people/1000", as("burst", { method: "DELETE", headers: origin }))).status, 200);
    assert.equal((await send(base, "/v1/me/people/updates", as("burst"))).status, 200);
    assert.equal((await post(base, "other", JSON.stringify({ owner_cik: "4242" }))).status, 200);
  });
});

test("response shape: numbers are numbers, dates ISO strings, rows like /v1/transactions, latest line per person", async () => {
  const newest = tx("000000000000000001:N:1", "100", new Date("2026-10-12T15:00:00Z"), { category: "reported_sale", estimated_value: "200.25" });
  const older = tx("000000000000000002:N:0", "100", new Date("2026-10-04T15:00:00Z"));
  const bobLast = tx("000000000000000003:N:1", "200", new Date("2026-08-15T15:00:00Z"));
  const people = [
    person("100", newest.id),
    person("200", bobLast.id, { following: 3, last_published_at: new Date("2026-08-15T15:00:00Z"), filings_30d: 0, transactions_30d: 0,
      purchases_30d_value: null, sales_30d_value: "7000.00" }),
    person("300", null, { owner_name: "Carol", ticker: null, issuer_name: null, last_published_at: null, last_transaction_date: null,
      filings_30d: "0", transactions_30d: "0", purchases_30d_value: "0", sales_30d_value: "0" })
  ];
  const query = fakeQuery({
    [PEOPLE_SQL]: { rows: people },
    [ITEMS_SQL]: { rows: [newest, older] },
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
  assert.deepEqual(body.people.map(p => p.owner_cik), ["100", "200", "300"], "SQL order is kept");
  assert.deepEqual(body.people[0], {
    owner_cik: "100", owner_name: "Owner 100", followed_at: "2026-09-01T12:00:00.000Z", ticker: "AAPL", issuer_name: "Apple Inc.",
    last_published_at: "2026-10-12T15:00:00.000Z", last_transaction_date: "2026-10-01T00:00:00.000Z", last: iso(newest),
    filings_30d: 2, transactions_30d: 5, purchases_30d_value: 1300.5, sales_30d_value: 0
  });
  assert.deepEqual(body.people[1].last, iso(bobLast), "a latest line outside the feed is fetched by id");
  assert.deepEqual([body.people[1].filings_30d, body.people[1].transactions_30d, body.people[1].purchases_30d_value, body.people[1].sales_30d_value], [0, 0, 0, 7000]);
  assert.deepEqual(body.people[2], {
    owner_cik: "300", owner_name: "Carol", followed_at: "2026-09-01T12:00:00.000Z", ticker: null, issuer_name: null,
    last_published_at: null, last_transaction_date: null, last: null, filings_30d: 0, transactions_30d: 0, purchases_30d_value: 0, sales_30d_value: 0
  });
  for (const p of body.people) for (const key of ["filings_30d", "transactions_30d", "purchases_30d_value", "sales_30d_value"])
    assert.equal(typeof p[key], "number", p.owner_cik + " " + key);
  // Three fixed round trips; only the missing latest line is looked up, never one query per person.
  assert.equal(query.statements.length, 3);
  const byId = query.statements[2];
  assert.ok(byId.sql.startsWith(BY_ID_SQL));
  assert.match(byId.sql, /WHERE t\.id=ANY\(\$1::text\[\]\)$/);
  assert.deepEqual(byId.params, [[bobLast.id]]);
});

test("no by-id lookup when every latest line is already in the feed; a vanished line becomes null", async () => {
  const a = tx("000000000000000001:N:0", "100", new Date("2026-10-12T15:00:00Z"));
  const b = tx("000000000000000002:N:0", "200", new Date("2026-10-11T15:00:00Z"));
  let query = fakeQuery({ [PEOPLE_SQL]: { rows: [person("100", a.id, { following: "2" }), person("200", b.id, { following: "2" })] }, [ITEMS_SQL]: { rows: [a, b] } });
  await withApi(query, async base => {
    const body = (await send(base, "/v1/me/people/updates", as("paid"))).json();
    assert.deepEqual(body.people.map(p => p.last?.id), [a.id, b.id]);
    assert.equal(body.following, 2);
  });
  assert.equal(query.statements.length, 2);
  // Two people sharing one missing id (cannot happen, but the lookup is de-duplicated) and a line deleted by a re-ingest.
  query = fakeQuery({ [PEOPLE_SQL]: { rows: [person("100", "gone:N:0"), person("100", "gone:N:0")] } });
  await withApi(query, async base => {
    const body = (await send(base, "/v1/me/people/updates", as("paid"))).json();
    assert.deepEqual(body.people.map(p => p.last), [null, null]);
  });
  assert.deepEqual(query.statements[2].params, [["gone:N:0"]]);
});

test("the updates route does not shadow the existing people routes", async () => {
  const query = fakeQuery({ [LIST_SQL]: { rows: [{ owner_cik: "100", created_at: new Date("2026-09-01T12:00:00Z"), owner_name: "Owner 100",
    ticker: "AAPL", last_transaction_date: new Date("2026-10-01T00:00:00Z"), last_published_at: new Date("2026-10-12T15:00:00Z") }] } });
  await withApi(query, async base => {
    // GET /v1/me/people keeps its shape (plus last_published_at).
    let r = await send(base, "/v1/me/people", as("paid"));
    assert.equal(r.status, 200);
    assert.deepEqual(r.json(), { items: [{ owner_cik: "100", created_at: "2026-09-01T12:00:00.000Z", owner_name: "Owner 100", ticker: "AAPL",
      last_transaction_date: "2026-10-01T00:00:00.000Z", last_published_at: "2026-10-12T15:00:00.000Z" }], source: "SEC Form 4" });
    assert.ok(query.statements.at(-1).sql.startsWith(LIST_SQL));
    assert.match(query.statements.at(-1).sql, /AS last_published_at FROM followed_people fp WHERE fp\.user_id=\$1 ORDER BY fp\.created_at DESC LIMIT 150$/);
    assert.deepEqual(query.statements.at(-1).params, [USERS.paid.id]);
    const origin = { origin: base.replace("http:", "https:") };
    // DELETE /v1/me/people/:cik still owns DELETEs under the prefix; "updates" is not a CIK.
    r = await send(base, "/v1/me/people/updates", as("paid", { method: "DELETE", headers: origin }));
    assert.deepEqual([r.status, r.json()], [400, { error: "Invalid SEC reporting-person CIK" }]);
    r = await send(base, "/v1/me/people/1234", as("paid", { method: "DELETE", headers: origin }));
    assert.deepEqual([r.status, r.json()], [200, { deleted: true, owner_cik: "1234" }]);
    assert.equal(query.statements.at(-1).sql, "DELETE FROM followed_people WHERE user_id=$1 AND owner_cik=$2");
    assert.deepEqual(query.statements.at(-1).params, [USERS.paid.id, "1234"]);
    // Only GET is served on the updates path.
    r = await send(base, "/v1/me/people/updates", as("paid", { method: "POST", headers: { ...origin, "content-type": "application/json" }, body: "{}" }));
    assert.equal(r.status, 404);
    assert.ok(!query.statements.some(s => s.sql.startsWith(PEOPLE_SQL)), "the feed never ran for a non-GET request");
  });
});

test("a database failure is a 500 with a safe message", async () => {
  const query = fakeQuery({ [PEOPLE_SQL]: new Error("connection refused") });
  const failing = async (sql, params) => { const r = await query(sql, params); if (r instanceof Error) throw r; return r; };
  failing.statements = query.statements;
  const errors = console.error;
  console.error = () => {};
  try {
    await withApi(failing, async base => {
      const r = await send(base, "/v1/me/people/updates", as("paid"));
      assert.deepEqual([r.status, r.json()], [500, { error: "Internal error" }]);
    });
  } finally { console.error = errors; }
});
