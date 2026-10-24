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
  const tag = randomUUID().slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, "X");
  const T1 = "N" + tag.slice(0, 4), T2 = "M" + tag.slice(0, 4), T3 = "Q" + tag.slice(0, 4);
  const person = String(Math.floor(Math.random() * 1e8)).padStart(10, "0");
  const ENV = { ...SECRET, INSIDIR_PAYWALL: "1", INSIDIR_PUBLIC_URL: "https://insidir.test", INSIDIR_COMPLIMENTARY_EMAILS: "" };
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

  await t.test("no alert emails: email is always off, turning it on is refused, nothing is queued", async () => {
    const prefs = await call("/v1/me/email-preferences", { cookie: M.cookie });
    assert.deepEqual([prefs.json.emailAlerts, prefs.json.emailAvailable, prefs.json.modes], ["off", false, ["off"]]);
    for (const mode of ["immediate", "daily"])
      assert.equal((await call("/v1/me/email-preferences", { method: "POST", cookie: M.cookie, body: { emailAlerts: mode, consent: true } })).status, 410, mode);
    assert.equal(N.sendImmediate, undefined); assert.equal(N.sendDigests, undefined);
    const saved = await call("/v1/me/email-preferences", { method: "POST", cookie: M.cookie, body: { eventTypes: ["insider_purchase", "insider_sale"] } });
    assert.equal(saved.status, 200); assert.deepEqual(saved.json.eventTypes, ["insider_purchase", "insider_sale"]);
    assert.equal(saved.json.emailAlerts, "off");
    assert.equal((await q("SELECT count(*)::int AS n FROM email_outbox WHERE user_id=ANY($1::uuid[])", [[M.id, O.id, L.id]])).rows[0].n, 0);
  });

  await t.test("unsubscribe links from emails sent before still work, and only ever turn things off", async () => {
    // Someone who had alert emails on before Insidir stopped sending email.
    await q("UPDATE notification_preferences SET email_alerts='immediate' WHERE user_id=$1", [M.id]);
    const token = N.unsubscribeToken(M.id, ENV);
    const page = await call("/v1/email/unsubscribe?t=" + encodeURIComponent(token), { headers: { Origin: "" } });
    assert.equal(page.status, 200); assert.match(page.text, /Stop alert emails\?/);
    const done = await fetch(base + "/v1/email/unsubscribe?t=" + encodeURIComponent(token), { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" });
    assert.equal(done.status, 200);
    assert.equal((await q("SELECT email_alerts FROM notification_preferences WHERE user_id=$1", [M.id])).rows[0].email_alerts, "off");
    assert.ok((await q("SELECT action FROM email_consents WHERE user_id=$1", [M.id])).rows.some(r => r.action === "unsubscribe_one_click"));
    const bad = await fetch(base + "/v1/email/unsubscribe?t=" + encodeURIComponent(token.slice(0, -2) + "zz"), { method: "POST", body: "List-Unsubscribe=One-Click" });
    assert.equal(bad.status, 400);
  });
});
