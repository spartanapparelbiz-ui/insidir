/* A stateful, in-process imitation of the parts of the Stripe API the engine calls, for lifecycle tests.
 * It is a SIMULATOR: it encodes our reading of Stripe's documented behaviour (trialing → active on the first
 * renewal, past_due on a failed renewal, cancel_at_period_end, list paging), not Stripe itself. Passing tests
 * against it are not Stripe test-mode verification; scripts/stripe-test-mode-check.mjs is. */
import { createHmac, randomBytes } from "node:crypto";

const id = prefix => prefix + "_" + randomBytes(9).toString("hex");
const DAY = 86400;

export function stripeSimulator({ priceId = "price_pro", planCents = 3900, now = () => Math.floor(Date.now() / 1000) } = {}) {
  const customers = new Map(), sessions = new Map(), subs = new Map(), charges = new Map();
  const calls = [];
  const event = (type, object, previous_attributes) => ({ id: id("evt"), type, created: now(), data: { object: structuredClone(object), ...(previous_attributes ? { previous_attributes } : {}) } });
  const subItems = periodEnd => ({ data: [{ id: id("si"), price: { id: priceId, unit_amount: planCents, recurring: { interval: "month" } }, current_period_end: periodEnd }] });
  const invoice = (sub, reason, amount, { paid = true, periodEnd } = {}) => {
    const charge = paid && amount > 0 ? { id: id("ch"), customer: sub.customer, amount, amount_refunded: 0 } : null;
    if (charge) charges.set(charge.id, charge);
    const lines = [{ price: { id: priceId }, amount: reason === "subscription_create" && sub.status === "trialing" ? 0 : planCents, period: { end: periodEnd } }];
    if (reason === "subscription_create" && sub.status === "trialing") lines.unshift({ price: { id: "price_data_trial_fee" }, amount, period: { end: periodEnd } });
    return { id: id("in"), object: "invoice", customer: sub.customer, subscription: sub.id, billing_reason: reason, status: paid ? "paid" : "open",
      currency: "usd", amount_paid: paid ? amount : 0, amount_due: amount, attempt_count: 1, charge: charge?.id || null, lines: { data: lines } };
  };
  const list = (items, params) => {
    const all = [...items];
    let start = 0;
    if (params?.starting_after) start = all.findIndex(x => x.id === params.starting_after) + 1;
    const limit = Number(params?.limit || 10);
    return { object: "list", data: all.slice(start, start + limit), has_more: start + limit < all.length };
  };
  const notFound = () => Object.assign(new Error("No such resource"), { status: 400, stripeStatus: 404, stripeCode: "resource_missing" });

  async function handle(method, path, params = {}) {
    calls.push({ method, path, params });
    let m;
    if (method === "POST" && path === "/customers") { const c = { id: id("cus"), email: params.email, metadata: { insidir_user_id: params["metadata[insidir_user_id]"] } }; customers.set(c.id, c); return c; }
    if (method === "POST" && path === "/checkout/sessions") {
      const trialDays = Number(params["subscription_data[trial_period_days]"] || 0);
      const fee = Number(params["line_items[1][price_data][unit_amount]"] || 0);
      const s = { id: id("cs_test"), object: "checkout.session", mode: params.mode, status: "open", customer: params.customer, client_reference_id: params.client_reference_id,
        metadata: { insidir_user_id: params["metadata[insidir_user_id]"], insidir_consent_id: params["metadata[insidir_consent_id]"] },
        amount_total: trialDays ? fee : planCents, url: "https://checkout.stripe.test/c/" + randomBytes(6).toString("hex"), params, subscription: null };
      if (params["line_items[0][price]"] !== priceId) throw Object.assign(new Error("No such price"), { status: 400 });
      sessions.set(s.id, s); return s;
    }
    if (method === "GET" && path === "/checkout/sessions") return list([...sessions.values()].filter(s => s.customer === params.customer && (!params.status || s.status === params.status)), params);
    if ((m = /^\/checkout\/sessions\/([^/]+)\/expire$/.exec(path)) && method === "POST") { const s = sessions.get(m[1]); if (!s) throw notFound(); if (s.status !== "open") throw Object.assign(new Error("not open"), { status: 400 }); s.status = "expired"; return s; }
    if ((m = /^\/checkout\/sessions\/([^/]+)$/.exec(path)) && method === "GET") { const s = sessions.get(m[1]); if (!s) throw notFound(); return s; }
    if (method === "GET" && path === "/subscriptions") {
      if (params.customer && !customers.has(params.customer)) throw notFound();
      return list([...subs.values()].filter(s => s.customer === params.customer).sort((a, b) => b.created - a.created), params);
    }
    if ((m = /^\/subscriptions\/([^/]+)$/.exec(path))) {
      const s = subs.get(m[1]);
      if (!s) throw notFound();
      if (method === "GET") return s;
      if (method === "POST") { if (params.cancel_at_period_end === "true") s.cancel_at_period_end = true; if (params.cancel_at_period_end === "false") s.cancel_at_period_end = false; return s; }
      if (method === "DELETE") { s.status = "canceled"; s.canceled_at = now(); return s; }
    }
    if ((m = /^\/charges\/([^/]+)$/.exec(path)) && method === "GET") { const c = charges.get(m[1]); if (!c) throw notFound(); return c; }
    if (method === "POST" && path === "/billing_portal/sessions") return { url: "https://billing.stripe.test/p/" + randomBytes(6).toString("hex") };
    throw new Error("simulator: unhandled " + method + " " + path);
  }
  const client = { get: (p, q) => handle("GET", p, q), post: (p, q) => handle("POST", p, q), del: (p, q) => handle("DELETE", p, q) };

  return {
    client, calls, sessions, subs, charges,
    /* The customer pays on the Checkout page. Returns the events Stripe would send, in Stripe's usual order. */
    completeCheckout(sessionId) {
      const s = sessions.get(sessionId);
      if (!s || s.status !== "open") throw new Error("checkout not open");
      const trialDays = Number(s.params["subscription_data[trial_period_days]"] || 0);
      const t = now(), end = t + (trialDays ? trialDays * DAY : 30 * DAY);
      const sub = { id: id("sub"), object: "subscription", customer: s.customer, status: trialDays ? "trialing" : "active", created: t, cancel_at_period_end: false,
        trial_end: trialDays ? end : null, current_period_end: end, items: subItems(end), metadata: { insidir_user_id: s.client_reference_id } };
      subs.set(sub.id, sub);
      s.status = "complete"; s.subscription = sub.id;
      const inv = invoice(sub, "subscription_create", trialDays ? s.amount_total : planCents, { periodEnd: end });
      return { subscription: sub, invoice: inv, events: [event("checkout.session.completed", s), event("customer.subscription.created", sub), event("invoice.paid", inv)] };
    },
    trialWillEnd(subId) { return [event("customer.subscription.trial_will_end", subs.get(subId))]; },
    /* The period ends: renew (card ok), fail (past_due), or end (cancel_at_period_end). */
    endPeriod(subId, { card = "ok" } = {}) {
      const sub = subs.get(subId);
      if (sub.cancel_at_period_end) { sub.status = "canceled"; return [event("customer.subscription.deleted", sub)]; }
      const previous = { status: sub.status };
      if (card === "fail") {
        sub.status = "past_due";
        const inv = invoice(sub, "subscription_cycle", planCents, { paid: false, periodEnd: sub.current_period_end + 30 * DAY });
        return [event("invoice.payment_failed", inv), event("customer.subscription.updated", sub, previous)];
      }
      const end = sub.current_period_end + 30 * DAY;
      sub.status = "active"; sub.trial_end = sub.trial_end && null; sub.current_period_end = end; sub.items = subItems(end);
      const inv = invoice(sub, "subscription_cycle", planCents, { periodEnd: end });
      return [event("customer.subscription.updated", sub, previous), event("invoice.paid", inv)];
    },
    cancelViaPortal(subId) { const sub = subs.get(subId); sub.cancel_at_period_end = true; return [event("customer.subscription.updated", sub, { cancel_at_period_end: false })]; },
    refund(chargeId, amount) { const c = charges.get(chargeId); c.amount_refunded = amount ?? c.amount; return [event("charge.refunded", c)]; },
    dispute(chargeId) { return [event("charge.dispute.created", { id: id("dp"), object: "dispute", charge: chargeId, amount: charges.get(chargeId).amount, reason: "fraudulent" })]; }
  };
}

export function signedWebhook(event, secret, t = Math.floor(Date.now() / 1000)) {
  const raw = JSON.stringify(event);
  return { raw, signature: `t=${t},v1=` + createHmac("sha256", secret).update(t + "." + raw).digest("hex") };
}
