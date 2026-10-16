/* Insidir billing: one plan, Insidir Pro at $39/month (the configured Stripe Price).
 *
 * Stripe is the source of truth for a subscription. Webhooks and the billing-status
 * refresh both re-read the customer's subscriptions from Stripe, so events that arrive
 * late or out of order can never leave a paying member locked out (or a cancelled one
 * let in). Only subscriptions for the exact configured Price grant access.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { query as dbQuery } from "./db.mjs";
import { currentUser } from "./auth.mjs";
import { billingSettings } from "./config.mjs";
import { accessSummary } from "./paywall.mjs";

const failure = (status, message, extra = {}) => Object.assign(new Error(message), { status }, extra);

// Subscriptions in these states can never bill again, so they need no cancellation.
// Every other status (active, trialing, past_due, unpaid, incomplete, paused) can.
export const ENDED_STATUSES = Object.freeze(["canceled", "incomplete_expired"]);
const statusOf = sub => String(sub?.status ?? sub?.subscription_status ?? "").trim().toLowerCase();
export const canStillBill = sub => !ENDED_STATUSES.includes(statusOf(sub));
// A new checkout is refused while a subscription for the plan can still bill (it would bill twice).
const ALREADY_ACTIVE = "Your Insidir subscription is already active. Manage it from Billing.";
const UNPAID = "Your subscription has an unpaid invoice. Update your payment method from Billing.";
const BLOCKS_CHECKOUT = { active: ALREADY_ACTIVE, trialing: ALREADY_ACTIVE, past_due: UNPAID, unpaid: UNPAID,
  incomplete: "Your first payment is still being confirmed. Finish it from Billing, or try again in a few minutes.",
  paused: "Your Insidir subscription is paused. Resume it from Billing." };
const BLOCKS_CHECKOUT_OTHER = "You already have an Insidir subscription. Manage it from Billing.";
// Preference when a customer has several subscriptions for the plan.
const RANK = { active: 0, trialing: 0, past_due: 1, unpaid: 2, incomplete: 3, paused: 4 };

const SUBSCRIPTION_ID = /^sub_[A-Za-z0-9]{1,250}$/;
const CUSTOMER_ID = /^cus_[A-Za-z0-9]{1,250}$/;
const CHECKOUT_ID = /^cs_[A-Za-z0-9_]{1,250}$/;
const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Stripe answers resource_missing when a customer does not exist in this Stripe account,
// in which case it cannot bill anyone from this account either.
const missingInStripe = e => e?.stripeStatus === 404 || e?.stripeCode === "resource_missing";

/* One billing change per account at a time (checkout, account deletion), so a double click
 * cannot open two checkouts and a deletion cannot race a checkout. Per process: Insidir
 * runs as one service; the Stripe re-reads below still apply across instances. */
const inFlight = new Set();
export async function exclusiveBilling(userId, fn) {
  const key = String(userId);
  if (inFlight.has(key)) throw failure(409, "Another billing change for this account is already in progress. Try again in a moment.");
  inFlight.add(key);
  try { return await fn(); } finally { inFlight.delete(key); }
}

