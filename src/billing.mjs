/* Insidir billing: one plan, Insidir Pro at $39/month (the configured Stripe Price), started with a
 * paid trial: $1 at checkout for 3 days of full access, then $39 a month until cancelled (trialSettings
 * in config.mjs). One trial per account: an account that has trialled before, or whose Stripe customer
 * has ever had a subscription for the plan, checks out at the full price.
 *
 * Stripe is the source of truth for a subscription. Webhooks and the billing-status
 * refresh both re-read the customer's subscriptions from Stripe, so events that arrive
 * late or out of order can never leave a paying member locked out (or a cancelled one
 * let in). Only subscriptions for the exact configured Price grant access.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { query as dbQuery } from "./db.mjs";
import { currentUser } from "./auth.mjs";
import { billingSettings, trialSettings } from "./config.mjs";
import { accessSummary } from "./paywall.mjs";
import { recordFirstPaidInvoice } from "./creator-program.mjs";

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

/* ---------- the offer a customer is agreeing to ----------
 * One function decides what a checkout will charge (the trial or the full price) and words the automatic-renewal
 * terms the customer must accept, so the subscribe page, the consent record and Stripe all say the same thing.
 * DISCLOSURE_VERSION changes whenever the wording does. */
export const DISCLOSURE_VERSION = "2026-10-18";
export const PLAN_CENTS = 3900;
const usd = cents => "$" + (cents / 100).toFixed(2);
const longDate = d => d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
export function currentOffer({ trialUsed = false, trial = trialSettings(), now = Date.now() } = {}) {
  const eligible = trial.enabled && !trialUsed;
  const kind = eligible ? "trial" : "full";
  const todayCents = eligible ? trial.feeCents : PLAN_CENTS;
  const trialDays = eligible ? trial.days : 0;
  const firstRenewal = new Date(now + (eligible ? trial.days : 30) * 86400_000);
  const disclosure = eligible
    ? `You agree to pay ${usd(todayCents)} today for a ${trialDays}-day trial of Insidir Pro. Unless you cancel before your trial ends (on or about ${longDate(firstRenewal)}), your subscription renews automatically and your payment method is charged ${usd(PLAN_CENTS)} per month, starting when the trial ends and then every month, until you cancel. You can cancel any time online from Billing in your account; cancelling stops future charges.`
    : `You agree to pay ${usd(PLAN_CENTS)} today for one month of Insidir Pro. Your subscription renews automatically and your payment method is charged ${usd(PLAN_CENTS)} every month (next on or about ${longDate(firstRenewal)}) until you cancel. You can cancel any time online from Billing in your account; cancelling stops future charges and access continues to the end of the period you paid for.`;
  return { kind, todayCents, recurringCents: PLAN_CENTS, trialDays, firstRenewalAt: firstRenewal.toISOString(), disclosure, disclosureVersion: DISCLOSURE_VERSION };
}
// Without a stored trial or any stored subscription, the account looks eligible; checkout re-checks with Stripe.
export const trialUsedFromRow = row => !!(row?.trial_started_at || row?.stripe_subscription_id || (row?.subscription_status && row.subscription_status !== "inactive"));

async function readJson(req, limit = 4096) {
  if (!/^application\/json(?:\s*;|$)/i.test(String(req.headers?.["content-type"] || ""))) throw failure(415, "Expected application/json");
  const raw = await readBody(req, limit);
  if (!raw.length) return {};
  try { return JSON.parse(raw.toString("utf8")); } catch { throw failure(400, "Invalid JSON"); }
}
async function logBillingEvent(query, { userId = null, customer = null, kind, detail = {} }) {
  try { await query("INSERT INTO billing_events(user_id,stripe_customer_id,kind,detail) VALUES($1,$2,$3,$4)", [userId, customer, kind, JSON.stringify(detail)]); }
  catch (e) { console.error(JSON.stringify({ event: "billing.event_log_failed", kind, error: String(e?.message || e) })); }
}

/* The Checkout fields that start the paid trial: the one-time fee on the first invoice, the trial days
 * on the subscription, a card collected up front so the plan can renew, and the terms in Stripe's own
 * words beside the pay button. Without a card at the trial's end the subscription is cancelled. */
