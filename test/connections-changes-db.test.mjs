/* Insidir Connections, Changes and Autopilot on PostgreSQL, from real SEC Form 4 filings (test/fixtures/form4/,
 * the same documents test/form4-accuracy.test.mjs reads by hand). Runs only with INSIDIR_TEST_DATABASE_URL, inside a
 * throwaway schema dropped at the end. No network: EDGAR company facts and submissions are replaced by stubs.
 *
 * Two records are derived from a real filing for the test and say so: a later Form 4 by the same owner with a
 * different filed role (to detect a role change) and a copy with a transaction dated after its filing (to show a
 * flagged record is left out). Everything else is the filing as the SEC published it. */
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";

const PG_URL = process.env.INSIDIR_TEST_DATABASE_URL || "";
const SCHEMA = "cc_test_" + process.pid;
const skip = !PG_URL && "set INSIDIR_TEST_DATABASE_URL";
if (PG_URL) {
  process.env.DATABASE_URL = PG_URL + (PG_URL.includes("?") ? "&" : "?") + "options=" + encodeURIComponent("-c search_path=" + SCHEMA + ",public");
  process.env.ALLOWED_ORIGINS = "https://insidir.test";
  process.env.COOKIE_SECURE = "0";
}
const sha = s => createHash("sha256").update(s).digest("hex");
const hoursAgo = h => new Date(Date.now() - h * 3600_000).toISOString();
const offline = async () => { throw new Error("offline"); };

