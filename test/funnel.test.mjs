/* First-party funnel measurement (src/funnel.mjs): what a browser may send, deduplication, the report's honesty
 * (no rate over zero, no experiment winner without data), and, on PostgreSQL when INSIDIR_TEST_DATABASE_URL is set,
 * the real /v1/events and /v1/admin/funnel routes inside a throwaway schema. */
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { cleanClientEvent, dedupeKey, twoProportionP, CLIENT_EVENTS, SERVER_EVENTS, MIN_VISITORS } from "../src/funnel.mjs";

const V = "0123456789abcdef0123456789abcdef";

test("a browser can send only listed events, with no free text and no identity", () => {
  const row = cleanClientEvent({ event: "cta_clicked", visitor: V, label: "hero", path: "/index.html", referrer: "https://news.example.com/a?b=c", email: "x@y.z", question: "what did NVDA insiders do", ticker: "NVDA" }, new Date("2026-10-19T12:00:00Z"));
  assert.deepEqual(row, { event: "cta_clicked", kind: "click", visitor: V, label: "hero", variant: null, path: "/index.html", referrer: "news.example.com", day: "2026-10-19" });
  for (const event of SERVER_EVENTS) assert.throws(() => cleanClientEvent({ event, visitor: V }), /Unknown event/, event + " is the engine's to record");
  assert.throws(() => cleanClientEvent({ event: "landing_viewed", visitor: "me@example.com" }), /Invalid visitor/);
  assert.throws(() => cleanClientEvent({ event: "experiment_exposed", visitor: V }), /variant/);
  // Free text in a label, a path with a query, or a non-http referrer is dropped, not stored.
  const loose = cleanClientEvent({ event: "demo_opened", visitor: V, label: "Tim Cook sold", path: "/company.html?ticker=AAPL", referrer: "javascript:alert(1)" });
  assert.equal(loose.label, null); assert.equal(loose.path, null); assert.equal(loose.referrer, null);
  assert.ok(Object.keys(CLIENT_EVENTS).every(e => !SERVER_EVENTS.includes(e)), "no event is both");
});

test("deduplication: once per visitor per day per label, first events once per member, webhooks once per object", () => {
  const d = "2026-10-19";
  assert.equal(dedupeKey({ event: "landing_viewed", kind: "page", visitor: V, day: d }), "landing_viewed:" + V + ":2026-10-19::");
  assert.notEqual(dedupeKey({ event: "cta_clicked", kind: "click", visitor: V, day: d, label: "hero" }), dedupeKey({ event: "cta_clicked", kind: "click", visitor: V, day: d, label: "pricing" }));
  assert.equal(dedupeKey({ event: "intelligence_opened", kind: "first", userId: "u1", day: d }), "first:intelligence_opened:u1");
  assert.equal(dedupeKey({ event: "checkout_completed", kind: "server", userId: "u1", object: "cs_123" }), "checkout_completed:cs_123");
});

test("two-proportion test: identical arms are not different, a large gap is", () => {
  assert.ok(twoProportionP(50, 1000, 50, 1000) > 0.99);
  assert.ok(twoProportionP(50, 1000, 100, 1000) < 0.001);
  assert.equal(twoProportionP(1, 0, 1, 10), null);
});

