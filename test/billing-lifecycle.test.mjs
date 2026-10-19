import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { stripeSimulator, signedWebhook } from "./support/stripe-simulator.mjs";

/* The whole subscription lifecycle through the real engine (src/api.mjs) and PostgreSQL, with Stripe replaced by a
 * stateful SIMULATOR (test/support/stripe-simulator.mjs). This proves how the engine reacts to the events and API
 * answers we expect from Stripe; it does not prove Stripe sends them. Stripe test mode is exercised separately by
 * scripts/stripe-test-mode-check.mjs. Runs only with INSIDIR_TEST_DATABASE_URL. */
const DB = process.env.INSIDIR_TEST_DATABASE_URL;
const ORIGIN = "https://insidir.test";
const WHSEC = "whsec_lifecycle_test_secret";
const ENV = { INSIDIR_PAYWALL: "1", INSIDIR_BILLING_ENABLED: "1", INSIDIR_STRIPE_SECRET_KEY: "sk_test_simulated", INSIDIR_STRIPE_PRICE_ID: "price_pro",
  INSIDIR_STRIPE_WEBHOOK_SECRET: WHSEC, INSIDIR_PUBLIC_URL: ORIGIN, INSIDIR_EMAIL_PROVIDER: "log", INSIDIR_TRIAL: "1" };
const PASSWORD = "lifecycle passphrase 2026";

