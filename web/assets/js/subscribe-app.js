/* Subscribe (subscribe.html): the paywall for signed-in people without an active subscription, on ui.css.
   Reads GET /v1/me ({user, access:{active, status, billingEnabled, complimentary, currentPeriodEnd}}) and shows one of:
   ready to subscribe, lapsed, a live subscription that needs fixing (past due, unpaid, incomplete, paused: these go to
   Stripe's billing portal, never to a second checkout), checkout not open yet, already active, signed out or a
   retryable error. The headline and lead follow the state.

   The offer and its automatic-renewal terms come from GET /v1/billing/status (offer: {kind, todayCents, recurringCents,
   trialDays, firstRenewalAt, disclosure, disclosureVersion}) and are shown exactly as the engine words and records
   them. Checkout stays disabled until the box beside them is ticked, then POST /v1/billing/checkout sends
   {consent: true, offer: offer.kind, disclosureVersion: offer.disclosureVersion} and the page follows the returned
   https:// Stripe URL. Nothing here grants access: only Stripe does, through the engine.
   Hooks (ids and data-pw-*) are the same as the old subscribe.js, so its browser tests apply to this file too. */
(() => {
  "use strict";
  const PAGES = ["dashboard", "research", "explore", "company", "filings", "filing", "people", "person", "watchlist", "portfolio", "alerts", "intelligence", "entity", "billing", "account"];
  const LABELS = { dashboard: "Today", research: "the research desk", explore: "companies", company: "the company report", filings: "SEC filings", filing: "the filing", people: "people", person: "the personnel file", watchlist: "your watchlist", portfolio: "your portfolio", alerts: "your alerts", intelligence: "Intelligence", entity: "the filer's page", billing: "billing", account: "your account" };
  const NEXT_KEY = "insidir:after-checkout";
  const CONTACT = "write to hello@aethric.llc";
  const NOT_STARTED = "Checkout couldn't start, and nothing was charged. Please try again in a moment, or " + CONTACT + ".";

  /* Same rule as auth.js: same-origin relative paths to known pages only. */
  function safeNext(raw) {
    if (typeof raw !== "string" || !raw || raw.length > 600) return null;
    if (/[\\\s\u0000-\u001f]/.test(raw) || raw.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return null;
    let url;
    try { url = new URL(raw, location.origin + "/"); } catch (_) { return null; }
    if (url.origin !== location.origin) return null;
    const m = /^\/([a-z]+)(?:\.html)?$/.exec(url.pathname);
    return m && PAGES.includes(m[1]) ? m[1] + ".html" + url.search : null;
  }
  const params = new URLSearchParams(location.search);
  const next = safeNext(params.get("next"));
  const nextLabel = next ? LABELS[next.split(/[.?]/)[0]] : "";

  const body = document.body;
  const $ = sel => document.querySelector(sel);
  const all = sel => [...document.querySelectorAll(sel)];
  const feedback = $("#pw-feedback");
  const title = $("#pw-title"), lead = $(".pw-lead");
  const dateText = iso => {
    const d = new Date(iso);
    return isNaN(d) ? "" : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  };

  /* Headline and lead for every state (the plan card carries the detail and the action). */
  const PLAN = "One plan: 7 days for $1, then $39 a month, billed through Stripe. Cancel any time from Billing, in one step.";
  const COPY = {
    // While the account loads, the page reads as most visitors will see it (a new account, eligible for the trial).
    loading: ["Start your 7-day trial for $1.", PLAN + " One trial per account: if you have had Insidir before, checkout shows $39."],
    ready: ["Start your 7-day trial for $1.", PLAN + " One trial per account: if you have had Insidir before, checkout shows $39."],
    lapsed: ["Welcome back. Subscribe again to reopen your workspace.", "Your watchlist, research journal and holdings are still here. " + PLAN],
    past_due: ["Update your payment method.", "Your last payment didn't go through, so the workspace is paused. Update your card in Stripe's billing portal; access returns as soon as Stripe confirms the payment. Nothing you saved has been removed."],
    unpaid: ["Update your payment method.", "Your subscription has an unpaid invoice, so the workspace is paused. Pay it from Stripe's billing portal; access returns as soon as Stripe confirms the payment. Nothing you saved has been removed."],
    incomplete: ["Finish your first payment.", "Stripe is still waiting for the first payment of your subscription. Complete it in Stripe's billing portal. If you've only just paid, give it a minute and reload this page."],
    paused: ["Resume your subscription.", "Your subscription is paused, so the workspace is closed for now. Resume it in Stripe's billing portal; nothing you saved has been removed."],
    disabled: ["Checkout isn't open yet.", "Insidir is one plan: a 7-day trial for $1, then $39 a month. Stripe checkout hasn't been switched on yet, so no payment can be taken today."],
    active: ["Your subscription is active.", "Everything is already open to you. Your plan, renewal date and payment method live in Billing."],
    signedout: ["Log in to subscribe.", "A subscription belongs to an Insidir account, so log in first. " + PLAN],
    error: ["We couldn't check your account.", "Insidir didn't answer just now, so we can't tell whether your subscription is active. Try again in a moment."]
  };
  /* A live Stripe subscription that isn't in good standing: fixed in the portal, never with a second checkout. */
  const FIX = {
    past_due: ["Payment past due. Access returns once Stripe collects it.", "Update payment method"],
    unpaid: ["Invoice unpaid. Access returns once it's paid.", "Pay the open invoice"],
    incomplete: ["First payment pending. Access opens once Stripe confirms it.", "Finish payment"],
    paused: ["Subscription paused. Access returns when you resume it.", "Resume subscription"]
  };

  /* The offer and its automatic-renewal terms, worded exactly as they are recorded when the customer agrees. */
  let offer = null;
  const agree = $("[data-pw-agree]");
  const money = cents => "$" + (cents / 100).toFixed(cents % 100 ? 2 : 0);
  const shortDate = iso => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); };
  function renderOffer(o) {
    offer = o && (o.kind === "trial" || o.kind === "full") && typeof o.disclosure === "string" && o.disclosure ? o : null;
    agree.checked = false;
    syncAgree();
    if (!offer) { $("[data-pw-terms]").textContent = "The subscription terms could not be loaded. Reload the page to continue."; return; }
    $("[data-pw-terms]").textContent = offer.disclosure;
    const trial = offer.kind === "trial";
    // The monthly price leads; today's charge and the date of the first full charge sit right under it.
    const firstCharge = shortDate(offer.firstRenewalAt) || (trial ? shortDate(new Date(Date.now() + offer.trialDays * 86400000).toISOString()) : "");
    $("[data-pw-price]").innerHTML = trial
      ? '<span class="sb-price__n">' + money(offer.recurringCents) + '</span><span class="sb-price__u">a month after a ' + Number(offer.trialDays) + "-day trial · " + money(offer.todayCents) + " today</span>"
      : '<span class="sb-price__n">' + money(offer.recurringCents) + '</span><span class="sb-price__u">a month</span>';
    $("[data-pw-term-1]").textContent = trial ? money(offer.todayCents) + " today for a " + offer.trialDays + "-day trial, once per account" : money(offer.recurringCents) + " today for your first month";
    $("[data-pw-term-2]").textContent = trial
      ? "Then " + money(offer.recurringCents) + " a month in US dollars, first charged" + (firstCharge ? " on " + firstCharge : " when the trial ends") + " and renewing automatically until you cancel"
      : "Then " + money(offer.recurringCents) + " a month in US dollars, renewing automatically until you cancel";
    $("#pw-subscribe").textContent = trial ? "Start " + offer.trialDays + "-day trial · " + money(offer.todayCents) : "Subscribe · " + money(offer.recurringCents) + " a month";
    // The headline promises what the button does: an account that has had its trial is offered the monthly plan.
    if (!trial && body.dataset.pwState === "ready") {
      title.textContent = "Subscribe to Insidir.";
      lead.textContent = "This account has already used its 7-day trial, so checkout charges " + money(offer.recurringCents) + " today, then " + money(offer.recurringCents) + " a month through Stripe until you cancel. Cancel online from Billing in one step.";
    }
    delete $("#pw-subscribe").dataset.idleLabel;
  }
  function syncAgree() {
    const ok = !!offer && agree.checked;
    for (const id of ["#pw-subscribe", "#pw-resubscribe"]) { const b = $(id); if (b && b.getAttribute("aria-busy") !== "true") b.disabled = !ok; }
  }
  agree.addEventListener("change", syncAgree);
  async function loadOffer() {
    try { const r = await call("/v1/billing/status"); renderOffer(r.ok && r.data ? r.data.offer : null); } catch (_) { renderOffer(null); }
  }
  function show(state, copyKey) {
    body.dataset.pwState = state;
    all("[data-pw-when]").forEach(el => { el.hidden = el.dataset.pwWhen !== state; });
    const consent = state === "ready" || state === "lapsed";
    $("[data-pw-consent]").hidden = !consent;
    if (consent) loadOffer();
    const copy = COPY[copyKey || state];
    if (copy) { title.textContent = copy[0]; lead.textContent = copy[1]; }
  }
  function say(text) {
    feedback.textContent = text || "";
    feedback.hidden = !text;
  }
  function signedIn(email) {
    all("[data-pw-signed-in]").forEach(el => { el.hidden = false; });
    all("[data-pw-signed-out]").forEach(el => { el.hidden = true; });
    const who = $("[data-pw-email]");
    if (who && email) { who.textContent = email; who.hidden = false; }
  }

  async function call(path, method = "GET", payload = {}) {
    const res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: method === "GET" ? { Accept: "application/json" } : { Accept: "application/json", "Content-Type": "application/json" },
      body: method === "GET" ? undefined : JSON.stringify(payload)
    });
    let data = null;
    try { data = await res.json(); } catch (_) { data = null; }
    return { status: res.status, ok: res.ok, data: data || {} };
  }
  const serverText = res => res && res.data && typeof res.data.error === "string" ? res.data.error.trim().slice(0, 240) : "";

  /* ---------- notices ---------- */
  if (params.get("checkout") === "cancel") $('[data-pw-notice="cancel"]').hidden = false;
  if (next && nextLabel) {
    const n = $('[data-pw-notice="next"]');
    n.textContent = "Subscribe to continue to " + nextLabel + ".";
    n.hidden = false;
  }
  const signinHref = next ? "signin.html?next=" + encodeURIComponent(next) : "signin.html";
  all("[data-pw-signin]").forEach(a => a.setAttribute("href", signinHref));

  /* ---------- account state ---------- */
  function showActive(access) {
    const until = access.currentPeriodEnd ? dateText(access.currentPeriodEnd) : "";
    $("[data-pw-active]").textContent = access.complimentary
      ? "Complimentary access: there's nothing to pay."
      : until ? "Insidir Pro · current period runs to " + until + "." : "Insidir Pro · active.";
    show("active");
    if (access.complimentary) title.textContent = "Your workspace is open.";
    document.title = "Subscription active — Insidir";
    const go = $("[data-pw-continue]");
    go.setAttribute("href", next || "dashboard.html");
    go.textContent = next ? "Continue to " + nextLabel : "Open Today";
  }

  async function load() {
    show("loading");
    say("");
    let me;
    try { me = await call("/v1/me"); } catch (_) { me = null; }
    if (me && me.status === 401) { show("signedout"); return; }
    if (!me || !me.ok || !me.data.user) { show("error"); return; }
    signedIn(String(me.data.user.email || ""));
    let access = me.data.access || {};
    if (!access.active && access.billingEnabled !== false) {
      // Someone who paid moments ago may arrive before Stripe's webhook: ask the engine to re-read Stripe once.
      try {
        const bill = await call("/v1/billing/status?refresh=1");
        if (bill.ok && bill.data) {
          access = { ...access, active: !!bill.data.active || access.active,
            status: bill.data.subscriptionStatus || access.status || null,
            currentPeriodEnd: bill.data.currentPeriodEnd || access.currentPeriodEnd || null };
        }
      } catch (_) { /* keep what /v1/me said */ }
    }
    if (access.active) { showActive(access); return; }
    if (access.billingEnabled === false) { show("disabled"); return; }
    const status = access.status || null;
    if (FIX[status]) {
      $("[data-pw-fix]").textContent = FIX[status][0] + " There's no need to subscribe again.";
      const portal = $("#pw-portal");
      portal.textContent = FIX[status][1];
      delete portal.dataset.idleLabel;
      show("fix", status);
      return;
    }
    if (status && status !== "incomplete_expired") {
      const ended = access.currentPeriodEnd ? dateText(access.currentPeriodEnd) : "";
      $("[data-pw-lapsed]").textContent = status === "canceled"
        ? (ended ? "Your previous subscription ended on " + ended + "." : "Your previous subscription has ended.")
        : "Your previous subscription is no longer active.";
      show("lapsed");
      return;
    }
    show("ready");
  }

  /* ---------- actions ---------- */
  function busy(button, on) {
    if (!button.dataset.idleLabel) button.dataset.idleLabel = button.textContent;
    button.disabled = on;
    button.setAttribute("aria-busy", String(on));
    button.textContent = on ? (button.dataset.busyLabel || "Working…") : button.dataset.idleLabel;
  }
  async function toStripe(button, route) {
    if (button.disabled) return;
    const portal = route === "/v1/billing/portal";
    say("");
    busy(button, true);
    let res;
    const payload = portal ? {} : offer && agree.checked ? { consent: true, offer: offer.kind, disclosureVersion: offer.disclosureVersion } : null;
    if (!payload) { busy(button, false); syncAgree(); return say("Tick the box to agree to the automatic renewal terms first."); }
    try { res = await call(route, "POST", payload); } catch (_) { res = null; }
    const url = res && res.ok && typeof res.data.url === "string" ? res.data.url : "";
    if (/^https:\/\/[^/\\\s]+\//.test(url)) {
      if (!portal) {
        try { if (next) sessionStorage.setItem(NEXT_KEY, next); else sessionStorage.removeItem(NEXT_KEY); } catch (_) { /* storage unavailable */ }
      }
      location.assign(url);
      return;
    }
    busy(button, false);
    syncAgree();
    if (!res) return say("We couldn't reach Insidir. Check your connection and try again.");
    if (res.status === 400) return say(serverText(res) || "Tick the box to agree to the automatic renewal terms first.");
    switch (res.status) {
      case 401: show("signedout"); return say("Your session has ended. Log in again to continue.");
      // The engine refuses a second subscription, or a changed offer, and says why; the reloaded page shows the terms that apply.
      case 409: { const why = serverText(res); await load(); return say(why || "You already have an Insidir subscription. Manage it from Billing."); }
      case 429: return say(serverText(res) || "Too many attempts. Please wait a few minutes and try again.");
      case 403: return say("Your browser sent this request from an unexpected address. Reload the page and try again.");
      case 404: return say(portal ? "There's no Stripe billing account for you yet. Subscribe first, or " + CONTACT + "." : NOT_STARTED);
      case 503: {
        // Either checkout isn't switched on, or Stripe didn't answer: the reloaded state tells which.
        const why = serverText(res);
        await load();
        return body.dataset.pwState === "disabled" ? undefined
          : say(portal ? "The billing portal couldn't open just now. Please try again in a moment, or " + CONTACT + "." : why && /Nothing was charged/.test(why) ? why : NOT_STARTED);
      }
      default: return say(portal ? "The billing portal couldn't open just now. Please try again in a moment, or " + CONTACT + "." : NOT_STARTED);
    }
  }
  $("#pw-subscribe").addEventListener("click", e => toStripe(e.currentTarget, "/v1/billing/checkout"));
  $("#pw-resubscribe").addEventListener("click", e => toStripe(e.currentTarget, "/v1/billing/checkout"));
  $("#pw-portal").addEventListener("click", e => toStripe(e.currentTarget, "/v1/billing/portal"));
  $("#pw-retry").addEventListener("click", load);
  $("[data-pw-signout]").addEventListener("click", async () => {
    try { await call("/v1/auth/logout", "POST"); } catch (_) { /* signed out locally either way */ }
    try { localStorage.removeItem("insidir:signed-in"); } catch (_) { /* storage unavailable */ }
    location.assign("signin.html");
  });

  load();
})();
