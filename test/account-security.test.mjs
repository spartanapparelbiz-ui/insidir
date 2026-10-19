import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { generateTotpSecret, totpCode, base32Decode, stepAt } from "../src/totp.mjs";
import { emailDigest } from "../src/security-events.mjs";

/* Account security end to end: the real engine (src/server.mjs, two instances on one database) against PostgreSQL.
 * Runs only when INSIDIR_TEST_DATABASE_URL points at a throwaway database. Email uses the outbox with no delivery
 * worker (INSIDIR_BACKGROUND_WORKERS=0), so the test reads the one-time links straight from email_outbox. */
const DB = process.env.INSIDIR_TEST_DATABASE_URL;
const PASSWORD = "correct horse battery staple 42";
const ADMIN_TOKEN = "a".repeat(48), TOTP = generateTotpSecret();
const OWNER = `owner-${randomUUID()}@example.com`;
const engines = [];

async function start() {
  const port = 20000 + Math.floor(Math.random() * 20000), base = `http://127.0.0.1:${port}`, origin = `http://localhost:${port}`;
  const child = spawn(process.execPath, ["src/server.mjs"], {
    env: { ...process.env, DATABASE_URL: DB, PORT: String(port), COOKIE_SECURE: "0", ALLOW_SIGNUP: "1", ALLOWED_ORIGINS: origin, AUTO_INGEST: "0",
      INSIDIR_BACKGROUND_WORKERS: "0", INSIDIR_BILLING_ENABLED: "0", INSIDIR_EMAIL_PROVIDER: "log", INSIDIR_PUBLIC_URL: "https://insidir.test",
      INSIDIR_COMPLIMENTARY_EMAILS: OWNER, INSIDIR_ADMIN_TOKEN: ADMIN_TOKEN, INSIDIR_ADMIN_TOTP_SECRET: TOTP },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let out = ""; child.stdout.on("data", d => out += d); child.stderr.on("data", d => out += d);
  engines.push(child);
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + "/healthz")).ok) break; } catch {}
    await new Promise(r => setTimeout(r, 100));
    if (i === 99) throw new Error("engine did not start:\n" + out);
  }
  const call = async (path, { method = "GET", body, cookie, client = "198.51.100.20", headers = {} } = {}) => {
    const res = await fetch(base + path, { method, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual",
      headers: { "Content-Type": "application/json", Origin: origin, "X-Forwarded-For": client, ...(cookie ? { Cookie: cookie } : {}), ...headers } });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, cookie: (res.headers.get("set-cookie") || "").split(";")[0] };
  };
  return { call };
}
const tokenFrom = text => text.match(/#token=([a-f0-9]{64})/)?.[1];

test("account security on PostgreSQL", { skip: !DB && "set INSIDIR_TEST_DATABASE_URL" }, async t => {
  const db = new pg.Client({ connectionString: DB }); await db.connect();
  const A = await start(), B = await start();
  t.after(async () => { for (const e of engines) e.kill(); await db.end(); });
  const latest = async (email, kind) => (await db.query("SELECT * FROM email_outbox WHERE recipient_hash=$1 AND kind=$2 ORDER BY id DESC LIMIT 1", [emailDigest(email), kind])).rows[0];

  await t.test("registration queues a confirmation link that works once, for that account only", async () => {
    const email = `verify-${randomUUID()}@example.com`;
    const reg = await A.call("/v1/auth/register", { method: "POST", body: { email, password: PASSWORD } });
    assert.equal(reg.status, 201);
    assert.deepEqual(reg.json.verification, { sent: true });
    assert.equal(reg.json.access.emailVerified, false);
    const mail = await latest(email, "verify_email");
    assert.equal(mail.category, "security");
    assert.equal(mail.retain_body, false, "one-time links are never retained");
    const token = tokenFrom(mail.text_body);
    assert.ok(token);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM user_tokens WHERE token_hash=$1", [token])).rows[0].n, 0, "only the digest is stored");
    assert.equal((await B.call("/v1/auth/verify-email", { method: "POST", body: { token } })).status, 200, "another instance accepts it");
    assert.equal((await A.call("/v1/auth/verify-email", { method: "POST", body: { token } })).status, 400, "used once");
    assert.equal((await A.call("/v1/me", { cookie: reg.cookie })).json.access.emailVerified, true);
    assert.equal((await A.call("/v1/auth/verify-email", { method: "POST", body: { token: "f".repeat(64) } })).status, 400);
  });

  await t.test("password recovery: same answer for every address, a reset signs out everywhere, links work once", async () => {
    const email = `reset-${randomUUID()}@example.com`;
    const reg = await A.call("/v1/auth/register", { method: "POST", body: { email, password: PASSWORD }, client: "198.51.100.31" });
    const unknown = await A.call("/v1/auth/forgot-password", { method: "POST", body: { email: `nobody-${randomUUID()}@example.com` }, client: "198.51.100.31" });
    const known = await A.call("/v1/auth/forgot-password", { method: "POST", body: { email }, client: "198.51.100.31" });
    assert.equal(unknown.status, 202); assert.equal(known.status, 202);
    assert.deepEqual(unknown.json, known.json, "the answer does not reveal whether the account exists");
    const token = tokenFrom((await latest(email, "password_reset")).text_body);
    assert.equal((await A.call("/v1/auth/reset-password", { method: "POST", body: { token, password: "short" } })).status, 400);
    assert.equal((await B.call("/v1/auth/reset-password", { method: "POST", body: { token, password: "a brand new passphrase 77" } })).status, 200, "the short attempt did not spend the token");
    assert.equal((await A.call("/v1/me", { cookie: reg.cookie })).status, 401, "existing sessions are signed out");
    assert.equal((await A.call("/v1/auth/reset-password", { method: "POST", body: { token, password: "another new passphrase 88" } })).status, 400, "used once");
    assert.equal((await A.call("/v1/auth/login", { method: "POST", body: { email, password: PASSWORD }, client: "198.51.100.32" })).status, 401);
    assert.equal((await A.call("/v1/auth/login", { method: "POST", body: { email, password: "a brand new passphrase 77" }, client: "198.51.100.32" })).status, 200);
    assert.ok(await latest(email, "password_changed"), "a security notice is queued");
    const kinds = (await db.query("SELECT kind FROM security_events WHERE user_id=(SELECT id FROM users WHERE email=$1) ORDER BY id", [email])).rows.map(r => r.kind);
    for (const k of ["register", "password_reset_requested", "password_reset_completed", "login_failure", "login_success"]) {
      if (k === "login_failure") continue; // a failure for a known account is logged by email digest, not user id
      assert.ok(kinds.includes(k), k);
    }
  });

  await t.test("a newer reset link voids the older one", async () => {
    const email = `twice-${randomUUID()}@example.com`;
    await A.call("/v1/auth/register", { method: "POST", body: { email, password: PASSWORD }, client: "198.51.100.33" });
    await A.call("/v1/auth/forgot-password", { method: "POST", body: { email }, client: "198.51.100.33" });
    const first = tokenFrom((await latest(email, "password_reset")).text_body);
    await A.call("/v1/auth/forgot-password", { method: "POST", body: { email }, client: "198.51.100.33" });
    const second = tokenFrom((await latest(email, "password_reset")).text_body);
    assert.notEqual(first, second);
    assert.equal((await A.call("/v1/auth/reset-password", { method: "POST", body: { token: first, password: "a brand new passphrase 77" } })).status, 400);
    assert.equal((await A.call("/v1/auth/reset-password", { method: "POST", body: { token: second, password: "a brand new passphrase 77" } })).status, 200);
  });

  await t.test("rate limits are shared: failures on one instance count on the other", async () => {
    const email = `shared-${randomUUID()}@example.com`;
    await A.call("/v1/auth/register", { method: "POST", body: { email, password: PASSWORD }, client: "198.51.100.40" });
    for (let i = 0; i < 10; i++) assert.equal((await (i % 2 ? A : B).call("/v1/auth/login", { method: "POST", body: { email, password: "wrong-" + i + "-guess-xyz" }, client: "198.51.100." + (41 + i) })).status, 401);
    assert.equal((await A.call("/v1/auth/login", { method: "POST", body: { email, password: PASSWORD }, client: "198.51.100.60" })).status, 429);
    assert.equal((await B.call("/v1/auth/login", { method: "POST", body: { email, password: PASSWORD }, client: "198.51.100.61" })).status, 429);
    const raw = (await db.query("SELECT count(*)::int AS n FROM rate_limits WHERE key LIKE '%@%'")).rows[0].n;
    assert.equal(raw, 0, "keys are digests, never raw addresses");
  });

  await t.test("security events never hold an address in clear", async () => {
    const leaked = (await db.query("SELECT count(*)::int AS n FROM security_events WHERE detail::text LIKE '%@%' OR email_hash LIKE '%@%'")).rows[0].n;
    assert.equal(leaked, 0);
  });

  await t.test("changing the password keeps this session and signs out the others", async () => {
    const email = `change-${randomUUID()}@example.com`;
    const one = await A.call("/v1/auth/register", { method: "POST", body: { email, password: PASSWORD }, client: "198.51.100.70" });
    const two = await A.call("/v1/auth/login", { method: "POST", body: { email, password: PASSWORD }, client: "198.51.100.70" });
    assert.equal((await A.call("/v1/me/password", { method: "POST", cookie: one.cookie, body: { currentPassword: "wrong password here", newPassword: "fresh passphrase 2026!" } })).status, 403);
    const ok = await A.call("/v1/me/password", { method: "POST", cookie: one.cookie, body: { currentPassword: PASSWORD, newPassword: "fresh passphrase 2026!" } });
    assert.equal(ok.status, 200); assert.equal(ok.json.otherSessionsRevoked, 1);
    assert.equal((await A.call("/v1/me", { cookie: one.cookie })).status, 200);
    assert.equal((await A.call("/v1/me", { cookie: two.cookie })).status, 401);
    const events = await A.call("/v1/me/security-events", { cookie: one.cookie });
    assert.equal(events.status, 200);
    assert.ok(events.json.items.some(e => e.kind === "password_changed"));
  });

  await t.test("export holds the member's own data and nobody else's", async () => {
    const a = `export-a-${randomUUID()}@example.com`, b = `export-b-${randomUUID()}@example.com`;
    const ra = await A.call("/v1/auth/register", { method: "POST", body: { email: a, password: PASSWORD }, client: "198.51.100.80" });
    await A.call("/v1/auth/register", { method: "POST", body: { email: b, password: PASSWORD }, client: "198.51.100.81" });
    await db.query("INSERT INTO watchlist(user_id,ticker) SELECT id,'ZZZB' FROM users WHERE email=$1", [b]);
    const ex = await A.call("/v1/me/export", { cookie: ra.cookie });
    assert.equal(ex.status, 200);
    assert.equal(ex.json.account.email, a);
    assert.ok(!JSON.stringify(ex.json).includes(b) && !JSON.stringify(ex.json).includes("ZZZB"));
    assert.equal(ex.json.account.password_hash, undefined, "never the password hash");
  });

  await t.test("a complimentary address has access only once its owner confirmed it (verification enforced by email config)", async () => {
    const reg = await A.call("/v1/auth/register", { method: "POST", body: { email: OWNER, password: PASSWORD }, client: "198.51.100.90" });
    assert.equal(reg.json.access.active, false);
    assert.equal((await A.call("/v1/filings", { cookie: reg.cookie })).status, 402);
    const token = tokenFrom((await latest(OWNER, "verify_email")).text_body);
    await A.call("/v1/auth/verify-email", { method: "POST", body: { token } });
    assert.equal((await A.call("/v1/me", { cookie: reg.cookie })).json.access.active, true);
  });

  await t.test("admin: token AND one-time code; a code works once; a session cookie then opens the ops snapshot", async () => {
    const code = totpCode(base32Decode(TOTP), stepAt());
    assert.equal((await A.call("/v1/admin/ops", { headers: { Authorization: "Bearer " + ADMIN_TOKEN } })).status, 401, "token alone");
    assert.equal((await A.call("/v1/admin/ops", { headers: { "X-Insidir-Admin-OTP": code } })).status, 401, "code alone");
    const session = await A.call("/v1/admin/session", { method: "POST", headers: { Authorization: "Bearer " + ADMIN_TOKEN, "X-Insidir-Admin-OTP": code } });
    assert.equal(session.status, 200);
    assert.match(session.cookie, /^insidir_admin=[a-f0-9]{64}$/);
    assert.equal((await B.call("/v1/admin/ops", { headers: { Authorization: "Bearer " + ADMIN_TOKEN, "X-Insidir-Admin-OTP": code } })).status, 401, "replayed on another instance");
    const ops = await B.call("/v1/admin/ops", { cookie: session.cookie });
    assert.equal(ops.status, 200);
    for (const k of ["ingestion", "email", "billing", "workers", "capabilities", "sec"]) assert.ok(k in ops.json, k);
    assert.equal(ops.json.capabilities.mode, "RESEARCH_ONLY");
    assert.ok(!JSON.stringify(ops.json).includes("@example.com"), "no member addresses in the snapshot");
    const audit = (await db.query("SELECT action FROM admin_audit_log ORDER BY id DESC LIMIT 5")).rows.map(r => r.action);
    assert.ok(audit.includes("admin.session_opened"));
  });

  await t.test("account deletion: logged without a user id, optional mail cancelled, a confirmation kept", async () => {
    const email = `delete-${randomUUID()}@example.com`;
    const reg = await A.call("/v1/auth/register", { method: "POST", body: { email, password: PASSWORD }, client: "198.51.100.95" });
    assert.equal((await A.call("/v1/me", { method: "DELETE", cookie: reg.cookie, body: { password: "not the password" } })).status, 403);
    const del = await A.call("/v1/me", { method: "DELETE", cookie: reg.cookie, body: { password: PASSWORD } });
    assert.equal(del.status, 200);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM users WHERE email=$1", [email])).rows[0].n, 0);
    const ev = (await db.query("SELECT user_id FROM security_events WHERE kind='account_deleted' AND email_hash=$1", [emailDigest(email)])).rows;
    assert.equal(ev.length, 1); assert.equal(ev[0].user_id, null);
    const verify = await latest(email, "verify_email");
    assert.equal(verify.status, "cancelled"); assert.equal(verify.text_body, null, "the unsent link is erased");
    const confirmation = await latest(email, "account_deleted");
    assert.equal(confirmation.category, "billing"); assert.equal(confirmation.retain_body, true);
  });
});