/* A minimal Stripe REST client. Inject `fetchImpl` (or replace the whole client) in tests. */
export function createStripeClient({ secretKey = billingSettings().secretKey, fetchImpl = globalThis.fetch, timeoutMs = 12000 } = {}) {
  async function request(method, path, params) {
    if (!secretKey) throw failure(503, "Stripe is not connected for Insidir");
    const form = params ? new URLSearchParams(params).toString() : "";
    const url = "https://api.stripe.com/v1" + path + (method !== "POST" && form ? "?" + form : "");
    let response;
    try {
      response = await fetchImpl(url, { method, redirect: "error", signal: AbortSignal.timeout(timeoutMs),
        headers: { Authorization: "Bearer " + secretKey, ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
        body: method === "POST" ? form : undefined });
    } catch { throw failure(503, "Could not reach Stripe. Try again shortly."); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const safe = response.status >= 500 || response.status === 401 || response.status === 403 || response.status === 429;
      throw failure(safe ? 503 : 400, safe ? "Stripe is temporarily unavailable. Try again shortly." : data.error?.message || "Stripe request failed",
        { stripeStatus: response.status, stripeCode: data.error?.code || null });
    }
    return data;
  }
  return { get: (path, params) => request("GET", path, params), post: (path, params) => request("POST", path, params), del: (path, params) => request("DELETE", path, params) };
}

export function verifyStripeSignature(raw, signature, secret, now = Date.now()) {
  if (!secret) return false;
  const parts = {};
  for (const piece of String(signature || "").split(",")) {
    const i = piece.indexOf("=");
    if (i > 0) { const k = piece.slice(0, i).trim(), v = piece.slice(i + 1).trim(); (parts[k] ||= []).push(v); }
  }
  const ts = Number(parts.t?.[0]);
  if (!Number.isSafeInteger(ts) || Math.abs(now / 1000 - ts) > 300) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(String(ts) + "." + raw).digest("hex"));
  // Stripe may send several v1 signatures while a secret is being rolled.
  return (parts.v1 || []).some(v => /^[a-f0-9]{64}$/.test(v) && timingSafeEqual(expected, Buffer.from(v)));
}

const hasPrice = (sub, priceId) => !!priceId && (sub?.items?.data || []).some(item => item?.price?.id === priceId);

// The subscription that decides access: the plan's subscription in the best standing, newest first.
export function pickSubscription(subscriptions, priceId) {
  return (subscriptions || []).filter(s => s && SUBSCRIPTION_ID.test(String(s.id || "")) && hasPrice(s, priceId))
    .sort((a, b) => (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9) || (Number(b.created) || 0) - (Number(a.created) || 0))[0] || null;
}

// Newer Stripe API versions report the period end on the subscription item, older ones on the subscription.
export function periodEnd(sub, priceId) {
  const item = (sub?.items?.data || []).find(x => x?.price?.id === priceId);
  const seconds = Number(item?.current_period_end) || Number(sub?.current_period_end) || 0;
  return seconds > 0 ? new Date(seconds * 1000) : null;
}

/* Every object of a Stripe list endpoint, following has_more/starting_after. Throws (503)
 * when Stripe answers with something that is not a list, or when there are more pages
 * than any real Insidir customer could have: callers must never act on a partial list. */
async function listAll(stripe, path, params, maxPages = 10) {
  const all = [];
  let after = null;
  for (let page = 0; page < maxPages; page++) {
    const list = await stripe.get(path, { ...params, limit: "100", ...(after ? { starting_after: after } : {}) });
    if (!list || !Array.isArray(list.data)) throw failure(503, "Stripe returned an unexpected response. Try again shortly.");
    all.push(...list.data);
    if (!list.has_more) return all;
    after = list.data.at(-1)?.id;
    if (typeof after !== "string" || !after) break;
  }
  throw failure(503, "Stripe returned an incomplete list. Try again shortly.");
}

// All of a customer's subscriptions, in every status, whatever their Price.
export async function listCustomerSubscriptions(customerId, { stripe }) {
  if (!CUSTOMER_ID.test(String(customerId || ""))) throw failure(400, "Invalid Stripe customer");
  return listAll(stripe, "/subscriptions", { customer: customerId, status: "all" });
}

/* Stores the subscription that decides access, from a list just read from Stripe.
 * Returns the stored fields, or null when the customer has no subscription for the plan. */
export async function storeSubscriptions(customerId, subscriptions, { query = dbQuery, priceId = billingSettings().priceId } = {}) {
  const best = pickSubscription(subscriptions, priceId);
  if (!best) {
    // Only the exact configured Price grants access.
    await query("UPDATE users SET subscription_status='inactive' WHERE stripe_customer_id=$1 AND subscription_status IS NOT NULL AND subscription_status<>'inactive'", [customerId]);
    return null;
  }
  const fields = { stripe_subscription_id: best.id, subscription_status: String(best.status || "inactive"), current_period_end: periodEnd(best, priceId) };
  await query("UPDATE users SET stripe_subscription_id=$1,subscription_status=$2,current_period_end=$3 WHERE stripe_customer_id=$4",
    [fields.stripe_subscription_id, fields.subscription_status, fields.current_period_end, customerId]);
  return fields;
}

