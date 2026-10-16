import test from "node:test";
import assert from "node:assert/strict";
import { subscriptionActive, periodLapsed, hasAccess, PERIOD_GRACE_MS } from "../src/paywall.mjs";
import { reconcileLapsed } from "../src/billing.mjs";

/* Access follows the period a customer has paid for, and a reconciliation re-reads Stripe for accounts whose
 * period ended while they were still marked active (for example when a cancellation webhook never arrived). */

const NOW = Date.parse("2026-10-16T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const row = (status, end) => ({ email: "member@example.com", subscription_status: status, current_period_end: end });

test("an active subscription grants access during its period and the grace that follows", () => {
  assert.equal(subscriptionActive(row("active", new Date(NOW + 20 * DAY)), NOW), true);
  assert.equal(subscriptionActive(row("active", new Date(NOW - 2 * DAY)), NOW), true, "inside the renewal grace");
  assert.equal(subscriptionActive(row("trialing", new Date(NOW + DAY).toISOString()), NOW), true);
});

test("a status left active long after its paid period no longer grants access", () => {
  const stale = row("active", new Date(NOW - PERIOD_GRACE_MS - 60 * 1000));
  assert.equal(periodLapsed(stale, NOW), true);
  assert.equal(subscriptionActive(stale, NOW), false);
});

test("accounts without a recorded period end are judged on status alone", () => {
  assert.equal(subscriptionActive(row("active", null), NOW), true);
  assert.equal(subscriptionActive(row("past_due", null), NOW), false);
  assert.equal(subscriptionActive(row("canceled", new Date(NOW + DAY)), NOW), false);
});

test("complimentary accounts are unaffected", () => {
  const env = { INSIDIR_COMPLIMENTARY_EMAILS: "member@example.com" };
  assert.equal(hasAccess(row(null, null), env), true);
});

function fakeQuery(dueIds) {
  const fn = async (sql, params) => {
    fn.calls.push({ sql: sql.replace(/\s+/g, " ").trim(), params });
    if (/^SELECT stripe_customer_id FROM users/.test(sql.trim())) return { rows: dueIds.map(id => ({ stripe_customer_id: id })), rowCount: dueIds.length };
    return { rows: [], rowCount: 1 };
  };
  fn.calls = [];
  return fn;
}
const PRICE = "price_insidir";
const sub = (id, status, endSeconds) => ({ id, status, created: 1, items: { data: [{ price: { id: PRICE }, current_period_end: endSeconds }] } });

test("reconciliation stores what Stripe reports for each lapsed account", async () => {
  const subsByCustomer = {
    cus_renewed: [sub("sub_renewed", "active", Math.floor((NOW + 30 * DAY) / 1000))],
    cus_cancelled: [sub("sub_cancelled", "canceled", Math.floor((NOW - 5 * DAY) / 1000))],
  };
  const stripe = { get: async (path, params) => ({ data: subsByCustomer[params.customer] || [], has_more: false }) };
  const query = fakeQuery(["cus_renewed", "cus_cancelled"]);
  const result = await reconcileLapsed({ stripe, query, priceId: PRICE });
  assert.deepEqual(result, { checked: 2, synced: 2, failed: 0 });
  const updates = query.calls.filter(c => c.sql.startsWith("UPDATE users SET stripe_subscription_id"));
  assert.deepEqual(updates.map(u => [u.params[3], u.params[1]]), [["cus_renewed", "active"], ["cus_cancelled", "canceled"]]);
  assert.equal(updates[0].params[2].getTime(), Math.floor((NOW + 30 * DAY) / 1000) * 1000);
});

test("one failing customer does not stop the reconciliation of the others", async () => {
  const stripe = { get: async (path, params) => { if (params.customer === "cus_broken") throw new Error("Stripe timeout"); return { data: [sub("sub_ok", "active", 2e9)], has_more: false }; } };
  const query = fakeQuery(["cus_broken", "cus_fine"]);
  const errors = []; const original = console.error; console.error = m => errors.push(m);
  try { assert.deepEqual(await reconcileLapsed({ stripe, query, priceId: PRICE }), { checked: 2, synced: 1, failed: 1 }); }
  finally { console.error = original; }
  assert.match(errors[0], /billing.reconcile_failed/);
});
