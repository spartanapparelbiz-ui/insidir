import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";

/* Sign-in limits, end to end: the real engine (src/server.mjs) against PostgreSQL.
 * Runs only when INSIDIR_TEST_DATABASE_URL points at a throwaway database.
 * Behind the hosting proxy every request reaches the engine from the proxy's address, with the client in
 * X-Forwarded-For; these requests do the same, so the limits must key on the client, not the socket. */

const DB = process.env.INSIDIR_TEST_DATABASE_URL;
const PORT = 20000 + Math.floor(Math.random() * 20000);
const BASE = `http://127.0.0.1:${PORT}`;
const ORIGIN = `http://localhost:${PORT}`;
let server;
const READER = `reader-${randomUUID()}@example.com`;

async function start() {
  server = spawn(process.execPath, ["src/server.mjs"], {
    env: { ...process.env, DATABASE_URL: DB, PORT: String(PORT), COOKIE_SECURE: "0", ALLOW_SIGNUP: "1", ALLOWED_ORIGINS: ORIGIN,
      AUTO_INGEST: "0", INSIDIR_BILLING_ENABLED: "0", INSIDIR_COMPLIMENTARY_EMAILS: READER },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let log = ""; server.stdout.on("data", d => log += d); server.stderr.on("data", d => log += d);
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(BASE + "/healthz")).ok) return; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error("engine did not start:\n" + log);
}
const post = (path, body, client) => fetch(BASE + path, {
  method: "POST", body: JSON.stringify(body),
  headers: { "Content-Type": "application/json", Origin: ORIGIN, "X-Forwarded-For": client }
});
const ip = n => `203.0.113.${n % 250}`;
const email = tag => `${tag}-${randomUUID()}@example.com`;
const PASSWORD = "correct horse battery staple 42";

test("sign-in limits key on the client and count only failures", { skip: !DB && "set INSIDIR_TEST_DATABASE_URL" }, async t => {
  await start();
  t.after(() => server.kill());

  await t.test("a burst of failed logins from many addresses does not lock out another customer", async () => {
    const victim = email("victim");
    assert.equal((await post("/v1/auth/register", { email: victim, password: PASSWORD }, ip(1))).status, 201);
    for (let i = 0; i < 14; i++) assert.equal((await post("/v1/auth/login", { email: email("nobody"), password: "wrong-password-123" }, ip(10 + i))).status, 401);
    assert.equal((await post("/v1/auth/login", { email: victim, password: PASSWORD }, ip(200))).status, 200);
  });

  await t.test("successful logins never count against the limit", async () => {
    const user = email("regular");
    assert.equal((await post("/v1/auth/register", { email: user, password: PASSWORD }, ip(2))).status, 201);
    for (let i = 0; i < 40; i++) assert.equal((await post("/v1/auth/login", { email: user, password: PASSWORD }, ip(3))).status, 200, `login ${i + 1}`);
  });

  await t.test("one account cannot be guessed at from many addresses", async () => {
    const target = email("target");
    assert.equal((await post("/v1/auth/register", { email: target, password: PASSWORD }, ip(4))).status, 201);
    for (let i = 0; i < 10; i++) assert.equal((await post("/v1/auth/login", { email: target, password: "guess-" + i + "-abcdef" }, ip(40 + i))).status, 401);
    const blocked = await post("/v1/auth/login", { email: target, password: PASSWORD }, ip(90));
    assert.equal(blocked.status, 429);
    assert.match((await blocked.json()).error, /Wait 15 minutes/);
  });

  await t.test("one address cannot guess across many accounts", async () => {
    for (let i = 0; i < 30; i++) assert.equal((await post("/v1/auth/login", { email: email("spray"), password: "wrong-password-123" }, "198.51.100.7")).status, 401);
    assert.equal((await post("/v1/auth/login", { email: email("spray"), password: "wrong-password-123" }, "198.51.100.7")).status, 429);
  });

  await t.test("deleting an account needs the account's password, not just the session", async () => {
    const owner = email("deleter");
    const reg = await post("/v1/auth/register", { email: owner, password: PASSWORD }, ip(8));
    const cookie = reg.headers.get("set-cookie").split(";")[0];
    const del = password => fetch(BASE + "/v1/me", { method: "DELETE", body: JSON.stringify(password === undefined ? {} : { password }),
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: cookie, "X-Forwarded-For": ip(8) } });
    assert.equal((await del(undefined)).status, 403);
    const wrong = await del("not-the-password-1");
    assert.equal(wrong.status, 403);
    assert.match((await wrong.json()).error, /nothing was deleted/);
    assert.equal((await post("/v1/auth/login", { email: owner, password: PASSWORD }, ip(9))).status, 200, "still there after a wrong password");
    assert.equal((await del(PASSWORD)).status, 200);
    assert.equal((await post("/v1/auth/login", { email: owner, password: PASSWORD }, ip(9))).status, 401, "gone after the right one");
  });

  await t.test("an unknown email and a wrong password get the same answer", async () => {
    const known = email("known");
    await post("/v1/auth/register", { email: known, password: PASSWORD }, ip(5));
    const a = await post("/v1/auth/login", { email: email("unknown"), password: "wrong-password-123" }, ip(6));
    const b = await post("/v1/auth/login", { email: known, password: "wrong-password-123" }, ip(7));
    assert.equal(a.status, 401); assert.equal(b.status, 401);
    assert.deepEqual(await a.json(), await b.json());
  });

  await t.test("the transactions API never lists lines from a filing that failed to parse", async () => {
    const db = new pg.Client({ connectionString: DB }); await db.connect();
    const tag = randomUUID().slice(0, 8).toUpperCase(), ticker = "Z" + tag.slice(0, 4).replace(/[^A-Z]/g, "Q");
    try {
      for (const [n, status] of [[1, "parsed"], [2, "error"]]) {
        const acc = `9999999999-26-${tag.slice(0, 4)}${n}`.slice(0, 20);
        await db.query(`INSERT INTO sec_filings(accession,filer_cik,issuer_cik,ticker,title,source_url,ingest_status,published_at) VALUES($1,'1','0000000001',$2,'t','https://www.sec.gov/x',$3,now())`, [acc, ticker, status]);
        await db.query(`INSERT INTO sec_transactions(id,accession,issuer_cik,ticker,owner_name,category,source_url,transaction_date,shares) VALUES($1,$1,'0000000001',$2,'Owner '||$3,'reported_sale','https://www.sec.gov/x',current_date,10)`, [acc, ticker, status]);
      }
      const reg = await post("/v1/auth/register", { email: READER, password: PASSWORD }, ip(11));
      assert.equal(reg.status, 201);
      const r = await fetch(BASE + "/v1/transactions?ticker=" + ticker, { headers: { Cookie: reg.headers.get("set-cookie").split(";")[0], "X-Forwarded-For": ip(11) } });
      assert.equal(r.status, 200);
      assert.deepEqual((await r.json()).items.map(i => i.owner_name), ["Owner parsed"]);
    } finally {
      await db.query("DELETE FROM sec_filings WHERE ticker=$1", [ticker]); await db.end();
    }
  });
});