/* Re-reads a customer's subscriptions from Stripe and stores the one that decides access.
 * Returns the stored fields, or null when the customer has no subscription for the plan. */
export async function syncCustomer(customerId, { stripe, query = dbQuery, priceId = billingSettings().priceId } = {}) {
  if (!CUSTOMER_ID.test(String(customerId || ""))) return null;
  return storeSubscriptions(customerId, await listCustomerSubscriptions(customerId, { stripe }), { query, priceId });
}

/* Reconciliation: accounts still marked active or trialing whose paid period ended more than an hour ago are
 * re-read from Stripe. A renewed subscription gets its new period end; a cancelled or unpaid one gets its real status.
 * This keeps access right even when webhooks were missed. Returns counts; one failing customer does not stop the rest. */
export async function reconcileLapsed({ stripe, query = dbQuery, priceId = billingSettings().priceId, limit = 200 } = {}) {
  const due = await query(`SELECT stripe_customer_id FROM users WHERE stripe_customer_id IS NOT NULL
    AND subscription_status IN ('active','trialing') AND current_period_end IS NOT NULL
    AND current_period_end < now() - interval '1 hour' ORDER BY current_period_end LIMIT $1`, [limit]);
  let synced = 0, failed = 0;
  for (const { stripe_customer_id: id } of due.rows) {
    try { await syncCustomer(id, { stripe, query, priceId }); synced++; }
    catch (e) { failed++; console.error(JSON.stringify({ event: "billing.reconcile_failed", customer: id, error: String(e?.message || e) })); }
  }
  return { checked: due.rows.length, synced, failed };
}

/* Expires a customer's open Checkout pages, so none of them can start a subscription later
 * (after the account is deleted, or next to a newer checkout). Returns how many it expired.
 * Throws (503) unless Stripe confirms that no checkout for the customer is still open. */
export async function expireOpenCheckouts(customerId, { stripe }) {
  if (!CUSTOMER_ID.test(String(customerId || ""))) throw failure(400, "Invalid Stripe customer");
  const unconfirmed = () => failure(503, "Could not close an open Stripe checkout. Try again shortly.");
  let expired = 0;
  for (const session of await listAll(stripe, "/checkout/sessions", { customer: customerId, status: "open" })) {
    if (session?.status && session.status !== "open") continue;
    if (!CHECKOUT_ID.test(String(session?.id || ""))) throw unconfirmed();
    try { await stripe.post("/checkout/sessions/" + session.id + "/expire"); expired++; }
    catch {
      // It may have completed or expired in the meantime: confirm before giving up.
      const now = await stripe.get("/checkout/sessions/" + session.id).catch(() => null);
      if (!now || !now.status || now.status === "open") throw unconfirmed();
    }
  }
  return expired;
}

// Cancels one subscription immediately; resolves only once Stripe confirms it has ended.
async function cancelOne(id, { stripe }) {
  if (!SUBSCRIPTION_ID.test(String(id || ""))) throw failure(400, "Invalid Stripe subscription");
  try {
    const result = await stripe.del("/subscriptions/" + id);
    if (!result?.status || ENDED_STATUSES.includes(result.status)) return result?.status || "canceled";
  } catch { /* confirm below */ }
  // It may already have ended (or not exist in this Stripe account): confirm before giving up.
  try {
    const sub = await stripe.get("/subscriptions/" + id);
    if (ENDED_STATUSES.includes(sub?.status)) return sub.status;
  } catch (e) {
    if (e?.stripeStatus === 404) return "missing";
  }
  throw failure(503, "Stripe did not confirm the cancellation");
}

/* Before an account is deleted: make sure nothing in Stripe can bill it again.
 *   1. Expire the customer's open Checkout pages (one completed later would start a
 *      subscription for an account that no longer exists).
 *   2. Ask Stripe for ALL of the customer's subscriptions and cancel every one that can
 *      still bill (anything not canceled or incomplete_expired), whatever its Price. The
 *      saved subscription ID can be missing or stale: the webhook may not have arrived,
 *      it may be misconfigured, or the customer may have more than one subscription.
 *   3. Fallback: also cancel the saved subscription ID if Stripe did not list it.
 * Throws 503 (user-safe message) unless Stripe confirms every step; then nothing is deleted. */