test("subscription lifecycle on PostgreSQL with a Stripe simulator", { skip: !DB && "set INSIDIR_TEST_DATABASE_URL" }, async t => {
  Object.assign(process.env, { DATABASE_URL: DB, ALLOW_SIGNUP: "1", ALLOWED_ORIGINS: ORIGIN, COOKIE_SECURE: "0" });
  const { migrate, pool } = await import("../src/db.mjs");
  const { createApiServer } = await import("../src/api.mjs");
  const { DISCLOSURE_VERSION } = await import("../src/billing.mjs");
  await migrate();
  const sim = stripeSimulator();
  const server = createApiServer({ quiet: true, env: ENV, stripe: sim.client });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  t.after(async () => { server.close(); await pool.end(); });
  const q = (sql, p) => pool.query(sql, p);

  const call = async (path, { method = "GET", body, cookie, raw, headers = {} } = {}) => {
    const res = await fetch(base + path, { method, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)), redirect: "manual",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, "X-Forwarded-For": "192.0.2." + (1 + Math.floor(Math.random() * 200)), ...(cookie ? { Cookie: cookie } : {}), ...headers } });
    const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, cookie: (res.headers.get("set-cookie") || "").split(";")[0] };
  };
  // Like Stripe, redeliver an event that did not get a 2xx (e.g. a lock wait while another suite migrates the shared
  // test database); handling is idempotent per event id. A delivery that keeps failing fails the test.
  const deliver = async events => { const out = []; for (const e of events) { const { raw, signature } = signedWebhook(e, WHSEC); let r;
    for (let attempt = 0; attempt < 3; attempt++) { r = await call("/v1/billing/webhook", { method: "POST", raw, headers: { "Stripe-Signature": signature } }); if (r.status < 300) break; await new Promise(ok => setTimeout(ok, 300)); }
    assert.ok(r.status < 300, "webhook " + e.type + " answered " + r.status); out.push(r); } return out; };
  const access = async cookie => (await call("/v1/me", { cookie })).json.access;
  const product = async cookie => (await call("/v1/filings", { cookie })).status;
  const mails = async (userId, kind) => (await q("SELECT * FROM email_outbox WHERE user_id=$1 AND kind=$2 ORDER BY id", [userId, kind])).rows;
  const verify = async (email, cookie) => {
    const mail = (await q("SELECT text_body FROM email_outbox WHERE kind='verify_email' AND to_email=$1 ORDER BY id DESC LIMIT 1", [email])).rows[0];
    const token = mail.text_body.match(/#token=([a-f0-9]{64})/)[1];
    assert.equal((await call("/v1/auth/verify-email", { method: "POST", body: { token }, cookie })).status, 200);
  };
  const signup = async (tag, ref) => {
    const email = `${tag}-${randomUUID()}@example.com`;
    const r = await call("/v1/auth/register", { method: "POST", body: { email, password: PASSWORD, ...(ref ? { ref } : {}) } });
    assert.equal(r.status, 201);
    return { email, cookie: r.cookie, id: r.json.user.id };
  };
  const checkout = (cookie, offer) => call("/v1/billing/checkout", { method: "POST", cookie, body: { consent: true, offer, disclosureVersion: DISCLOSURE_VERSION } });

  // An approved creator partner, so the commission path is exercised.
  const code = "life" + randomUUID().slice(0, 8);
  await q("INSERT INTO creator_partners(code,instagram_handle,display_name,status) VALUES($1,$1,'Lifecycle Creator','approved')", [code]);
  const A = await signup("member", code);
  let subA, firstInvoice;

  await t.test("a new account: no access, eligible for the $1 trial, terms shown, verification first", async () => {
    assert.equal((await access(A.cookie)).active, false);
    assert.equal(await product(A.cookie), 402);
    const status = (await call("/v1/billing/status", { cookie: A.cookie })).json;
    assert.deepEqual([status.offer.kind, status.offer.todayCents, status.offer.recurringCents, status.offer.trialDays], ["trial", 100, 3900, 3]);
    assert.equal((await checkout(A.cookie, "trial")).status, 403, "unverified address: checkout waits for confirmation");
    await verify(A.email, A.cookie);
  });

  await t.test("checkout needs recorded consent to the exact offer and creates the $1 trial checkout", async () => {
    assert.equal((await call("/v1/billing/checkout", { method: "POST", cookie: A.cookie, body: {} })).status, 400, "no consent");
    assert.equal((await checkout(A.cookie, "full")).status, 409, "consented to a different offer");
    const ok = await checkout(A.cookie, "trial");
    assert.equal(ok.status, 200); assert.match(ok.json.url, /^https:\/\/checkout\.stripe\.test\//);
    const session = [...sim.sessions.values()].at(-1);
    assert.equal(session.params["line_items[0][price]"], "price_pro");
    assert.equal(session.params["line_items[1][price_data][unit_amount]"], "100");
    assert.equal(session.params["subscription_data[trial_period_days]"], "3");
    assert.equal(session.params.payment_method_collection, "always");
    const consent = (await q("SELECT * FROM billing_consents WHERE user_id=$1", [A.id])).rows;
    assert.equal(consent.length, 1);
    assert.deepEqual([consent[0].offer, consent[0].amount_today_cents, consent[0].recurring_cents, consent[0].trial_days, consent[0].stripe_checkout_id], ["trial", 100, 3900, 3, session.id]);
    assert.match(consent[0].disclosure_text, /\$1\.00 today.*\$39\.00 per month/);
    assert.equal(session.params["metadata[insidir_consent_id]"], String(consent[0].id));
    // A second checkout closes the first page, so only one can ever be paid.
    assert.equal((await checkout(A.cookie, "trial")).status, 200);
    assert.equal(session.status, "expired");
  });

  await t.test("paying: events out of order and duplicated still give one trialing member, one acknowledgment, no commission", async () => {
    const session = [...sim.sessions.values()].filter(s => s.status === "open").at(-1);
    const { subscription, invoice, events } = sim.completeCheckout(session.id);
    subA = subscription; firstInvoice = invoice;
    const [completed, created, paid] = events;
    const replies = await deliver([paid, created, completed, completed]);
    assert.deepEqual(replies.map(r => r.status), [200, 200, 200, 200]);
    assert.equal(replies[3].json.duplicate, true, "the same event id is processed once");
    const a = await access(A.cookie);
    assert.deepEqual([a.active, a.status, a.plan], [true, "trialing", "pro"]);
    assert.equal(await product(A.cookie), 200);
    assert.equal((await q("SELECT count(*)::int AS n FROM creator_commissions WHERE referred_user_id=$1", [A.id])).rows[0].n, 0, "the $1 trial invoice never earns a commission");
    const ack = await mails(A.id, "acknowledgment");
    assert.equal(ack.length, 1);
    assert.match(ack[0].text_body, /charged \$1\.00 today for a 3-day trial/);
    assert.match(ack[0].text_body, /renews automatically at \$39\.00 per month/);
    assert.match(ack[0].text_body, /How to cancel: open Billing/);
    assert.match(ack[0].text_body, /The terms you agreed to at checkout: You agree to pay \$1\.00 today/);
    assert.equal(ack[0].retain_body, true);
    assert.equal((await mails(A.id, "payment_receipt")).length, 1, "a receipt for the $1");
    // A delayed redelivery (a new event id for the same checkout) does not queue a second acknowledgment.
    await deliver([{ ...completed, id: "evt_redelivered_" + randomUUID().slice(0, 8) }]);
    assert.equal((await mails(A.id, "acknowledgment")).length, 1);
  });

  await t.test("trial reminder: once, however often Stripe or the worker asks", async () => {
    await deliver(sim.trialWillEnd(subA.id));
    await deliver(sim.trialWillEnd(subA.id));
    const { queueTrialReminders } = await import("../src/billing-notices.mjs");
    await q("UPDATE users SET current_period_end=now()+interval '30 hours' WHERE id=$1", [A.id]);
    const r = await queueTrialReminders(q, { env: ENV });
    assert.ok(r.checked >= 1);
    const reminders = await mails(A.id, "trial_reminder");
    assert.equal(reminders.length, 1, "one reminder per subscription, from Stripe's event or the worker, whichever comes first");
    assert.match(reminders[0].text_body, /charged \$39\.00/);
  });

  await t.test("the trial converts: the first $39 renewal keeps access and earns the creator commission once", async () => {
    const events = sim.endPeriod(subA.id);
    await deliver(events);
    const a = await access(A.cookie);
    assert.deepEqual([a.active, a.status], [true, "active"]);
    const commissions = (await q("SELECT * FROM creator_commissions WHERE referred_user_id=$1", [A.id])).rows;
    assert.equal(commissions.length, 1);
    assert.deepEqual([commissions[0].amount_cents, commissions[0].status], [1000, "pending"]);
    assert.equal((await mails(A.id, "payment_receipt")).length, 2);
    await deliver(sim.endPeriod(subA.id));
    assert.equal((await q("SELECT count(*)::int AS n FROM creator_commissions WHERE referred_user_id=$1", [A.id])).rows[0].n, 1, "later renewals never add one");
  });

  await t.test("a failed card: past_due stops access and the customer is told", async () => {
    await deliver(sim.endPeriod(subA.id, { card: "fail" }));
    const a = await access(A.cookie);
    assert.deepEqual([a.active, a.status], [false, "past_due"]);
    assert.equal(await product(A.cookie), 402);
    assert.equal((await mails(A.id, "payment_failed")).length, 1);
    assert.equal((await checkout(A.cookie, "full")).status, 409, "no second subscription while one is unpaid");
  });

  await t.test("refund and dispute: recorded, commission back to review, refund notice", async () => {
    const chargeId = [...sim.charges.values()].find(c => c.amount === 3900).id;
    await deliver(sim.refund(chargeId));
    await deliver(sim.dispute(chargeId));
    assert.equal((await q("SELECT status FROM creator_commissions WHERE referred_user_id=$1", [A.id])).rows[0].status, "needs_review");
    const kinds = (await q("SELECT kind FROM billing_events WHERE stripe_customer_id=$1 ORDER BY id", [subA.customer])).rows.map(r => r.kind);
    for (const k of ["payment_failed", "refund", "dispute"]) assert.ok(kinds.includes(k), k);
    assert.equal((await mails(A.id, "refund_issued")).length, 1);
  });

  await t.test("cancellation online: no further charges, access to the period end, one confirmation", async () => {
    const B = await signup("canceller");
    await verify(B.email, B.cookie);
    assert.equal((await checkout(B.cookie, "trial")).status, 200);
    const { subscription, events } = sim.completeCheckout([...sim.sessions.values()].at(-1).id);
    await deliver(events);
    assert.equal((await access(B.cookie)).active, true);
    const cancel = await call("/v1/billing/cancel", { method: "POST", cookie: B.cookie });
    assert.equal(cancel.status, 200); assert.equal(cancel.json.canceled, true);
    assert.equal(subscription.cancel_at_period_end, true, "Stripe was told to stop renewing");
    assert.equal((await access(B.cookie)).active, true, "the paid trial runs to its end");
    // The portal reports the same cancellation: still one confirmation.
    await deliver([{ id: "evt_" + randomUUID().slice(0, 12), type: "customer.subscription.updated", data: { object: subscription, previous_attributes: { cancel_at_period_end: false } } }]);
    assert.equal((await mails(B.id, "cancel_confirmed")).length, 1);
    await deliver(sim.endPeriod(subscription.id));
    const b = await access(B.cookie);
    assert.deepEqual([b.active, b.status], [false, "canceled"], "never charged the $39: the trial ended cancelled");
    assert.ok(!sim.calls.some(c => c.path === "/subscriptions/" + subscription.id && c.method === "DELETE"));
    assert.equal((await mails(B.id, "subscription_ended")).length, 1);
    // Trial used: the account is offered the full price only, and must agree to it.
    const status = (await call("/v1/billing/status", { cookie: B.cookie })).json;
    assert.equal(status.offer.kind, "full");
    assert.equal((await checkout(B.cookie, "trial")).status, 409);
    const again = await checkout(B.cookie, "full");
    assert.equal(again.status, 200);
    const session = [...sim.sessions.values()].at(-1);
    assert.equal(session.params["subscription_data[trial_period_days]"], undefined, "no second trial");
    assert.equal(session.amount_total, 3900);
  });

  await t.test("account deletion cancels with Stripe first; a checkout completing afterwards is cancelled too", async () => {
    const C = await signup("deleter");
    await verify(C.email, C.cookie);
    assert.equal((await checkout(C.cookie, "trial")).status, 200);
    const paidSession = [...sim.sessions.values()].at(-1);
    const { subscription, events } = sim.completeCheckout(paidSession.id);
    await deliver(events);
    assert.equal((await checkout(C.cookie, "trial")).status, 409, "already subscribed");
    // An abandoned second checkout page would still be open if the member had one; deletion expires it.
    const del = await call("/v1/me", { method: "DELETE", cookie: C.cookie, body: { password: PASSWORD } });
    assert.equal(del.status, 200); assert.equal(del.json.subscriptionCanceled, true);
    assert.equal(subscription.status, "canceled");
    assert.equal((await q("SELECT count(*)::int AS n FROM users WHERE id=$1", [C.id])).rows[0].n, 0);
    assert.equal((await call("/v1/me", { cookie: C.cookie })).status, 401, "signed out with the account gone");
    // The orphan safety net: an Insidir checkout that completes for a deleted account is cancelled on its webhook.
    const D = await signup("orphan");
    await verify(D.email, D.cookie);
    await checkout(D.cookie, "trial");
    const late = [...sim.sessions.values()].at(-1);
    await q("DELETE FROM users WHERE id=$1", [D.id]); // the account disappears before the payment completes
    const done = sim.completeCheckout(late.id);
    await deliver(done.events);
    assert.equal(done.subscription.status, "canceled");
  });

  await t.test("a forged or stale webhook changes nothing", async () => {
    const forged = await call("/v1/billing/webhook", { method: "POST", raw: JSON.stringify({ id: "evt_forged", type: "customer.subscription.updated", data: { object: { customer: subA.customer } } }), headers: { "Stripe-Signature": "t=1,v1=" + "0".repeat(64) } });
    assert.equal(forged.status, 400);
    const { raw, signature } = signedWebhook({ id: "evt_stale", type: "invoice.paid", data: { object: firstInvoice } }, WHSEC, Math.floor(Date.now() / 1000) - 3600);
    assert.equal((await call("/v1/billing/webhook", { method: "POST", raw, headers: { "Stripe-Signature": signature } })).status, 400);
  });
});
