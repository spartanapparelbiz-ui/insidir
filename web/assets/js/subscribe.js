/* Subscribe (subscribe.html): the paywall for signed-in people without an active subscription.
   Reads GET /v1/me ({user, access:{active, status, billingEnabled, complimentary, currentPeriodEnd}})
   and shows one of: ready to subscribe, lapsed, a live subscription that needs fixing (past due,
   unpaid, incomplete, paused: these go to Stripe's billing portal, never to a second checkout),
   checkout not open yet, already active, signed out or a retryable error. The headline and lead
   follow the state. Subscribe posts to /v1/billing/checkout and follows the returned https:// Stripe
   URL; nothing here grants access — only Stripe does, through the engine. */
(() => {
  "use strict";
  const PAGES = ["dashboard", "research", "explore", "company", "filings", "filing", "people", "person", "watchlist", "portfolio", "alerts", "billing", "account"];
  const LABELS = { dashboard: "your dashboard", research: "the research desk", explore: "companies", company: "the company report", filings: "SEC filings", filing: "the filing", people: "people", person: "the personnel file", watchlist: "your watchlist", portfolio: "your portfolio", alerts: "your alerts", billing: "billing", account: "your account" };
  const NEXT_KEY = "insidir:after-checkout";
  const CONTACT = "email hello@aethric.llc";
  const NOT_STARTED = "Checkout couldn't start, and nothing was charged. Please try again in a moment, or " + CONTACT + ".";

  /* Same rule as auth.js and app.js: same-origin relative paths to known pages only. */
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
    return isNaN(d) ? "" : d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  };

  /* Headline and lead for every state (the plan card carries the detail and the action). */
  const PLAN = "One plan covers everything below: $39 a month, billed through Stripe, and you can cancel any time from Billing.";
  const COPY = {
    loading: ["Subscribe to open your workspace.", "Insidir is a paid research workspace. " + PLAN],
    ready: ["Subscribe to open your workspace.", "Insidir is a paid research workspace. " + PLAN],
    lapsed: ["Welcome back. Subscribe again to reopen your workspace.", "Your watchlist, research journal and holdings are still here. " + PLAN],
    past_due: ["Update your payment method.", "Your last payment didn't go through, so the workspace is paused. Update your card in Stripe's billing portal; access returns as soon as Stripe confirms the payment. Nothing you saved has been removed."],
    unpaid: ["Update your payment method.", "Your subscription has an unpaid invoice, so the workspace is paused. Pay it from Stripe's billing portal; access returns as soon as Stripe confirms the payment. Nothing you saved has been removed."],
    incomplete: ["Finish your first payment.", "Stripe is still waiting for the first payment of your subscription. Complete it in Stripe's billing portal. If you've only just paid, give it a minute and reload this page."],
    paused: ["Resume your subscription.", "Your subscription is paused, so the workspace is closed for now. Resume it in Stripe's billing portal; nothing you saved has been removed."],
    disabled: ["Checkout isn't open yet.", "Insidir is a paid research workspace: one plan, $39 a month. Stripe checkout hasn't been switched on yet, so no payment can be taken today."],
    active: ["Your subscription is active.", "Everything below is already open to you. Your plan, renewal date and payment method live in Billing."],
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

  function show(state, copyKey) {
    body.dataset.pwState = state;
    all("[data-pw-when]").forEach(el => { el.hidden = el.dataset.pwWhen !== state; });
    const copy = COPY[copyKey || state];
    if (copy) { title.textContent = copy[0]; lead.textContent = copy[1]; }
  }
  function say(message) {
    feedback.textContent = message || "";
    feedback.hidden = !message;
  }
  function signedIn(email) {
    all("[data-pw-signed-in]").forEach(el => { el.hidden = false; });
    all("[data-pw-signed-out]").forEach(el => { el.hidden = true; });
    const who = $("[data-pw-email]");
    if (who && email) { who.textContent = email; who.hidden = false; }
  }

  async function call(path, method = "GET") {
    const res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: method === "GET" ? { Accept: "application/json" } : { Accept: "application/json", "Content-Type": "application/json" },
      body: method === "GET" ? undefined : "{}"
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
    document.title = "Subscription active — insidir.";
    const go = $("[data-pw-continue]");
    go.setAttribute("href", next || "dashboard.html");
    go.textContent = next ? "Continue to " + nextLabel : "Open dashboard";
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
    try { res = await call(route, "POST"); } catch (_) { res = null; }
    const url = res && res.ok && typeof res.data.url === "string" ? res.data.url : "";
    if (/^https:\/\/[^/\\\s]+\//.test(url)) {
      if (!portal) {
        try { if (next) sessionStorage.setItem(NEXT_KEY, next); else sessionStorage.removeItem(NEXT_KEY); } catch (_) { /* storage unavailable */ }
      }
      location.assign(url);
      return;
    }
    busy(button, false);
    if (!res) return say("We couldn't reach Insidir. Check your connection and try again.");
    switch (res.status) {
      case 401: show("signedout"); return say("Your session has ended. Log in again to continue.");
      // The engine refuses a second subscription and says why (already active, unpaid invoice, payment pending, paused…).
      case 409: { const why = serverText(res); await load(); return say(why || "You already have an Insidir subscription. Manage it from Billing."); }
      case 429: return say(serverText(res) || "Too many attempts. Please wait a few minutes and try again.");
      case 403: return say("Your browser sent this request from an unexpected address. Reload the page and try again.");
      case 404: return say(portal ? "There's no Stripe billing account for you yet. Subscribe first, or " + CONTACT + "." : NOT_STARTED);
      case 503: {
        // Either checkout isn't switched on, or Stripe didn't answer: the reloaded state tells which.
        await load();
        return body.dataset.pwState === "disabled" ? undefined
          : say(portal ? "The billing portal couldn't open just now. Please try again in a moment, or " + CONTACT + "." : NOT_STARTED);
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
