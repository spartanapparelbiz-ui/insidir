/* Billing (billing.html): the signed-in person's subscription, from GET /v1/me (access, complimentary)
   and GET /v1/billing/status (Stripe subscription status and period end). "Manage billing" opens
   Stripe's billing portal (POST /v1/billing/portal).

   After checkout Stripe returns here with ?checkout=success. Access is granted only by Stripe, never by
   arriving on this page, so the page asks GET /v1/billing/status?refresh=1 a few times: refresh=1 makes
   the engine re-read the customer's subscriptions from Stripe in case the webhook has not arrived yet.
   While that confirmation is pending the page never offers a second checkout: someone who has just paid
   must not be able to start (and pay for) another subscription.

   Statuses that still belong to a live Stripe subscription (past_due, unpaid, incomplete, paused) are
   fixed in the billing portal, so they get Manage billing, never Subscribe. */
(() => {
  "use strict";
  const $ = sel => document.querySelector(sel);
  const NEXT_KEY = "insidir:after-checkout";
  const PAGES = ["dashboard", "research", "explore", "company", "filings", "filing", "people", "watchlist", "portfolio", "alerts", "account"];
  const STATUS = {
    active: "Active", trialing: "Active (trial period)", past_due: "Payment past due", unpaid: "Unpaid",
    canceled: "Cancelled", incomplete: "Incomplete: the first payment needs attention", incomplete_expired: "Expired before the first payment",
    paused: "Paused", inactive: "Inactive"
  };
  /* A subscription that exists in Stripe but isn't in good standing: fix it, don't buy another. */
  const FIX = {
    past_due: { badge: "Payment due", text: "Your last payment didn't go through, so access is paused. Open Manage billing to update your payment method." },
    unpaid: { badge: "Payment due", text: "Your subscription has an unpaid invoice, so access is paused. Open Manage billing to update your payment method." },
    incomplete: { badge: "Payment pending", text: "Your first payment hasn't been completed yet. Open Manage billing to finish it. If you've only just paid, give Stripe a minute." },
    paused: { badge: "Paused", text: "Your subscription is paused, so access is paused too. Open Manage billing to resume it." }
  };
  const NO_PORTAL = " If Manage billing isn't shown, email hello@aethric.llc and we'll sort it out.";
  const message = $("#bill-status"), manage = $("#manage");
  const params = new URLSearchParams(location.search);
  const returning = params.get("checkout") === "success";
  // True from the moment Stripe sends the customer back until the subscription is confirmed active.
  let confirming = returning;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const dateText = iso => {
    const d = new Date(iso);
    return iso && !isNaN(d) ? d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "";
  };
  /* Only a known page, as a same-origin relative path, may follow checkout (see subscribe.js). */
  function storedNext() {
    let raw = null;
    try { raw = sessionStorage.getItem(NEXT_KEY); } catch (_) { return null; }
    if (typeof raw !== "string" || raw.length > 600 || /[\\\s\u0000-\u001f]/.test(raw) || raw.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return null;
    let url;
    try { url = new URL(raw, location.origin + "/"); } catch (_) { return null; }
    const m = url.origin === location.origin && /^\/([a-z]+)(?:\.html)?$/.exec(url.pathname);
    return m && PAGES.includes(m[1]) ? m[1] + ".html" + url.search : null;
  }

  async function get(path) {
    const res = await fetch(path, { credentials: "same-origin", headers: { Accept: "application/json" } });
    let data = null;
    try { data = await res.json(); } catch (_) { data = null; }
    return { status: res.status, ok: res.ok, data: data || {} };
  }
  function say(text, error) {
    message.textContent = text || "";
    message.classList.toggle("is-error", !!error);
  }
  // A Stripe subscription in good standing (what checkout produces)…
  const subscribed = bill => !!bill && (bill.plan === "pro" || ["active", "trialing"].includes(bill.subscriptionStatus));
  // …or any access at all, complimentary included (what the product checks).
  const isActive = (me, bill) => !!((me && me.access && me.access.active) || (bill && bill.active === true) || subscribed(bill));

  /* ---------- the plan sheet ---------- */
  function render(me, bill) {
    const access = (me && me.access) || {};
    const status = (bill && bill.subscriptionStatus) || access.status || null;
    const enabled = bill && typeof bill.billingEnabled === "boolean" ? bill.billingEnabled : access.billingEnabled !== false;
    const period = (bill && bill.currentPeriodEnd) || access.currentPeriodEnd || null;
    const active = isActive(me, bill);
    const fix = !active && FIX[status];
    const waiting = confirming && !active;
    const badge = $("[data-bl-badge]");
    let label, tone;
    const complimentary = !!(access.complimentary || (bill && bill.complimentary));
    if (complimentary && !["active", "trialing"].includes(status)) { label = "Complimentary"; tone = "on"; }
    else if (active) { label = "Active"; tone = "on"; }
    else if (waiting) { label = "Confirming"; tone = "wait"; } // in progress, not a problem: soft ink, pulsing
    else if (fix) { label = fix.badge; tone = "warn"; }
    else { label = "Not subscribed"; tone = "off"; }
    badge.textContent = label;
    badge.dataset.tone = tone;

    $("[data-bl-status]").textContent = complimentary && !["active", "trialing"].includes(status)
      ? "Complimentary access. There's nothing to pay."
      : waiting && !status ? "Waiting for Stripe's confirmation"
      : status ? (STATUS[status] || status.replace(/_/g, " ")) : "No subscription";
    const ended = status === "canceled" || status === "incomplete_expired";
    const stopping = !!(bill && bill.cancelAtPeriodEnd) && !ended;
    $("[data-bl-period-label]").textContent = ended ? "Ended" : stopping ? "Access ends (will not renew)" : status === "trialing" ? "Trial ends, then $39/month" : "Renews on";
    $("[data-bl-period]").textContent = dateText(period) || "—";
    $("[data-bl-method]").textContent = status ? "Held by Stripe. Update it in Manage billing." : waiting ? "With Stripe, being confirmed" : "None on file";
    if (me && me.user && me.user.email) $("[data-bl-email]").textContent = String(me.user.email);

    const customer = bill && typeof bill.hasCustomer === "boolean" ? bill.hasCustomer : !!status;
    manage.hidden = !(enabled && customer);
    // Never a second checkout while a payment is being confirmed or a live subscription needs fixing.
    $("[data-bl-subscribe]").hidden = active || !enabled || waiting || !!fix;
    $("[data-bl-dashboard]").hidden = !active;
    // Cancel online in one step, wherever the subscription can still bill and is not already set to stop.
    $("[data-bl-cancel]").hidden = !(enabled && customer && ["active", "trialing", "past_due", "unpaid"].includes(status) && !stopping);
    if (stopping && active) { say("Your subscription is cancelled and will not renew. Access continues until " + (dateText(period) || "the end of the current period") + "."); return; }
    if (waiting) say("Waiting for Stripe to confirm your payment. This page updates as soon as it does; there's no need to pay again.");
    else if (!active && !enabled) say("Checkout isn't open yet, so no payment can be taken right now. To request access, email hello@aethric.llc.");
    else if (fix) say(fix.text + (manage.hidden ? NO_PORTAL : ""), true);
    else if (!active) say("You don't have an active subscription. Subscribe to open the research workspace" + (status ? "; everything you saved is still here." : "."));
    else say("");
  }

  async function load(refresh) {
    let me, bill;
    try { [me, bill] = await Promise.all([get("/v1/me"), get("/v1/billing/status" + (refresh ? "?refresh=1" : ""))]); } catch (_) { me = bill = null; }
    if (!me || !bill) { say("We couldn't reach Insidir to check your subscription. Check your connection and reload the page.", true); return null; }
    if (me.status === 401 || bill.status === 401) {
      $("[data-bl-status]").textContent = "Not logged in";
      say("Log in to see your subscription.", true);
      return null;
    }
    if (!me.ok || !bill.ok) { say("We couldn't load your subscription just now. Please reload the page in a moment.", true); return null; }
    render(me.data, bill.data);
    return { me: me.data, bill: bill.data };
  }

  /* ---------- after checkout: wait for Stripe's confirmation ---------- */
  let polling = false;
  async function confirmCheckout(first) {
    if (polling) return;
    polling = true;
    confirming = true;
    const box = $("[data-bl-confirm]"), title = $("[data-bl-confirm-title]"), text = $("[data-bl-confirm-text]");
    const open = $("[data-bl-open]"), recheck = $("[data-bl-recheck]");
    box.hidden = false;
    box.dataset.state = "waiting";
    title.textContent = "Confirming your subscription…";
    text.textContent = "Stripe is confirming your payment with Insidir. This usually takes a few seconds.";
    open.hidden = true;
    recheck.hidden = true;
    // The first load already asked Stripe once; the engine allows 12 refreshes a minute.
    let state = first || null;
    for (let attempt = first ? 1 : 0; attempt < 6; attempt++) {
      if (attempt) await wait(2000);
      if (!state || !(subscribed(state.bill) || isActive(state.me, state.bill))) {
        let bill = null;
        try { const r = await get("/v1/billing/status?refresh=1"); bill = r.ok ? r.data : null; } catch (_) { bill = null; }
        if (bill) state = { me: state && state.me, bill };
      }
      if (state && (subscribed(state.bill) || isActive(state.me, state.bill))) {
        const next = storedNext();
        try { sessionStorage.removeItem(NEXT_KEY); } catch (_) { /* storage unavailable */ }
        confirming = false;
        polling = false;
        box.dataset.state = "active";
        title.textContent = "Your subscription is active.";
        text.textContent = "Thank you for subscribing. The whole research workspace is open to you now.";
        // A new member's overview opens on a short, optional "Get started" (assets/js/onboarding.js).
        try { if (!localStorage.getItem("insidir:onboard")) localStorage.setItem("insidir:onboard", "new"); } catch (_) { /* storage unavailable */ }
        open.setAttribute("href", next || "dashboard.html");
        open.textContent = next ? "Continue where you left off" : "Open your overview";
        open.hidden = false;
        try { history.replaceState(null, "", location.pathname); } catch (_) { /* keep the URL */ }
        render(state.me, state.bill); // the confirmed answer from Stripe, without asking again
        $("[data-bl-dashboard]").hidden = true; // the confirmation already offers the way in
        open.focus();
        return;
      }
    }
    polling = false;
    box.dataset.state = "slow";
    title.textContent = "Activation is taking longer than usual.";
    text.textContent = "Stripe hasn't confirmed the subscription to Insidir yet. Please don't pay again: check again in a minute. If it still hasn't activated after a few minutes, email hello@aethric.llc and we'll sort it out.";
    recheck.hidden = false;
    await load();
  }

  /* ---------- Stripe billing portal ---------- */
  manage.addEventListener("click", async () => {
    if (manage.disabled) return;
    const idle = manage.textContent;
    manage.disabled = true;
    manage.textContent = manage.dataset.busyLabel || "Opening…";
    say("");
    try {
      const res = await fetch("/v1/billing/portal", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: "{}" });
      let data = {};
      try { data = await res.json(); } catch (_) { data = {}; }
      if (res.ok && typeof data.url === "string" && /^https:\/\/[^/\\\s]+\//.test(data.url)) { location.assign(data.url); return; }
      if (res.status === 404) throw Error("There's no Stripe billing account for you yet. Subscribe first, or email hello@aethric.llc.");
      if (res.status === 429 && data.error) throw Error(String(data.error));
      throw Error("The billing portal couldn't open just now. Please try again in a moment, or email hello@aethric.llc.");
    } catch (e) {
      say(e instanceof TypeError ? "We couldn't reach Insidir. Check your connection and try again." : e.message, true);
      manage.disabled = false;
      manage.textContent = idle;
    }
  });
  $("[data-bl-recheck]").addEventListener("click", () => confirmCheckout(null));

  /* ---------- cancel online (POST /v1/billing/cancel) ---------- */
  const cancelBtn = $("[data-bl-cancel]"), confirmBox = $("[data-bl-cancel-confirm]");
  cancelBtn.addEventListener("click", () => { confirmBox.hidden = false; $("[data-bl-cancel-yes]").focus(); });
  $("[data-bl-cancel-no]").addEventListener("click", () => { confirmBox.hidden = true; cancelBtn.focus(); });
  $("[data-bl-cancel-yes]").addEventListener("click", async e => {
    const yes = e.currentTarget;
    yes.disabled = true;
    say("");
    try {
      const res = await fetch("/v1/billing/cancel", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: "{}" });
      let data = {};
      try { data = await res.json(); } catch (_) { data = {}; }
      if (!res.ok) throw Error(data.error ? String(data.error) : "The cancellation didn't go through. Please try again, or email hello@aethric.llc and we will cancel for you.");
      confirmBox.hidden = true;
      await load(true);
      say(data.canceled ? (data.message || "Your subscription is cancelled.") : "Your subscription was already cancelled; nothing more will be charged.");
    } catch (err) {
      say(err instanceof TypeError ? "We couldn't reach Insidir. Check your connection and try again." : err.message, true);
    } finally { yes.disabled = false; }
  });

  load(returning).then(state => { if (returning) confirmCheckout(state); });
})();