test("Connections, Changes and Autopilot on PostgreSQL", { skip }, async t => {
  const admin = new pg.Client({ connectionString: PG_URL });
  await admin.connect();
  await admin.query("CREATE SCHEMA IF NOT EXISTS " + SCHEMA);
  let server;
  t.after(async () => {
    if (server) await new Promise(r => server.close(r));
    const db = await import("../src/db.mjs"); await db.pool.end().catch(() => {});
    await admin.query("DROP SCHEMA IF EXISTS " + SCHEMA + " CASCADE"); await admin.end();
  });
  const db = await import("../src/db.mjs");
  await db.migrate();
  const q = (sql, p) => db.query(sql, p);
  const { parseOwnership } = await import("../src/sec.mjs");
  const { connections } = await import("../src/connections.mjs");
  const { changes } = await import("../src/changes.mjs");
  const { buildResearchEvents } = await import("../src/research-events.mjs");
  const { fanOut, isImportant } = await import("../src/notifications.mjs");

  const parse = (acc, published, overrides = {}) => ({ ...parseOwnership(readFileSync(new URL("./fixtures/form4/" + acc + ".xml", import.meta.url), "utf8"),
    { accession: acc, filerCik: "1", sourceUrl: "https://www.sec.gov/Archives/edgar/data/1/" + acc + "/x-index.htm", title: "4", formType: "4", publishedAt: published }), ...overrides });
  // Published within the alert window (fan-out only alerts on filings from the last three days).
  for (const [acc, h] of [["000007085826000486", 30], ["000070686326000085", 26], ["000090445426000519", 20], ["000207570426000038", 18]]) await db.persistFiling(parse(acc, hoursAgo(h)));
  // Derived: a later Form 4 by the same UNB owner, filed as an officer instead of a director.
  const unb = parse("000070686326000085", hoursAgo(10));
  await db.persistFiling({ ...unb, accession: "000070686326000999", sourceUrl: "https://www.sec.gov/Archives/edgar/data/1/000070686326000999/x-index.htm",
    owners: unb.owners.map(o => ({ ...o, isDirector: false, isOfficer: true, officerTitle: "Chief Executive Officer" })),
    transactions: unb.transactions.map(x => ({ ...x, id: x.id.replace("000070686326000085", "000070686326000999"), accession: "000070686326000999" })) });
  // Derived: a copy dated after its filing, which validation flags.
  const bad = parse("000090445426000519", hoursAgo(5));
  await db.persistFiling({ ...bad, accession: "000090445426000998", sourceUrl: "https://www.sec.gov/Archives/edgar/data/1/000090445426000998/x-index.htm",
    transactions: bad.transactions.map(x => ({ ...x, id: x.id.replace("000090445426000519", "000090445426000998"), accession: "000090445426000998", transactionDate: "2099-01-01" })) });
  assert.equal((await q("SELECT validation_status FROM sec_filings WHERE accession='000090445426000998'")).rows[0].validation_status, "flagged");

  await t.test("connections: a joint filing gives both owners an edge to the issuer and to each other, with SEC evidence", async () => {
    const c = await connections("1140411", { run: q });
    assert.equal(c.subject.id, "0001140411"); assert.equal(c.subject.kind, "company");
    const reports = c.edges.filter(e => e.type === "reports_at");
    assert.deepEqual(reports.map(e => e.from).sort(), ["0000070858", "0000728612"]);
    assert.ok(reports.every(e => e.to === "0001140411" && e.filings === 1 && e.evidence.length >= 1 && e.evidence.every(x => /^https:\/\/www\.sec\.gov\//.test(x.url))));
    const joint = c.edges.filter(e => e.type === "filed_jointly");
    assert.equal(joint.length, 1, "one edge per pair"); assert.deepEqual([joint[0].from, joint[0].to].sort(), ["0000070858", "0000728612"]);
    assert.ok(c.nodes.find(n => n.id === "0000070858").kind === "organization", "BANK OF AMERICA CORP is not a person");
    const owner = await connections("70858", { run: q });
    assert.equal(owner.subject.id, "0000070858");
    assert.deepEqual(owner.edges.map(e => e.type + ":" + e.to).sort(), ["filed_jointly:0000728612", "reports_at:0001140411"]);
    // As of a date before any filing: nothing recorded yet.
    const before = await connections("1140411", { run: q, asOf: "2020-01-01" });
    assert.equal(before.edges.length, 0); assert.ok(before.gaps.some(g => /on or before 2020-01-01/.test(g)));
    await assert.rejects(connections("999999999", { run: q }), e => e.status === 404);
    await assert.rejects(connections("x", { run: q }), e => e.status === 400);
  });

  await t.test("changes: Form 4 described as filed, role change detected, flagged filing left out, amendment named", async () => {
    const c = await changes("706863", { run: q, days: 30, factChanges: async () => [], loadCompany: offline });
    const f4 = c.items.filter(i => i.kind === "form4");
    assert.equal(f4.length, 2);
    const original = f4.find(i => i.accession === "000070686326000085");
    // 418 shares × $23.725 = $9,917.05 (test/form4-accuracy.test.mjs, read by hand from the XML).
    assert.match(original.detail, /purchase: 418 shares, \$9,917\.05 as filed/);
    // The plain layer first: a headline and a sentence with the same figures, the filing's terms kept in detail.
    assert.equal(original.headline, "Insider share purchase disclosed");
    assert.match(original.summary, /bought 418 shares of .+ at \$23\.725 a share, \$9,917\.05 as filed\. Traded Sep 17, 2026, filed Oct 19, 2026\./, "the price as filed, not rounded to the cent");
    assert.ok(Array.isArray(original.footnotes));
    assert.ok(original.evidence.some(e => e.field === "nonDerivativeTransaction/transactionShares" && e.value === 418 && e.units === "shares" && e.period.end === "2026-09-17"));
    const role = c.items.find(i => i.kind === "role_change");
    assert.ok(role, "role change found"); assert.match(role.detail, /From Director to Officer: Chief Executive Officer/);
    assert.equal(role.headline, "Insider role changed"); assert.match(role.summary, /now files as Officer: Chief Executive Officer .+ previous filing there said Director/);
    assert.equal(role.evidence.length, 2);
    const ter = await changes("97210", { run: q, days: 30, factChanges: async () => [], loadCompany: offline });
    assert.deepEqual(ter.items.filter(i => i.kind === "form4").map(i => i.accession), ["000090445426000519"], "the flagged copy is not a change");
    assert.ok(ter.gaps.some(g => /1 filing\(s\) in this window failed/.test(g)));
    const dbx = await changes("1467623", { run: q, days: 30, factChanges: async () => [], loadCompany: offline });
    assert.equal(dbx.items[0].kind, "form4_amendment"); assert.match(dbx.items[0].title, /amended a Form 4 first filed on 2026-09-17/);
    assert.match(dbx.items[0].headline, /\(amended filing\)$/); assert.match(dbx.items[0].summary, /This amends an earlier filing made Sep 17, 2026\./);
    // Financial facts come from the stub here; the comparison itself is tested on Apple's facts (xbrl-accuracy).
    const withFacts = await changes("706863", { run: q, days: 30, loadCompany: offline, factChanges: async () => [{ id: "revenue", label: "Revenue", unit: "USD", concept: "us-gaap:Revenues",
      current: { value: 10, start: "2026-04-01", end: "2026-06-30", periodType: "quarter", form: "10-Q", filedAt: "2026-08-01", accession: "a", sourceUrl: "https://www.sec.gov/Archives/edgar/data/706863/a/" },
      prior: { value: 8, start: "2025-04-01", end: "2025-06-30", periodType: "quarter", form: "10-Q", filedAt: "2025-08-01", accession: "b", sourceUrl: "https://www.sec.gov/Archives/edgar/data/706863/b/" },
      change: 2, changePct: 0.25, methodology: "m" }] });
    const fact = withFacts.items.find(i => i.kind === "financial_fact");
    assert.match(fact.title, /Revenue for the quarter ended Jun 30, 2026: \$10/); assert.match(fact.detail, /up \$2, 25\.0%/);
    assert.equal(fact.headline, "Revenue 25.0% higher than a year earlier");
    assert.match(fact.summary, /^Revenue: \$10 for the quarter ended Jun 30, 2026, against \$8 a year earlier, as reported in the company's 10-Q filed Aug 1, 2026\.$/);
    assert.equal(fact.evidence[0].units, "USD"); assert.equal(fact.evidence[0].period.type, "quarter");
  });

  // Members and sessions for the routes.
  const users = {};
  for (const name of ["a", "b"]) {
    const token = randomBytes(32).toString("hex");
    const id = (await q("INSERT INTO users(email,password_hash,subscription_status,current_period_end) VALUES($1,'x','active',now()+interval '20 days') RETURNING id", [name + "@cc.test"])).rows[0].id;
    await q("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')", [sha(token), id]);
    users[name] = { id, cookie: "insidir_sid=" + token };
  }
  const { createApiServer } = await import("../src/api.mjs");
  server = createApiServer({ quiet: true, env: { ...process.env, INSIDIR_PAYWALL: "1" } });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const call = (path, who, method = "GET", payload) => fetch(base + path, { method, headers: { ...(who ? { cookie: users[who].cookie } : {}), Origin: "https://insidir.test", "Content-Type": "application/json" }, body: payload ? JSON.stringify(payload) : undefined });

  await t.test("routes: connections and changes need a member; they answer with evidence", async () => {
    assert.equal((await call("/v1/entities/1140411/connections")).status, 401);
    const c = await (await call("/v1/entities/1140411/connections", "a")).json();
    assert.equal(c.edges.filter(e => e.type === "filed_jointly").length, 1);
    const ch = await call("/v1/entities/706863/changes?days=30", "a");
    assert.equal(ch.status, 200);
    assert.ok((await ch.json()).items.some(i => i.kind === "role_change"));
  });

  await t.test("autopilot: one-click follow with a mode, important vs all, daily batching, off and pause, no duplicates", async () => {
    // Member a: UNB important (a purchase: important), TER important (an $273,024 sale: not important), DBX daily, PCQ paused.
    for (const [ticker, mode] of [["UNB", "important"], ["TER", "important"], ["DBX", "daily"], ["PCQ", "all"]])
      assert.equal((await call("/v1/me/watchlist", "a", "POST", { ticker, mode })).status, 200);
    assert.equal((await call("/v1/me/follows/settings", "a", "POST", { kind: "company", id: "PCQ", paused: true })).status, 200);
    assert.equal((await call("/v1/me/follows/settings", "a", "POST", { kind: "company", id: "PCQ", mode: "sometimes" })).status, 400);
    assert.equal((await call("/v1/me/follows/settings", "b", "POST", { kind: "company", id: "UNB", mode: "all" })).status, 404, "only your own follows");
    // Member b follows the BofA reporting person on 'off' and TER on 'all' (the column default, as before Autopilot).
    assert.equal((await call("/v1/me/people", "b", "POST", { owner_cik: "70858", mode: "off" })).status, 200);
    assert.equal((await call("/v1/me/watchlist", "b", "POST", { ticker: "TER" })).status, 200);
    // Alerts go only to follows that existed when the filing was published (src/notifications.mjs), so these
    // follows are dated before the fixtures' publication times.
    await q("UPDATE watchlist SET created_at=now()-interval '5 days'"); await q("UPDATE followed_people SET created_at=now()-interval '5 days'");
    const follows = await (await call("/v1/me/follows", "a")).json();
    assert.deepEqual(follows.items.map(f => [f.id, f.mode, f.paused]).sort(), [["DBX", "daily", false], ["PCQ", "all", true], ["TER", "important", false], ["UNB", "important", false]]);

    await buildResearchEvents({ query: q });
    const events = (await q("SELECT id,event_type,ticker,facts FROM sec_events WHERE status='active' ORDER BY id")).rows;
    assert.ok(events.some(e => e.ticker === "UNB" && isImportant(e)) && events.some(e => e.ticker === "TER" && e.event_type === "insider_sale" && !isImportant(e)));
    await q("INSERT INTO research_cursors(name,position,last_key) VALUES('notifications',now(),'0') ON CONFLICT (name) DO UPDATE SET last_key='0'");
    await fanOut({ query: q, limit: 1000 });
    const rows = async who => (await q("SELECT e.ticker,n.delivery,n.available_at>now() AS later FROM notifications n JOIN sec_events e ON e.id=n.event_id WHERE n.user_id=$1 ORDER BY e.ticker", [users[who].id])).rows;
    const a = await rows("a");
    assert.ok(a.some(r => r.ticker === "UNB" && r.delivery === "immediate" && !r.later), "an important update arrives right away");
    assert.ok(!a.some(r => r.ticker === "TER"), "a sale under $1,000,000 is not an important update");
    assert.ok(!a.some(r => r.ticker === "PCQ"), "a paused follow sends nothing");
    assert.ok(a.filter(r => r.ticker === "DBX").every(r => r.delivery === "daily" && r.later) && a.some(r => r.ticker === "DBX"), "daily: held for the next delivery");
    const listed = await (await call("/v1/me/notifications", "a")).json();
    assert.ok(listed.items.every(i => i.event.ticker !== "DBX"), "a batched alert is not shown before its delivery time");
    assert.equal(listed.unread, a.filter(r => !r.later).length);
    const b = await rows("b");
    assert.ok(b.some(r => r.ticker === "TER"), "'all' (the default for follows made without a mode) alerts on every event");
    assert.ok(!b.some(r => r.ticker === "PCQ"), "a person followed on 'off' sends nothing");
    // Replaying the same events (a restart, a re-run) creates no duplicates.
    const before = (await q("SELECT count(*)::integer AS n FROM notifications")).rows[0].n;
    await q("UPDATE research_cursors SET last_key='0' WHERE name='notifications'");
    await fanOut({ query: q, limit: 1000 });
    assert.equal((await q("SELECT count(*)::integer AS n FROM notifications")).rows[0].n, before);
    // Switching TER to 'all' and resuming PCQ: the next run alerts on them, once.
    await call("/v1/me/follows/settings", "a", "POST", { kind: "company", id: "TER", mode: "all" });
    await call("/v1/me/follows/settings", "a", "POST", { kind: "company", id: "PCQ", paused: false });
    await q("UPDATE research_cursors SET last_key='0' WHERE name='notifications'");
    await fanOut({ query: q, limit: 1000 });
    const a2 = await rows("a");
    assert.ok(a2.some(r => r.ticker === "TER") && a2.some(r => r.ticker === "PCQ"));
    // Push matching reads the same modes and runs on this schema.
    const { MATCH_SQL } = await import("../src/push.mjs");
    await q(MATCH_SQL);
    // Unfollow.
    assert.equal((await call("/v1/me/watchlist/UNB", "a", "DELETE")).status, 200);
    assert.ok(!(await (await call("/v1/me/follows", "a")).json()).items.some(f => f.id === "UNB"));
  });
});
