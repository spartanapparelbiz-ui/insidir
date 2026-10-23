import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
if (process.env.INSIDIR_TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.INSIDIR_TEST_DATABASE_URL;
Object.assign(process.env, { ALLOWED_ORIGINS: "https://insidir.test", COOKIE_SECURE: "0" }); // read once, when config.mjs is imported
const { unsubscribeToken, verifyUnsubscribeToken } = await import("../src/notifications.mjs");

/* Alerts. Events are SYNTHETIC (fictional issuers and people). The PostgreSQL part runs only with INSIDIR_TEST_DATABASE_URL. */
const SECRET = { INSIDIR_APP_SECRET: "s".repeat(40) };

test("unsubscribe tokens are signed per member and refused without the secret or when altered", () => {
  const id = randomUUID(), t = unsubscribeToken(id, SECRET);
  assert.equal(verifyUnsubscribeToken(t, SECRET), id);
  assert.equal(verifyUnsubscribeToken(t.slice(0, -1) + (t.endsWith("A") ? "B" : "A"), SECRET), null);
  assert.equal(verifyUnsubscribeToken(randomUUID() + "." + t.split(".")[1], SECRET), null, "another member's id with this signature");
  assert.equal(unsubscribeToken(id, {}), null); assert.equal(verifyUnsubscribeToken(t, {}), null);
});

const DB = process.env.INSIDIR_TEST_DATABASE_URL;
test("alerts on PostgreSQL", { skip: !DB && "set INSIDIR_TEST_DATABASE_URL" }, async t => {
  const { migrate, pool } = await import("../src/db.mjs");
  const { saveEvent } = await import("../src/research-events.mjs");
  const N = await import("../src/notifications.mjs");
  const { createApiServer } = await import("../src/api.mjs");
  const { newSession } = await import("../src/auth.mjs");
  await migrate();
  const q = (sql, p) => pool.query(sql, p);
  const connect = () => pool.connect();
  const tag = randomUUID().slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, "X");
  const T1 = "N" + tag.slice(0, 4), T2 = "M" + tag.slice(0, 4), T3 = "Q" + tag.slice(0, 4);
  const person = String(Math.floor(Math.random() * 1e8)).padStart(10, "0");
  const ENV = { ...SECRET, INSIDIR_PAYWALL: "1", INSIDIR_EMAIL_PROVIDER: "log", INSIDIR_PUBLIC_URL: "https://insidir.test", INSIDIR_COMPLIMENTARY_EMAILS: "" };
  const member = async (status = "active") => {
    const email = `alerts-${randomUUID()}@example.com`;
    const u = (await q("INSERT INTO users(email,password_hash,subscription_status,email_verified_at) VALUES($1,'x',$2,now()) RETURNING id,email", [email, status])).rows[0];
    return { ...u, cookie: "insidir_sid=" + await newSession(u.id) };
  };
  const M = await member(), O = await member(), L = await member("canceled");
  await q("INSERT INTO watchlist(user_id,ticker,created_at) VALUES($1,$2,now()-interval '10 days'),($3,$2,now()-interval '10 days'),($4,$2,now()-interval '10 days')", [M.id, T1, O.id, L.id]);
  await q("INSERT INTO followed_people(user_id,owner_cik,created_at) VALUES($1,$2,now()-interval '10 days')", [M.id, person]);
  const server = createApiServer({ quiet: true, env: ENV });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  t.after(async () => { server.close(); await q("DELETE FROM users WHERE id=ANY($1::uuid[])", [[M.id, O.id, L.id]]); await pool.end(); });
  const call = async (path, { method = "GET", body, cookie, raw, headers = {} } = {}) => {
    const res = await fetch(base + path, { method, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)), redirect: "manual",
      headers: { "Content-Type": "application/json", Origin: "https://insidir.test", ...(cookie ? { Cookie: cookie } : {}), ...headers } });
    const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, text };
  };
  const event = (key, extra = {}) => saveEvent(q, { event_key: `ntest:${tag}:${key}`, event_type: "insider_purchase", issuer_cik: "0000000009", ticker: T1, issuer_name: "Synthetic Alerts Inc",
    owner_cik: "0000000008", owner_name: "Example Filer", transaction_date: new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10), filing_date: new Date(Date.now() - 86400000).toISOString(),
    ingested_at: new Date().toISOString(), accessions: ["000000000926" + String(Math.floor(Math.random() * 1e6)).padStart(6, "0")], source_urls: ["https://www.sec.gov/Archives/edgar/data/9/x/"],
    facts: { owners: [{ cik: "0000000008", name: "Example Filer", roles: ["Director"] }], totalShares: "100", totalValue: "1000", priceLow: "10", priceHigh: "10", lineCount: 1, lines: [] }, people: ["0000000008"], ...extra });
  const notes = async userId => (await q("SELECT n.*,e.event_key FROM notifications n JOIN sec_events e ON e.id=n.event_id WHERE n.user_id=$1 AND e.event_key LIKE $2 ORDER BY n.id", [userId, `ntest:${tag}:%`])).rows;

  await t.test("fan-out: watched company and followed person alert once; old, superseded, baseline and unwatched events do not", async () => {
    await q("DELETE FROM research_cursors WHERE name='notifications'");
    assert.equal((await N.fanOut({ query: q })).started, true, "the first run only sets the starting point");
    await event("watched");
    await event("followed", { ticker: T2, owner_cik: person, people: [person], facts: { owners: [{ cik: person, name: "Followed Person", roles: [] }], totalShares: "5", totalValue: "50", lineCount: 1, lines: [] } });
    await event("unwatched", { ticker: T3, people: [] });
    await event("old", { filing_date: new Date(Date.now() - 30 * 86400000).toISOString() });
    await event("superseded", {}).then(r => q("UPDATE sec_events SET status='superseded' WHERE id=$1", [r.id]));
    await event("baseline", { event_type: "company_disclosure", facts: { form: "8-K", baseline: true }, people: [] });
    await N.fanOut({ query: q }); await N.fanOut({ query: q });
    const mine = await notes(M.id);
    assert.deepEqual(mine.map(n => [n.event_key.split(":").at(-1), n.reason]), [["watched", "watchlist"], ["followed", "followed_person"]]);
    assert.equal((await notes(O.id)).length, 1);
  });

  await t.test("an event filed before someone started watching does not alert them", async () => {
    await q("UPDATE watchlist SET created_at=now() WHERE user_id=$1", [O.id]);
    await event("before-watch", { filing_date: new Date(Date.now() - 2 * 86400000).toISOString() });
    await N.fanOut({ query: q });
    assert.ok(!(await notes(O.id)).some(n => n.event_key.endsWith("before-watch")));
    assert.ok((await notes(M.id)).some(n => n.event_key.endsWith("before-watch")));
  });

  await t.test("preferences: in-app off or an excluded event type adds nothing", async () => {
    await q("INSERT INTO notification_preferences(user_id,in_app) VALUES($1,false)", [O.id]);
    await q("INSERT INTO notification_preferences(user_id,event_types) VALUES($1,ARRAY['insider_purchase'])", [L.id]);
    await event("sale", { event_type: "insider_sale" });
    await N.fanOut({ query: q });
    assert.ok(!(await notes(O.id)).some(n => n.event_key.endsWith("sale")));
    assert.ok(!(await notes(L.id)).some(n => n.event_key.endsWith("sale")));
    assert.ok((await notes(M.id)).some(n => n.event_key.endsWith("sale")));
  });

  await t.test("reading and marking read: own notifications only", async () => {
    const list = await call("/v1/me/notifications", { cookie: M.cookie });
    assert.equal(list.status, 200);
    assert.ok(list.json.items.length >= 4); assert.ok(list.json.unread >= 4);
    assert.match(list.json.items[0].event.summary, /reported/);
    assert.ok(list.json.items.every(i => i.event.sourceUrls[0].startsWith("https://www.sec.gov/")));
    const others = await notes(L.id);
    assert.equal((await call("/v1/me/notifications/read", { method: "POST", cookie: M.cookie, body: { ids: others.map(n => String(n.id)) } })).json.marked, 0, "another member's ids mark nothing");
    assert.equal((await call("/v1/me/notifications/read", { method: "POST", cookie: M.cookie, body: { ids: [list.json.items[0].id] } })).json.marked, 1);
    assert.equal((await call("/v1/me/notifications?unread=1", { cookie: M.cookie })).json.unread, list.json.unread - 1);
    assert.equal((await call("/v1/me/notifications", {})).status, 401);
    assert.equal((await call("/v1/me/notifications", { cookie: L.cookie })).status, 402, "no subscription: no product data");
  });

  await t.test("alert email consent: needs the box ticked; recorded with the words shown; no confirmation step", async () => {
    const prefs = await call("/v1/me/email-preferences", { cookie: M.cookie });
    assert.deepEqual([prefs.json.emailAlerts, prefs.json.emailAvailable, prefs.json.emailVerified], ["off", true, true]);
    assert.equal((await call("/v1/me/email-preferences", { method: "POST", cookie: M.cookie, body: { emailAlerts: "immediate" } })).status, 400);
    const on = await call("/v1/me/email-preferences", { method: "POST", cookie: M.cookie, body: { emailAlerts: "immediate", consent: true, consentVersion: N.ALERT_CONSENT_VERSION } });
    assert.equal(on.status, 200); assert.equal(on.json.emailAlerts, "immediate");
    const c = (await q("SELECT * FROM email_consents WHERE user_id=$1", [M.id])).rows;
    assert.deepEqual([c.length, c[0].action, c[0].setting, c[0].consent_text], [1, "opt_in", "immediate", N.ALERT_CONSENT_TEXT]);
    assert.equal((await call("/v1/me/email-preferences", { method: "POST", cookie: L.cookie, body: { emailAlerts: "bogus" } })).status, 400);
    await q("UPDATE users SET email_verified_at=NULL WHERE id=$1", [L.id]);
    assert.equal((await call("/v1/me/email-preferences", { method: "POST", cookie: L.cookie, body: { emailAlerts: "daily", consent: true, consentVersion: N.ALERT_CONSENT_VERSION } })).status, 200, "no email verification: an unconfirmed address can turn alert emails on");
  });

  await t.test("immediate emails: one per member per run, each alert in exactly one email, even with two workers", async () => {
    const [a, b] = await Promise.all([N.sendImmediate({ query: q, connect, env: ENV }), N.sendImmediate({ query: q, connect, env: ENV })]);
    assert.equal(a.emails + b.emails, 1);
    const mails = (await q("SELECT * FROM email_outbox WHERE user_id=$1 AND kind='alert'", [M.id])).rows;
    assert.equal(mails.length, 1);
    assert.equal(mails[0].category, "alert");
    assert.match(mails[0].headers["List-Unsubscribe"], /^<https:\/\/insidir\.test\/v1\/email\/unsubscribe\?t=/);
    assert.equal(mails[0].headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
    assert.match(mails[0].text_body, /not investment advice/);
    assert.match(mails[0].text_body, /Source: https:\/\/www\.sec\.gov\//);
    assert.ok((await notes(M.id)).every(n => n.emailed_at && n.email_status === "queued"));
    assert.equal((await N.sendImmediate({ query: q, connect, env: ENV })).emails, 0, "nothing new: no email");
    assert.equal((await N.sendImmediate({ query: q, connect, env: {} })).skippedReason !== undefined, true, "no signing secret: no alert emails");
  });

  await t.test("daily digest: at the member's hour, once a day; no access means no email", async () => {
    await q("UPDATE users SET email_verified_at=now() WHERE id=$1", [L.id]);
    await q("UPDATE notification_preferences SET email_alerts='daily',digest_hour_utc=7 WHERE user_id=$1", [L.id]);
    await q("INSERT INTO notification_preferences(user_id,email_alerts,digest_hour_utc) VALUES($1,'daily',7) ON CONFLICT (user_id) DO UPDATE SET email_alerts='daily',digest_hour_utc=7,in_app=true", [O.id]);
    await q("UPDATE watchlist SET created_at=now()-interval '10 days' WHERE user_id=$1", [O.id]);
    await event("digest-1"); await N.fanOut({ query: q });
    assert.equal((await N.sendDigests({ query: q, connect, env: ENV, hour: 8 })).emails, 0, "not their hour");
    const r = await N.sendDigests({ query: q, connect, env: ENV, hour: 7 });
    assert.equal(r.emails, 1, "O has access; L's subscription is cancelled");
    assert.equal((await q("SELECT count(*)::int AS n FROM email_outbox WHERE user_id=$1 AND kind='daily_digest'", [O.id])).rows[0].n, 1);
    assert.ok((await notes(L.id)).filter(n => n.event_key.endsWith("digest-1")).every(n => n.email_status === "skipped_no_access"));
    await event("digest-2"); await N.fanOut({ query: q });
    await N.sendDigests({ query: q, connect, env: ENV, hour: 7 });
    assert.equal((await q("SELECT count(*)::int AS n FROM email_outbox WHERE user_id=$1 AND kind='daily_digest'", [O.id])).rows[0].n, 1, "one digest per day: the dedupe key holds");
  });

  await t.test("unsubscribe: the link asks first; one click (RFC 8058) unsubscribes, is recorded and cancels queued alerts", async () => {
    await event("pending"); await N.fanOut({ query: q }); await N.sendImmediate({ query: q, connect, env: ENV });
    const token = N.unsubscribeToken(M.id, ENV);
    const page = await call("/v1/email/unsubscribe?t=" + encodeURIComponent(token), { headers: { Origin: "" } });
    assert.equal(page.status, 200); assert.match(page.text, /Stop alert emails\?/);
    assert.equal((await call("/v1/me/email-preferences", { cookie: M.cookie })).json.emailAlerts, "immediate", "a GET changes nothing");
    const done = await fetch(base + "/v1/email/unsubscribe?t=" + encodeURIComponent(token), { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" });
    assert.equal(done.status, 200);
    assert.equal((await call("/v1/me/email-preferences", { cookie: M.cookie })).json.emailAlerts, "off");
    assert.ok((await q("SELECT action FROM email_consents WHERE user_id=$1", [M.id])).rows.some(r => r.action === "unsubscribe_one_click"));
    const queued = (await q("SELECT status,text_body FROM email_outbox WHERE user_id=$1 AND kind='alert' ORDER BY id", [M.id])).rows;
    assert.ok(queued.every(r => r.status === "cancelled" && r.text_body === null), "nothing optional is sent after unsubscribing");
    const bad = await fetch(base + "/v1/email/unsubscribe?t=" + encodeURIComponent(token.slice(0, -2) + "zz"), { method: "POST", body: "List-Unsubscribe=One-Click" });
    assert.equal(bad.status, 400);
  });
});