export function trialCheckoutParams({ days, feeCents }) {
  const fee = "$" + (feeCents / 100).toFixed(feeCents % 100 ? 2 : 0);
  return {
    "subscription_data[trial_period_days]": String(days),
    "subscription_data[trial_settings][end_behavior][missing_payment_method]": "cancel",
    "line_items[1][price_data][currency]": "usd",
    "line_items[1][price_data][unit_amount]": String(feeCents),
    "line_items[1][price_data][product_data][name]": `Insidir ${days}-day trial`,
    "line_items[1][quantity]": "1",
    payment_method_collection: "always",
    "custom_text[submit][message]": `You pay ${fee} today for ${days} days of Insidir. Unless you cancel before the trial ends, Insidir Pro then renews at $39 a month. Cancel any time from Billing.`
  };
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
  const fields = { stripe_subscription_id: best.id, subscription_status: String(best.status || "inactive"), current_period_end: periodEnd(best, priceId),
    cancel_at_period_end: best.cancel_at_period_end === true || (Number(best.cancel_at) > 0 && !ENDED_STATUSES.includes(statusOf(best))) };
  // trial_started_at is set once, the first time a subscription is seen trialing; it never resets.
  await query(`UPDATE users SET stripe_subscription_id=$1,subscription_status=$2,current_period_end=$3,
    trial_started_at=CASE WHEN $2='trialing' THEN COALESCE(trial_started_at,now()) ELSE trial_started_at END,cancel_at_period_end=$5 WHERE stripe_customer_id=$4`,
    [fields.stripe_subscription_id, fields.subscription_status, fields.current_period_end, customerId, fields.cancel_at_period_end]);
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
    let row = (await query("SELECT email,stripe_customer_id,stripe_subscription_id,subscription_status,current_period_end,trial_started_at,cancel_at_period_end FROM users WHERE id=$1", [u.id])).rows[0];
    if (!row) throw failure(401, "Sign in required");
    // ?refresh=1 (e.g. right after checkout) re-reads Stripe in case the webhook has not arrived yet.
    const url = new URL(req.url || "/", "http://localhost");
    if (url.searchParams.get("refresh") === "1" && settings.secretKey && row.stripe_customer_id && !limited("billing-refresh:" + u.id, 12, 60_000)) {
      try { const synced = await syncCustomer(row.stripe_customer_id, { stripe, query, priceId: settings.priceId }); if (synced) row = { ...row, ...synced }; }
      catch (e) { console.warn("Stripe refresh failed:", e?.message); }
    }
    const access = accessSummary(row, env);
    return json(res, 200, { billingEnabled: access.billingEnabled, plan: access.plan, active: access.active, complimentary: access.complimentary,
      subscriptionStatus: access.status, currentPeriodEnd: access.currentPeriodEnd, hasCustomer: !!row.stripe_customer_id,
      cancelAtPeriodEnd: row.cancel_at_period_end === true, offer: currentOffer({ trialUsed: trialUsedFromRow(row), trial: trialSettings(env) }) });
  }

  if (p === "/v1/billing/checkout" && method === "POST") {
    if (!settings.enabled) throw failure(503, "Checkout is not available yet. Contact hello@aethric.llc.");
    if (!sameOrigin()) throw failure(403, "Untrusted origin");
    const u = await signedIn();
    if (limited("checkout:" + u.id, 10, 15 * 60_000)) throw failure(429, "Too many checkout attempts. Try again shortly.");
    // Express, informed consent to the automatic-renewal terms comes first, separately from the Terms of Service:
    // the customer ticks a box beside the exact terms and the page sends what it showed.
    const consent = await readJson(req);
    if (consent?.consent !== true || !["trial", "full"].includes(consent?.offer) || consent?.disclosureVersion !== DISCLOSURE_VERSION)
      throw failure(400, "Please review the subscription terms and tick the box to agree to them before checkout.");
    return exclusiveBilling(u.id, async () => {
      const row = (await query("SELECT email,stripe_customer_id,subscription_status,trial_started_at FROM users WHERE id=$1", [u.id])).rows[0];
      if (!row) throw failure(401, "Sign in required");
      let customer = row.stripe_customer_id;
      // One trial per account: none after an earlier trial, or once the customer has had any subscription for the plan.
      let trialUsed = !!row.trial_started_at;
      if (customer) {
        // Stripe, not the stored status, decides: a checkout that completed before its webhook
        // arrived already has a subscription, and paying again would bill twice.
        let subscriptions = null;
        try { subscriptions = await listCustomerSubscriptions(customer, { stripe }); }
        catch (e) { if (!missingInStripe(e)) throw failure(503, "Could not confirm your subscription with Stripe. Try again shortly."); }
        if (subscriptions) {
          if (subscriptions.some(sub => hasPrice(sub, settings.priceId))) trialUsed = true;
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
      const trial = trialSettings(env);
      // The customer agreed to one offer; if Stripe's history changes it (a returning customer pays the full price),
      // nothing is charged until they see and accept the terms that apply.
      const offer = currentOffer({ trialUsed: !trial.enabled || trialUsed, trial });
      if (offer.kind !== consent.offer) throw failure(409, offer.kind === "full"
        ? "This account has already used its trial, so checkout would charge $39.00 today. Review the updated terms and agree again to continue."
        : "This account is eligible for the $1 trial. Review the updated terms and agree again to continue.", { offer });
      const consentRow = await query(`INSERT INTO billing_consents(user_id,email,offer,amount_today_cents,recurring_cents,trial_days,disclosure_version,disclosure_text,ip,user_agent)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [u.id, row.email || u.email, offer.kind, offer.todayCents, offer.recurringCents, offer.trialDays, offer.disclosureVersion, offer.disclosure,
          String(req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",").at(-1).trim().slice(0, 64) || null,
          String(req.headers?.["user-agent"] || "").slice(0, 300) || null]);
      const consentId = String(consentRow.rows?.[0]?.id ?? "");
      const params = { mode: "subscription", customer, "managed_payments[enabled]": "false", "line_items[0][price]": settings.priceId, "line_items[0][quantity]": "1",
        client_reference_id: u.id, success_url: site + "/billing.html?checkout=success", cancel_url: site + "/subscribe.html?checkout=cancel",
        "subscription_data[metadata][insidir_user_id]": u.id, "metadata[insidir_user_id]": u.id,
        "metadata[insidir_consent_id]": consentId, "subscription_data[metadata][insidir_consent_id]": consentId,
        "custom_text[submit][message]": "By subscribing you authorize Insidir to charge $39.00 per month until you cancel. Cancel any time from Billing." };
      if (offer.kind === "trial") Object.assign(params, trialCheckoutParams(trial));
      const session = await stripe.post("/checkout/sessions", params);
      if (consentId && typeof session.id === "string") await query("UPDATE billing_consents SET stripe_checkout_id=$1 WHERE id=$2", [session.id, consentId]).catch(() => {});
      if (typeof session.url !== "string" || !session.url.startsWith("https://")) throw failure(503, "Stripe did not return a checkout page. Try again shortly.");
      return json(res, 200, { url: session.url });
    });
  }

  /* POST /v1/billing/cancel: cancel online, in one step, in the same place the customer signed up. The subscription
   * stops renewing at the end of the period already paid for (for a trial: at the trial's end, so the $39 is never
   * charged). Works even when Stripe's portal is not configured for cancellation. */
  if (p === "/v1/billing/cancel" && method === "POST") {
    if (!settings.secretKey) throw failure(503, "Billing is not connected. Email hello@aethric.llc and we will cancel for you.");
    if (!sameOrigin()) throw failure(403, "Untrusted origin");
    const u = await signedIn();
    if (limited("cancel:" + u.id, 10, 15 * 60_000)) throw failure(429, "Too many attempts. Try again shortly.");
    return exclusiveBilling(u.id, async () => {
      const row = (await query("SELECT stripe_customer_id FROM users WHERE id=$1", [u.id])).rows[0];
      if (!row?.stripe_customer_id) throw failure(404, "No subscription found for this account");
      const subscriptions = await listCustomerSubscriptions(row.stripe_customer_id, { stripe });
      const live = subscriptions.filter(sub => canStillBill(sub) && sub.status !== "incomplete");
      if (!live.length) { await storeSubscriptions(row.stripe_customer_id, subscriptions, { query, priceId: settings.priceId }); return json(res, 200, { canceled: false, alreadyCanceled: true }); }
      for (const sub of live) {
        if (!SUBSCRIPTION_ID.test(String(sub.id || ""))) throw failure(503, "Stripe returned an unexpected subscription");
        if (sub.cancel_at_period_end === true) continue;
        await stripe.post("/subscriptions/" + sub.id, { cancel_at_period_end: "true", "metadata[insidir_canceled_via]": "insidir_billing" });
      }
      const stored = await syncCustomer(row.stripe_customer_id, { stripe, query, priceId: settings.priceId });
      await logBillingEvent(query, { userId: u.id, customer: row.stripe_customer_id, kind: "cancel_requested", detail: { subscriptions: live.map(s => s.id), accessUntil: stored?.current_period_end ?? null } });
      return json(res, 200, { canceled: true, accessUntil: stored?.current_period_end ? new Date(stored.current_period_end).toISOString() : null,
        message: "Your subscription is cancelled. You will not be charged again, and access continues until the end of the current period." });
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
      "customer.subscription.paused", "customer.subscription.resumed", "invoice.paid",
      "charge.refunded", "charge.dispute.created", "invoice.payment_failed", "customer.subscription.trial_will_end"];
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
      if (event.type.startsWith("customer.subscription.") && event.type !== "customer.subscription.trial_will_end") await syncCustomer(obj.customer, { stripe, query, priceId: settings.priceId });
      // Refunds and chargebacks: recorded, and any creator commission for that customer goes back to manual review.
      if (event.type === "charge.refunded" || event.type === "charge.dispute.created") {
        let customer = CUSTOMER_ID.test(String(obj.customer || "")) ? obj.customer : null;
        if (!customer && /^(ch|py)_[A-Za-z0-9]+$/.test(String(obj.charge || ""))) customer = (await stripe.get("/charges/" + obj.charge).catch(() => null))?.customer || null;
        if (CUSTOMER_ID.test(String(customer || ""))) {
          await query("UPDATE creator_commissions SET status='needs_review' WHERE stripe_customer_id=$1 AND status IN ('pending','approved')", [customer]);
          await logBillingEvent(query, { customer, kind: event.type === "charge.refunded" ? "refund" : "dispute", detail: { id: obj.id, amount: obj.amount ?? obj.amount_refunded ?? null, reason: obj.reason ?? null } });
        }
      }
      if (event.type === "invoice.payment_failed" && CUSTOMER_ID.test(String(obj.customer || ""))) {
        await logBillingEvent(query, { customer: obj.customer, kind: "payment_failed", detail: { invoice: obj.id, attempt: obj.attempt_count ?? null } });
        await syncCustomer(obj.customer, { stripe, query, priceId: settings.priceId });
      }
      if (event.type === "customer.subscription.trial_will_end" && CUSTOMER_ID.test(String(obj.customer || "")))
        await logBillingEvent(query, { customer: obj.customer, kind: "trial_will_end", detail: { subscription: obj.id, trialEnd: obj.trial_end ?? null } });
      // The first $39 payment: the plan's first invoice, or after a paid trial its first renewal (the trial
      // invoice carries only the trial fee and is never eligible). One commission per referred account.
      if (event.type === "invoice.paid" && (obj.billing_reason === "subscription_create" || obj.billing_reason === "subscription_cycle")) {
        // Re-read Stripe to verify that the customer's actual subscription is active
        // on Insidir's exact Price, not just any invoice marked paid.
        const plans = /^cus_[A-Za-z0-9]+$/.test(String(obj.customer||""))
          ? await listCustomerSubscriptions(obj.customer,{stripe}) : [];
        const active = pickSubscription(plans.filter(sub => sub.status === "active"), settings.priceId);
        const invoiceSub = obj.subscription || obj.parent?.subscription_details?.subscription;
        if (active && (!invoiceSub || invoiceSub === active.id))
          await recordFirstPaidInvoice(obj,{query,verifiedPlan:true});
      }
    } catch (e) {
      // Let Stripe retry: forget the event so the retry is processed.
      await query("DELETE FROM stripe_events WHERE event_id=$1", [event.id]);
      throw e;
    }
    return json(res, 200, { received: true });
  }
  return false;
}