export async function cancelSubscriptionForDeletion(row, { stripe }) {
  const blocked = () => failure(503, "We could not cancel your Insidir subscription with Stripe, so your account was not deleted. Try again in a few minutes, or contact hello@aethric.llc.");
  const customer = row?.stripe_customer_id || null;
  const pending = new Map(); // subscription id -> status
  const listed = new Set();
  if (customer) {
    if (!CUSTOMER_ID.test(String(customer))) throw blocked();
    try { await expireOpenCheckouts(customer, { stripe }); }
    catch (e) { if (!missingInStripe(e)) throw blocked(); }
    let subscriptions = [];
    try { subscriptions = await listCustomerSubscriptions(customer, { stripe }); }
    catch (e) { if (!missingInStripe(e)) throw blocked(); }
    for (const sub of subscriptions) {
      listed.add(sub?.id);
      if (canStillBill(sub)) pending.set(sub?.id, statusOf(sub));
    }
  }
  const saved = row?.stripe_subscription_id || null;
  if (saved && !listed.has(saved) && canStillBill(row)) pending.set(saved, statusOf(row) || null);
  if (!pending.size) return { required: false, canceled: false, count: 0 };
  // Cancel every one we can, then refuse if any could not be confirmed.
  let canceled = 0, failed = 0;
  for (const id of pending.keys()) {
    try { await cancelOne(id, { stripe }); canceled++; } catch { failed++; }
  }
  if (failed) throw blocked();
  return { required: true, canceled: canceled > 0, count: canceled };
}

/* Deletes an account: stop every Stripe subscription and checkout FIRST, then revoke a
 * brokerage grant, then remove the user (sessions, watchlist, notes and holdings cascade).
 * If Stripe cannot confirm, nothing is deleted. */
export async function deleteAccount(user, { stripe, query = dbQuery, revokeBrokerage = async () => false } = {}) {
  return exclusiveBilling(user.id, async () => {
    const row = (await query("SELECT stripe_customer_id,stripe_subscription_id,subscription_status FROM users WHERE id=$1", [user.id])).rows[0];
    if (!row) throw failure(401, "Sign in required");
    const cancellation = await cancelSubscriptionForDeletion(row, { stripe });
    if (cancellation.canceled) await query("UPDATE users SET subscription_status='canceled' WHERE id=$1", [user.id]);
    await revokeBrokerage(user.id);
    await query("DELETE FROM users WHERE id=$1", [user.id]);
    return { deleted: true, subscriptionCanceled: cancellation.canceled };
  });
}

/* Safety net: an Insidir checkout (its metadata names the Insidir account) that completes
 * after that account was deleted would bill a customer nobody can reach. Cancel it. A
 * checkout from anything else on the same Stripe account is never touched. */
export async function cancelOrphanCheckout(session, ref, { stripe, query = dbQuery }) {
  if (!ref || session?.metadata?.insidir_user_id !== ref || !SUBSCRIPTION_ID.test(String(session?.subscription || ""))) return false;
  const owner = await query("SELECT 1 FROM users WHERE id=$1 OR stripe_customer_id=$2 LIMIT 1", [ref, session.customer]);
  if (owner.rows.length) return false;
  await cancelOne(session.subscription, { stripe });
  console.warn("Billing: cancelled subscription " + session.subscription + " of customer " + session.customer + ": its Insidir account was deleted before checkout completed. Refund the first invoice in Stripe if it was paid.");
  return true;
}

const hits = new Map();
function limited(key, limit, windowMs) {
  const now = Date.now();
  if (hits.size > 10000) for (const [k, v] of hits) if (v.until < now) hits.delete(k);
  const v = hits.get(key);
  if (!v || v.until <= now) { hits.set(key, { count: 1, until: now + windowMs }); return false; }
  return ++v.count > limit;
}

async function readBody(req, limit = 65536) {
  const chunks = []; let bytes = 0;
  for await (const chunk of req) { bytes += chunk.length; if (bytes > limit) throw failure(413, "Payload too large"); chunks.push(chunk); }
  return Buffer.concat(chunks);
}

