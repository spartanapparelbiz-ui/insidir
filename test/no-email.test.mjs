import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { randomUUID } from "node:crypto";

/* Insidir sends no email, and first-visit attribution, through the real API and PostgreSQL. */
// src/config.mjs reads DATABASE_URL once, when first imported: set it (to this suite's own schema) before any import.
const PG_URL = process.env.INSIDIR_TEST_DATABASE_URL || "";
const SCHEMA = "no_email_test_" + process.pid;
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

test("no email on PostgreSQL: no codes, no reset links, no newsletter, no alert emails, nothing queued", { skip: !PG_URL && "set INSIDIR_TEST_DATABASE_URL" }, async () => {
  const admin = new pg.Client({ connectionString: PG_URL });
  await admin.connect();
  await admin.query("CREATE SCHEMA IF NOT EXISTS " + SCHEMA);
  const db = await import("../src/db.mjs");
  let server;
  try {
    await db.migrate();
    const q = (s, p) => db.query(s, p);
    const { createApiServer } = await import("../src/api.mjs");
    server = createApiServer({ quiet: true, env: { ...process.env, INSIDIR_PAYWALL: "1", INSIDIR_EMAIL_PROVIDER: "postmark", POSTMARK_SERVER_TOKEN: "pm-token", INSIDIR_EMAIL_FROM: "a@insidir.test" } });
    await new Promise(r => server.listen(0, "127.0.0.1", r));
    const base = "http://127.0.0.1:" + server.address().port;
    const call = async (path, { method = "GET", body, cookie } = {}) => {
      const res = await fetch(base + path, { method, redirect: "manual", body: body === undefined ? undefined : JSON.stringify(body),
        headers: { "Content-Type": "application/json", Origin: ORIGIN, "X-Forwarded-For": "198.51.100." + (1 + Math.floor(Math.random() * 200)), ...(cookie ? { Cookie: cookie } : {}) } });
      const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
      return { status: res.status, json, setCookie: res.headers.get("set-cookie") || "" };
    };
    const outbox = async () => (await q("SELECT count(*)::int AS n FROM email_outbox")).rows[0].n;

    // A first visit with ?ref= sets the attribution cookie; an unknown ref does not.
    const landing = await call("/?ref=tiktok");
    assert.match(landing.setCookie, /insidir_ref=tiktok/);
    assert.doesNotMatch((await call("/?ref=nobody")).setCookie, /insidir_ref/);

    // Even with an email provider configured, every route that used to send email is gone.
    const email = `noemail-${randomUUID().slice(0, 8)}@example.com`;
    for (const path of ["/v1/auth/email-code", "/v1/auth/email-code/verify", "/v1/auth/forgot-password", "/v1/auth/reset-password", "/v1/auth/verify-email"]) {
      const r = await call(path, { method: "POST", body: { email, code: "123456", token: "a".repeat(64), password: "a new password 123" } });
      assert.equal(r.status, 410, path);
      assert.match(r.json.error, /hello@aethric\.llc/, path + " says how to get help");
    }
    assert.notEqual((await call("/v1/newsletter", { method: "POST", body: { email } })).status, 202, "no newsletter sign-up");

    // A password account, with its first-visit ref; asking for alert emails is refused.
    const reg = await call("/v1/auth/register", { method: "POST", body: { email, password: "correct horse battery 9" }, cookie: "insidir_ref=tiktok" });
    assert.equal(reg.status, 201);
    const session = reg.setCookie.split(";")[0];
    assert.equal((await q("SELECT signup_ref FROM users WHERE email=$1", [email])).rows[0].signup_ref, "tiktok");
    const prefs = await call("/v1/me/email-preferences", { cookie: session });
    assert.deepEqual([prefs.json.emailAlerts, prefs.json.emailAvailable, prefs.json.modes], ["off", false, ["off"]]);
    assert.equal((await call("/v1/me/email-preferences", { method: "POST", body: { emailAlerts: "immediate", consent: true }, cookie: session })).status, 410);
    assert.equal((await call("/v1/me/email-preferences", { method: "POST", body: { inApp: true }, cookie: session })).status, 200, "in-app settings still save");

    // The email module itself queues nothing.
    const { enqueueEmail, transportFor, emailSettings } = await import("../src/email.mjs");
    assert.deepEqual(await enqueueEmail(q, { to: email, category: "security", kind: "x", dedupeKey: "x", subject: "x", text: "x" }), { queued: false, disabled: true });
    assert.equal(transportFor(emailSettings({ INSIDIR_EMAIL_PROVIDER: "postmark", POSTMARK_SERVER_TOKEN: "t", INSIDIR_EMAIL_FROM: "a@b.co" })), null);

    // Deleting the account needs the password (there is no emailed code) and sends no confirmation.
    assert.equal((await call("/v1/me", { method: "DELETE", body: { code: "123456" }, cookie: session })).status, 403);
    assert.equal((await call("/v1/me", { method: "DELETE", body: { password: "correct horse battery 9" }, cookie: session })).status, 200);
    assert.equal((await q("SELECT count(*)::int AS n FROM users WHERE email=$1", [email])).rows[0].n, 0);
    assert.equal(await outbox(), 0, "not one message was ever queued");
  } finally {
    server?.close();
    await db.pool?.end();
    await admin.query("DROP SCHEMA IF EXISTS " + SCHEMA + " CASCADE");
    await admin.end();
  }
});
