/* Billing (billing.html) on the rebuilt app: the signed-in person's subscription, from GET /v1/me (access, complimentary)
   and GET /v1/billing/status (Stripe status, trial or renewal date, cancellation, and the offer with its exact
   automatic-renewal terms). Manage billing opens Stripe's portal (POST /v1/billing/portal); Cancel subscription is one
   step (POST /v1/billing/cancel), with a one-month pause offered instead (POST /v1/billing/pause) and an early resume
   (POST /v1/billing/resume). Messages the engine returns for those are shown as written.

   After an older checkout Stripe returned here with ?checkout=success (new checkouts land on welcome.html). Access is
   granted only by Stripe, never by arriving on a page, so the page asks GET /v1/billing/status?refresh=1 a few times
   and never offers a second checkout meanwhile: someone who has just paid must not be able to pay again.
   Statuses that still belong to a live Stripe subscription (past_due, unpaid, incomplete, paused) are fixed in the
   portal, so they get Manage billing, never Subscribe. */
(() => {
  "use strict";
  const $ = sel => document.querySelector(sel);
  const NEXT_KEY = "insidir:after-checkout";
  const PAGES = ["dashboard", "research", "explore", "company", "filings", "filing", "people", "person", "watchlist", "portfolio", "alerts", "intelligence", "entity", "account"];
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
    paused: { badge: "Paused", text: "Your subscription is paused, so access is paused too. It resumes on its own, or press Resume now." }
  };
  const NO_PORTAL = " If Manage billing isn't shown, write to hello@aethric.llc and we'll sort it out.";
  const OFFLINE = "We couldn't reach Insidir. Check your connection and try again.";
  const message = $("#bill-status"), manage = $("#manage");
  const params = new URLSearchParams(location.search);
  const returning = params.get("checkout") === "success";
  let confirming = returning; // from Stripe's return until the subscription is confirmed active
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const dateText = iso => { const d = new Date(iso); return iso && !isNaN(d) ? d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : ""; };
  const money = cents => "$" + (cents / 100).toFixed(cents % 100 ? 2 : 0);

  /* Only a known page, as a same-origin relative path, may follow checkout (see subscribe-app.js). */
  function storedNext() {
    let raw = null;
    try { raw = sessionStorage.getItem(NEXT_KEY); } catch (_) { return null; }
    if (typeof raw !== "string" || raw.length > 600 || /[\\\s\u0000-\u001f]/.test(raw) || raw.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return null;
    let url;
    try { url = new URL(raw, location.origin + "/"); } catch (_) { return null; }
    const m = url.origin === location.origin && /^\/([a-z]+)(?:\.html)?$/.exec(url.pathname);
    return m && PAGES.includes(m[1]) ? "/" + m[1] + ".html" + url.search : null;
  }
  async function call(path, method = "GET") {
    const res = await fetch(path, { method, credentials: "same-origin",
      headers: method === "GET" ? { Accept: "application/json" } : { "Content-Type": "application/json", Accept: "application/json" },
      body: method === "GET" ? undefined : "{}" });
    let data = null;
    try { data = await res.json(); } catch (_) { data = null; }
    return { status: res.status, ok: res.ok, data: data || {} };
  }
  function say(text, error) { message.textContent = text || ""; message.classList.toggle("is-error", !!error); }
  // A Stripe subscription in good standing (what checkout produces)…
  const subscribed = bill => !!bill && (bill.plan === "pro" || ["active", "trialing"].includes(bill.subscriptionStatus));
  // …or any access at all, complimentary included (what the product checks).
  const isActive = (me, bill) => !!((me && me.access && me.access.active) || (bill && bill.active === true) || subscribed(bill));

  /* ---------- the offer, worded exactly as the engine records it at checkout ---------- */
  function renderOffer(o, show) {
    const box = $("[data-bl-offer]");
    const offer = o && (o.kind === "trial" || o.kind === "full") && typeof o.disclosure === "string" ? o : null;
    box.hidden = !(show && offer);
    if (box.hidden) return;
    $("[data-bl-offer-line]").textContent = offer.kind === "trial"
      ? money(offer.todayCents) + " today for a " + offer.trialDays + "-day trial, then " + money(offer.recurringCents) + " a month"
      : money(offer.todayCents) + " today, then " + money(offer.recurringCents) + " a month";
    $("[data-bl-offer-terms]").textContent = offer.disclosure;
  }

  /* ---------- the plan card ---------- */
  function render(me, bill) {
    const access = (me && me.access) || {};
    const status = (bill && bill.subscriptionStatus) || access.status || null;
    const enabled = bill && typeof bill.billingEnabled === "boolean" ? bill.billingEnabled : access.billingEnabled !== false;
    const period = (bill && bill.currentPeriodEnd) || access.currentPeriodEnd || null;
    const active = isActive(me, bill);
    const fix = !active && FIX[status];
    const waiting = confirming && !active;
    const complimentary = !!(access.complimentary || (bill && bill.complimentary));
    const comp = complimentary && !["active", "trialing"].includes(status);
    const badge = $("[data-bl-badge]");
    const [label, tone] = comp ? ["Complimentary", "on"] : active ? ["Active", "on"] : waiting ? ["Confirming", "wait"] : fix ? [fix.badge, "off"] : ["Not subscribed", "off"];
    badge.textContent = label;
    badge.dataset.tone = tone;

    $("[data-bl-status]").textContent = comp ? "Complimentary access. There's nothing to pay."
      : waiting && !status ? "Waiting for Stripe's confirmation"
      : status ? (STATUS[status] || status.replace(/_/g, " ")) : "No subscription";
    const ended = status === "canceled" || status === "incomplete_expired";
    const stopping = !!(bill && bill.cancelAtPeriodEnd) && !ended;
    $("[data-bl-period-label]").textContent = ended ? "Ended" : stopping ? "Access ends (will not renew)" : status === "trialing" ? "Trial ends, then $39 a month" : "Renews on";
    $("[data-bl-period]").textContent = dateText(period) || "—";
    $("[data-bl-method]").textContent = status ? "Held by Stripe. Update it in Manage billing." : waiting ? "With Stripe, being confirmed" : "None on file";
    if (me && me.user && me.user.email) $("[data-bl-email]").textContent = String(me.user.email);

    const customer = bill && typeof bill.hasCustomer === "boolean" ? bill.hasCustomer : !!status;
    manage.hidden = !(enabled && customer);
    // Never a second checkout while a payment is being confirmed or a live subscription needs fixing.
    const subscribe = $("[data-bl-subscribe]");
    subscribe.hidden = active || !enabled || waiting || !!fix;
    renderOffer(bill && bill.offer, !subscribe.hidden);
    $("[data-bl-dashboard]").hidden = !active;
    // Cancel online in one step, wherever the subscription can still bill and is not already set to stop.
    $("[data-bl-cancel]").hidden = !(enabled && customer && ["active", "trialing", "past_due", "unpaid"].includes(status) && !stopping);
    // The cancel confirmation also offers one month's pause (once per subscription; the server checks).
    const canPause = enabled && customer && ["active", "trialing"].includes(status) && !stopping;
    $("[data-bl-pause]").hidden = !canPause;
    const pauseText = $("[data-bl-pause-text]");
    pauseText.hidden = !(canPause && period);
    if (canPause && period) {
      const from = new Date(period), back = new Date(from.getTime() + 30 * 864e5);
      pauseText.textContent = "Or pause for a month: no charge on " + dateText(from) + ", access pauses until " + dateText(back) + ", then $39 a month resumes. You can still cancel anytime.";
    }
    $("[data-bl-resume-row]").hidden = status !== "paused";
    // The trial's reminder links to billing.html#cancel: open the one-step cancel confirmation straight away.
    if (location.hash === "#cancel" && !$("[data-bl-cancel]").hidden) { $("[data-bl-cancel-confirm]").hidden = false; history.replaceState(null, "", location.pathname + location.search); }
    if (stopping && active) { say("Your subscription is cancelled and will not renew. Access continues until " + (dateText(period) || "the end of the current period") + "."); return; }
    if (waiting) say("Waiting for Stripe to confirm your payment. This page updates as soon as it does; there's no need to pay again.");
    else if (!active && !enabled) say("Checkout isn't open yet, so no payment can be taken right now. To request access, write to hello@aethric.llc.");
    else if (fix) say(fix.text + (manage.hidden ? NO_PORTAL : ""), true);
    else if (!active) say("You don't have an active subscription. Subscribe to open Today, your watchlist and alerts" + (status ? "; everything you saved is still here." : "."));
    else say("");
  }

  async function load(refresh) {
    let me, bill;
    try { [me, bill] = await Promise.all([call("/v1/me"), call("/v1/billing/status" + (refresh ? "?refresh=1" : ""))]); } catch (_) { me = bill = null; }
    if (!me || !bill) { say("We couldn't reach Insidir to check your subscription. Check your connection and reload the page.", true); return null; }
    if (me.status === 401 || bill.status === 401) {
      $("[data-bl-status]").textContent = "Not logged in";
      $("[data-bl-badge]").textContent = "Not logged in";
      say("Log in to see your subscription.", true);
      return null;
    }
    if (!me.ok || !bill.ok) { say("We couldn't load your subscription just now. Please reload the page in a moment.", true); $("[data-bl-badge]").textContent = "Unavailable"; $("[data-bl-badge]").dataset.tone = "off"; return null; }
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
        try { const r = await call("/v1/billing/status?refresh=1"); bill = r.ok ? r.data : null; } catch (_) { bill = null; }
        if (bill) state = { me: state && state.me, bill };
      }
      if (state && (subscribed(state.bill) || isActive(state.me, state.bill))) {
        const next = storedNext();
        try { sessionStorage.removeItem(NEXT_KEY); } catch (_) { /* storage unavailable */ }
        confirming = false;
        polling = false;
        box.dataset.state = "active";
        title.textContent = "Your subscription is active.";
        text.textContent = "Thank you for subscribing. Every tool is open to you now. Start by watching a few stocks: Insidir checks for their new filings from then on.";
        try { if (!localStorage.getItem("insidir:onboard")) localStorage.setItem("insidir:onboard", "new"); } catch (_) { /* storage unavailable */ }
        open.setAttribute("href", next || "/welcome.html");
        open.textContent = next ? "Continue where you left off" : "Pick your first stocks";
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
    text.textContent = "Stripe hasn't confirmed the subscription to Insidir yet. Please don't pay again: check again in a minute. If it still hasn't activated after a few minutes, write to hello@aethric.llc and we'll sort it out.";
    recheck.hidden = false;
    await load();
  }
  $("[data-bl-recheck]").addEventListener("click", () => confirmCheckout(null));

  /* ---------- Stripe billing portal ---------- */
  manage.addEventListener("click", async () => {
    if (manage.disabled) return;
    const idle = manage.textContent;
    manage.disabled = true;
    manage.textContent = manage.dataset.busyLabel || "Opening…";
    say("");
    try {
      const res = await call("/v1/billing/portal", "POST");
      if (res.ok && typeof res.data.url === "string" && /^https:\/\/[^/\\\s]+\//.test(res.data.url)) { location.assign(res.data.url); return; }
      if (res.status === 404) throw Error("There's no Stripe billing account for you yet. Subscribe first, or write to hello@aethric.llc.");
      if (res.status === 429 && res.data.error) throw Error(String(res.data.error));
      throw Error("The billing portal couldn't open just now. Please try again in a moment, or write to hello@aethric.llc.");
    } catch (e) {
      say(e instanceof TypeError ? OFFLINE : e.message, true);
      manage.disabled = false;
      manage.textContent = idle;
    }
  });

  /* ---------- cancel online (POST /v1/billing/cancel) ---------- */
  const cancelBtn = $("[data-bl-cancel]"), confirmBox = $("[data-bl-cancel-confirm]");
  cancelBtn.addEventListener("click", () => { confirmBox.hidden = false; $("[data-bl-cancel-yes]").focus(); });
  $("[data-bl-cancel-no]").addEventListener("click", () => { confirmBox.hidden = true; cancelBtn.focus(); });
  $("[data-bl-cancel-yes]").addEventListener("click", async e => {
    const yes = e.currentTarget;
    yes.disabled = true;
    say("");
    try {
      const res = await call("/v1/billing/cancel", "POST");
      if (!res.ok) throw Error(res.data.error ? String(res.data.error) : "The cancellation didn't go through. Please try again, or write to hello@aethric.llc and we will cancel for you.");
      confirmBox.hidden = true;
      await load(true);
      say(res.data.canceled ? (res.data.message || "Your subscription is cancelled.") : "Your subscription was already cancelled; nothing more will be charged.");
    } catch (err) {
      say(err instanceof TypeError ? OFFLINE : err.message, true);
    } finally { yes.disabled = false; }
  });

  /* ---------- pause one month instead (POST /v1/billing/pause), and resume early ---------- */
  async function post(path, button, fallback) {
    button.disabled = true;
    say("");
    try {
      const res = await call(path, "POST");
      if (!res.ok) throw Error(res.data.error ? String(res.data.error) : fallback);
      confirmBox.hidden = true;
      await load(true);
      say(res.data.message || "Done.");
    } catch (err) {
      say(err instanceof TypeError ? OFFLINE : err.message, true);
    } finally { button.disabled = false; }
  }
  $("[data-bl-pause]").addEventListener("click", e => post("/v1/billing/pause", e.currentTarget, "The pause didn't go through. Please try again, or cancel instead."));
  $("[data-bl-resume]").addEventListener("click", e => post("/v1/billing/resume", e.currentTarget, "We couldn't resume your subscription. Please try again."));

  load(returning).then(state => { if (returning) confirmCheckout(state); });
})();