test("the landing page measures without a third party and respects GPC and Do Not Track", async () => {
  const js = await readFile(new URL("../web/assets/js/funnel.js", import.meta.url), "utf8");
  assert.match(js, /globalPrivacyControl/); assert.match(js, /doNotTrack/);
  assert.match(js, /"\/v1\/events"/);
  assert.doesNotMatch(js, /https?:\/\//, "nothing leaves insidir.com");
  const privacy = await readFile(new URL("../web/privacy.html", import.meta.url), "utf8");
  assert.match(privacy, /Global Privacy Control/);
  assert.match(privacy, /13 months/);
});

const PG_URL = process.env.INSIDIR_TEST_DATABASE_URL || "";
const SCHEMA = "funnel_test_" + process.pid;
if (PG_URL) {
  process.env.DATABASE_URL = PG_URL + (PG_URL.includes("?") ? "&" : "?") + "options=" + encodeURIComponent("-c search_path=" + SCHEMA);
  process.env.ALLOWED_ORIGINS = "https://insidir.test";
  process.env.COOKIE_SECURE = "0";
}
test("funnel events and the report on PostgreSQL", { skip: !PG_URL && "set INSIDIR_TEST_DATABASE_URL" }, async () => {
  const admin = new pg.Client({ connectionString: PG_URL });
  await admin.connect();
  await admin.query("CREATE SCHEMA IF NOT EXISTS " + SCHEMA);
  let server;
  try {
    const db = await import("../src/db.mjs");
    await db.migrate();
    const q = (sql, params) => db.query(sql, params);
    const sha = s => createHash("sha256").update(s).digest("hex");
    const users = {};
    for (const name of ["boss", "member"]) {
      const token = randomBytes(32).toString("hex");
      const id = (await q("INSERT INTO users(email,password_hash,subscription_status,current_period_end) VALUES($1,'x','active',now()+interval '20 days') RETURNING id", [name + "@insidir.test"])).rows[0].id;
      await q("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '1 day')", [sha(token), id]);
      users[name] = { id, cookie: "insidir_sid=" + token };
    }
    const { createApiServer } = await import("../src/api.mjs");
    // Admin access is the token AND a one-time code (src/admin-auth.mjs); an admin e-mail address alone is not enough.
    const { generateTotpSecret, totpCode, base32Decode, stepAt } = await import("../src/totp.mjs");
    const ADMIN_TOKEN = "funnel-admin-token-".padEnd(40, "x"), TOTP = generateTotpSecret();
    server = createApiServer({ quiet: true, env: { ...process.env, INSIDIR_PAYWALL: "1", INSIDIR_ADMIN_TOKEN: ADMIN_TOKEN, INSIDIR_ADMIN_TOTP_SECRET: TOTP } });
    await new Promise(r => server.listen(0, "127.0.0.1", r));
    const base = "http://127.0.0.1:" + server.address().port;
    const send = (payload, { origin = "https://insidir.test", who } = {}) => fetch(base + "/v1/events", { method: "POST", headers: { "content-type": "application/json", ...(origin ? { origin } : {}), ...(who ? { cookie: users[who].cookie } : {}) }, body: JSON.stringify(payload) });

    assert.equal((await send({ event: "landing_viewed", visitor: V, path: "/" })).status, 204);
    assert.equal((await send({ event: "landing_viewed", visitor: V, path: "/" })).status, 204, "a repeat answers the same");
    assert.equal((await send({ event: "landing_viewed", visitor: V }, { origin: "https://evil.example" })).status, 403, "other sites cannot write");
    assert.equal((await send({ event: "checkout_completed", visitor: V })).status, 400, "a browser cannot claim a payment");
    await send({ event: "cta_clicked", visitor: V, label: "hero" });
    await send({ event: "cta_clicked", visitor: V, label: "pricing" });
    await send({ event: "experiment_exposed", visitor: V, variant: "hero:b" });
    await send({ event: "research_opened", visitor: V }, { who: "member" });
    await send({ event: "research_opened", visitor: V }, { who: "member" });
    const rows = (await q("SELECT event,count(*)::int AS n FROM funnel_events GROUP BY event ORDER BY event")).rows;
    assert.deepEqual(rows, [{ event: "cta_clicked", n: 2 }, { event: "experiment_exposed", n: 1 }, { event: "first_research_completed", n: 1 }, { event: "landing_viewed", n: 1 }, { event: "research_opened", n: 1 }]);
    assert.equal((await q("SELECT user_id FROM funnel_events WHERE event='research_opened'")).rows[0].user_id, users.member.id, "a member's event carries their id");

    // The report: admins only, measured counts, no rate over an empty stage, and no verdict without data.
    assert.equal((await fetch(base + "/v1/admin/funnel")).status, 401);
    assert.equal((await fetch(base + "/v1/admin/funnel", { headers: { cookie: users.member.cookie } })).status, 401, "a member is not an administrator");
    assert.equal((await fetch(base + "/v1/admin/funnel", { headers: { authorization: "Bearer " + ADMIN_TOKEN } })).status, 401, "the token without a one-time code is refused");
    const report = await (await fetch(base + "/v1/admin/funnel?days=30", { headers: { authorization: "Bearer " + ADMIN_TOKEN, "x-insidir-admin-otp": totpCode(base32Decode(TOTP), stepAt()) } })).json();
    const stage = k => report.stages.find(s => s.key === k);
    assert.equal(stage("landing").count, 1);
    assert.equal(stage("cta").count, 1, "distinct visitors, not clicks");
    assert.equal(stage("cta").rate, 1);
    assert.equal(stage("paid").count, 0);
    assert.equal(stage("paid").rate, null, "no rate over zero checkouts");
    assert.equal(report.sufficient, false);
    assert.match(report.note, /Too little data/);
    assert.match(report.experiments[0].decision, new RegExp("Not enough data.*" + MIN_VISITORS));

    // Deleting an account keeps the anonymous count but drops the identity.
    await q("DELETE FROM users WHERE id=$1", [users.member.id]);
    assert.equal((await q("SELECT count(*)::int AS n FROM funnel_events WHERE user_id IS NULL AND event='research_opened'")).rows[0].n, 1);
  } finally {
    if (server) await new Promise(r => server.close(r));
    const db = await import("../src/db.mjs");
    await db.pool?.end().catch(() => {});
    await admin.query("DROP SCHEMA IF EXISTS " + SCHEMA + " CASCADE");
    await admin.end();
  }
});