function publicOrigin(settings) {
  if (!settings.publicUrl) throw failure(503, "Public website URL is not configured");
  let u;
  try { u = new URL(settings.publicUrl); } catch { throw failure(503, "Public website URL is invalid"); }
  if (u.protocol !== "https:") throw failure(503, "HTTPS required");
  return u.origin;
}

/* /v1/billing/* — open to signed-in accounts without a subscription (this is where they get one). */
export async function billingRoutes(req, res, p, json, deps = {}) {
  const env = deps.env || process.env;
  const settings = billingSettings(env);
  const query = deps.query || dbQuery;
  const loadUser = deps.currentUser || currentUser;
  const stripe = deps.stripe || createStripeClient({ secretKey: settings.secretKey });
  const method = req.method || "GET";
  const signedIn = async () => { const u = await loadUser(req); if (!u) throw failure(401, "Sign in required"); return u; };
  const sameOrigin = () => { const o = req.headers.origin; return !!o && o === publicOrigin(settings); };

  if (p === "/v1/billing/status" && method === "GET") {
    const u = await signedIn();
    let row = (await query("SELECT email,stripe_customer_id,stripe_subscription_id,subscription_status,current_period_end FROM users WHERE id=$1", [u.id])).rows[0];
    if (!row) throw failure(401, "Sign in required");
    // ?refresh=1 (e.g. right after checkout) re-reads Stripe in case the webhook has not arrived yet.
    const url = new URL(req.url || "/", "http://localhost");
    if (url.searchParams.get("refresh") === "1" && settings.secretKey && row.stripe_customer_id && !limited("billing-refresh:" + u.id, 12, 60_000)) {
      try { const synced = await syncCustomer(row.stripe_customer_id, { stripe, query, priceId: settings.priceId }); if (synced) row = { ...row, ...synced }; }
      catch (e) { console.warn("Stripe refresh failed:", e?.message); }
    }
    const access = accessSummary(row, env);
    return json(res, 200, { billingEnabled: access.billingEnabled, plan: access.plan, active: access.active, complimentary: access.complimentary,
      subscriptionStatus: access.status, currentPeriodEnd: access.currentPeriodEnd, hasCustomer: !!row.stripe_customer_id });
  }

  if (p === "/v1/billing/checkout" && method === "POST") {
    if (!settings.enabled) throw failure(503, "Checkout is not available yet. Contact hello@aethric.llc.");
    if (!sameOrigin()) throw failure(403, "Untrusted origin");
    const u = await signedIn();
    if (limited("checkout:" + u.id, 10, 15 * 60_000)) throw failure(429, "Too many checkout attempts. Try again shortly.");
    return exclusiveBilling(u.id, async () => {
      const row = (await query("SELECT email,stripe_customer_id,subscription_status FROM users WHERE id=$1", [u.id])).rows[0];
      if (!row) throw failure(401, "Sign in required");
      let customer = row.stripe_customer_id;
      if (customer) {
        // Stripe, not the stored status, decides: a checkout that completed before its webhook
        // arrived already has a subscription, and paying again would bill twice.
        let subscriptions = null;
        try { subscriptions = await listCustomerSubscriptions(customer, { stripe }); }
        catch (e) { if (!missingInStripe(e)) throw failure(503, "Could not confirm your subscription with Stripe. Try again shortly."); }
        if (subscriptions) {
          await storeSubscriptions(customer, subscriptions, { query, priceId: settings.priceId });
          const live = pickSubscription(subscriptions.filter(canStillBill), settings.priceId);
          if (live) throw failure(409, BLOCKS_CHECKOUT[statusOf(live)] || BLOCKS_CHECKOUT_OTHER);
          // Only the newest checkout page can be paid; earlier open ones are closed.
          await expireOpenCheckouts(customer, { stripe });
        } else {
          // The stored customer does not exist in this Stripe account (e.g. test-mode data
          // after switching to live keys): start again with a new customer.
          await query("UPDATE users SET stripe_customer_id=NULL,stripe_subscription_id=NULL WHERE id=$1 AND stripe_customer_id=$2", [u.id, customer]);
          customer = null;
        }
      } else {
        const blocked = BLOCKS_CHECKOUT[String(row.subscription_status || "").trim().toLowerCase()];
        if (blocked) throw failure(409, blocked);
      }
      if (!customer) {
        const created = await stripe.post("/customers", { email: row.email || u.email, "metadata[insidir_user_id]": u.id });
        const saved = await query("UPDATE users SET stripe_customer_id=$1 WHERE id=$2 AND stripe_customer_id IS NULL RETURNING stripe_customer_id", [created.id, u.id]);
        customer = saved.rows[0]?.stripe_customer_id || (await query("SELECT stripe_customer_id FROM users WHERE id=$1", [u.id])).rows[0]?.stripe_customer_id;
        if (!customer) throw failure(503, "Could not prepare checkout. Try again shortly.");
      }
      const site = publicOrigin(settings);
      const session = await stripe.post("/checkout/sessions", { mode: "subscription", customer, "line_items[0][price]": settings.priceId, "line_items[0][quantity]": "1",
        client_reference_id: u.id, success_url: site + "/billing.html?checkout=success", cancel_url: site + "/subscribe.html?checkout=cancel",
        "subscription_data[metadata][insidir_user_id]": u.id, "metadata[insidir_user_id]": u.id });
      if (typeof session.url !== "string" || !session.url.startsWith("https://")) throw failure(503, "Stripe did not return a checkout page. Try again shortly.");
      return json(res, 200, { url: session.url });
    });
  }

  if (p === "/v1/billing/portal" && method === "POST") {
    if (!settings.enabled) throw failure(503, "The billing portal is not available yet. Contact hello@aethric.llc.");
    if (!sameOrigin()) throw failure(403, "Untrusted origin");
    const u = await signedIn();
    const row = (await query("SELECT stripe_customer_id FROM users WHERE id=$1", [u.id])).rows[0];
    if (!row?.stripe_customer_id) throw failure(404, "No subscription found for this account");
    const portal = await stripe.post("/billing_portal/sessions", { customer: row.stripe_customer_id, return_url: publicOrigin(settings) + "/billing.html" });
    return json(res, 200, { url: portal.url });
  }

  if (p === "/v1/billing/webhook" && method === "POST") {
    if (!settings.webhookSecret) throw failure(503, "Insidir Stripe webhook is not configured");
    const raw = await readBody(req);
    if (!verifyStripeSignature(raw, req.headers["stripe-signature"], settings.webhookSecret)) throw failure(400, "Invalid webhook signature");
    let event;
    try { event = JSON.parse(raw); } catch { throw failure(400, "Invalid webhook payload"); }
    const supported = ["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted",
      "customer.subscription.paused", "customer.subscription.resumed"];
    if (!supported.includes(event?.type) || typeof event.id !== "string") return json(res, 200, { received: true });
    const fresh = await query("INSERT INTO stripe_events(event_id) VALUES($1) ON CONFLICT DO NOTHING RETURNING event_id", [event.id]);
    if (!fresh.rows.length) return json(res, 200, { received: true, duplicate: true });
    const obj = event.data?.object || {};
    try {
      if (event.type === "checkout.session.completed" && obj.mode === "subscription" && CUSTOMER_ID.test(String(obj.customer || ""))) {
        const ref = USER_ID.test(String(obj.client_reference_id || "")) ? obj.client_reference_id : null;
        if (ref) await query("UPDATE users SET stripe_customer_id=$1 WHERE id=$2 AND (stripe_customer_id IS NULL OR stripe_customer_id=$1)", [obj.customer, ref]);
        await syncCustomer(obj.customer, { stripe, query, priceId: settings.priceId });
        await cancelOrphanCheckout(obj, ref, { stripe, query });
      }
      if (event.type.startsWith("customer.subscription.")) await syncCustomer(obj.customer, { stripe, query, priceId: settings.priceId });
    } catch (e) {
      // Let Stripe retry: forget the event so the retry is processed.
      await query("DELETE FROM stripe_events WHERE event_id=$1", [event.id]);
      throw e;
    }
    return json(res, 200, { received: true });
  }
  return false;
}
