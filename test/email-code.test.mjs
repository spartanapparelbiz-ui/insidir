import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID } from "node:crypto";

/* Email-code sign-in and first-visit attribution, through the real API and PostgreSQL. */
// src/config.mjs reads DATABASE_URL once, when first imported: set it (to this suite's own schema) before any import.
const PG_URL = process.env.INSIDIR_TEST_DATABASE_URL || "";
const SCHEMA = "email_code_test_" + process.pid;
const ORIGIN = "https://insidir.test";
if (PG_URL) Object.assign(process.env, { DATABASE_URL: PG_URL + (PG_URL.includes("?") ? "&" : "?") + "options=" + encodeURIComponent("-c search_path=" + SCHEMA),
  ALLOW_SIGNUP: "1", ALLOWED_ORIGINS: ORIGIN, COOKIE_SECURE: "0" });
const A = await import("../src/attribution.mjs");

test("attribution: only the listed refs, first touch wins, cookie set once", () => {
  assert.deepEqual(A.DEFAULT_REFS, ["insidirfinance", "marketreceipts", "wallstreetdecoded", "companybriefdaily", "marketexplaineddaily", "tiktok", "youtube"]);
  assert.equal(A.cleanRef(" TikTok "), "tiktok");
  assert.equal(A.cleanRef("someoneelse"), null);
  const req = cookie => ({ headers: { cookie } });
  const url = new URL("https://insidir.com/?ref=youtube");
  assert.match(A.refCookieFor(req(""), url), /^insidir_ref=youtube; Path=\/; Max-Age=7776000; SameSite=Lax; Secure$/);
  assert.equal(A.refCookieFor(req("insidir_ref=tiktok"), url), null, "the first ref is kept");
  assert.equal(A.refCookieFor(req(""), new URL("https://insidir.com/?ref=spam")), null);
  assert.equal(A.refFromCookie(req("a=1; insidir_ref=tiktok")), "tiktok");
  assert.deepEqual(A.allowedRefs({ INSIDIR_REFS: "alpha, beta" }), ["alpha", "beta"]);
});

test("email-code sign-in on PostgreSQL: one code, five tries, account created once with its ref, deletion by code", { skip: !PG_URL && "set INSIDIR_TEST_DATABASE_URL" }, async () => {
  const admin = new pg.Client({ connectionString: PG_URL });
  await admin.connect();
  await admin.query("CREATE SCHEMA IF NOT EXISTS " + SCHEMA);
  const db = await import("../src/db.mjs");
  let server;
  try {
    await db.migrate();
    const q = (s, p) => db.query(s, p);
    const { createApiServer } = await import("../src/api.mjs");
    server = createApiServer({ quiet: true, env: { ...process.env, INSIDIR_PAYWALL: "1" } });
    await new Promise(r => server.listen(0, "127.0.0.1", r));
    const base = "http://127.0.0.1:" + server.address().port;
    const call = async (path, { method = "GET", body, cookie } = {}) => {
      const res = await fetch(base + path, { method, redirect: "manual", body: body === undefined ? undefined : JSON.stringify(body),
        headers: { "Content-Type": "application/json", Origin: ORIGIN, "X-Forwarded-For": "198.51.100." + (1 + Math.floor(Math.random() * 200)), ...(cookie ? { Cookie: cookie } : {}) } });
      const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
      return { status: res.status, json, setCookie: res.headers.get("set-cookie") || "" };
    };
    const latestCode = async email => (await q("SELECT subject FROM email_outbox WHERE to_email=$1 AND kind='email_code' ORDER BY id DESC LIMIT 1", [email])).rows[0]?.subject.slice(0, 6);

    // A first visit with ?ref= sets the attribution cookie; an unknown ref does not.
    const landing = await call("/?ref=tiktok");
    assert.match(landing.setCookie, /insidir_ref=tiktok/);
    assert.doesNotMatch((await call("/?ref=nobody")).setCookie, /insidir_ref/);

    const email = `code-${randomUUID().slice(0, 8)}@example.com`;
    const sent = await call("/v1/auth/email-code", { method: "POST", body: { email } });
    assert.equal(sent.status, 202);
    assert.match(sent.json.message, /6-digit code/);
    const code = await latestCode(email);
    assert.match(code, /^\d{6}$/);
    const stored = (await q("SELECT code_hash FROM email_codes")).rows[0].code_hash;
    assert.notEqual(stored, code, "only a hash of the code is stored");

    // Wrong codes count; the right code still works within five tries.
    const wrong = String((Number(code) + 1) % 1e6).padStart(6, "0");
    assert.equal((await call("/v1/auth/email-code/verify", { method: "POST", body: { email, code: wrong } })).status, 401);
    const ok = await call("/v1/auth/email-code/verify", { method: "POST", body: { email, code }, cookie: "insidir_ref=tiktok" });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.created, true);
    assert.match(ok.setCookie, /insidir_sid=[a-f0-9]{64}/);
    const user = (await q("SELECT * FROM users WHERE email=$1", [email])).rows[0];
    assert.equal(user.signup_ref, "tiktok");
    assert.ok(user.email_verified_at, "typing the code proves the inbox");
    assert.match(user.password_hash, /^nopassword\$/);
    assert.equal((await call("/v1/auth/email-code/verify", { method: "POST", body: { email, code } })).status, 401, "a code works once");

    // Five wrong tries spend a code.
    await call("/v1/auth/email-code", { method: "POST", body: { email } });
    const second = await latestCode(email);
    const miss = String((Number(second) + 7) % 1e6).padStart(6, "0");
    for (let i = 0; i < 5; i++) await call("/v1/auth/email-code/verify", { method: "POST", body: { email, code: miss } });
    assert.equal((await call("/v1/auth/email-code/verify", { method: "POST", body: { email, code: second } })).status, 401, "locked after five wrong tries");

    // Signing in again by code: the same account, not a new one.
    await call("/v1/auth/email-code", { method: "POST", body: { email } });
    const again = await call("/v1/auth/email-code/verify", { method: "POST", body: { email, code: await latestCode(email) } });
    assert.equal(again.json.created, false);
    assert.equal(again.json.user.id, user.id);
    assert.equal((await q("SELECT count(*)::int AS n FROM users WHERE email=$1", [email])).rows[0].n, 1);

    // No password to confirm deletion with: an emailed code does it.
    const session = again.setCookie.split(";")[0];
    assert.equal((await call("/v1/me", { method: "DELETE", body: { password: "123456" }, cookie: session })).status, 403);
    await call("/v1/auth/email-code", { method: "POST", body: { email } });
    const del = await call("/v1/me", { method: "DELETE", body: { code: await latestCode(email) }, cookie: session });
    assert.equal(del.status, 200);
    assert.equal((await q("SELECT count(*)::int AS n FROM users WHERE email=$1", [email])).rows[0].n, 0);

    // A malformed address is refused before anything is sent.
    assert.equal((await call("/v1/auth/email-code", { method: "POST", body: { email: "not-an-email" } })).status, 400);
  } finally {
    server?.close();
    await db.pool?.end();
    await admin.query("DROP SCHEMA IF EXISTS " + SCHEMA + " CASCADE");
    await admin.end();
  }
});
