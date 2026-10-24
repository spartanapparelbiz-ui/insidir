/* The first minute after paying (welcome.html, Stripe Checkout's success_url), on ui.css.
   1. Wait for Stripe's confirmation: access is granted by Stripe's webhook, never by this redirect, so the page polls
      GET /v1/billing/status (?refresh=1 every third time) and moves on only once the subscription is active.
   2. Pick 3 stocks: the first is the one searched before signing up (insidir:first-ticker); each is saved to the
      watchlist (POST /v1/me/watchlist, mode "important").
   3. The latest insider trade at the first stock (GET /v1/transactions?ticker=), in one sentence, linked to its SEC
      filing. The insider gets their real photo (UI.face) when the media pipeline has one, initials until then.
   4. Notifications on this device (GET/POST /v1/me/push; permission asked only on the button). It can be skipped:
      alerts also wait in the app's Alerts inbox. Insidir sends no email.
   One <h1> (#wl-title) names the current step. */
(() => {
  "use strict";
  const UI = window.InsidirUI; if (!UI) return;
  const { fmt, esc, logo, hydrateLogos, face, filingHref, trade } = UI;
  const $ = (s, el = document) => el.querySelector(s);
  const TICK = /^[A-Z][A-Z0-9.-]{0,9}$/;
  const clean = v => String(v || "").trim().toUpperCase().replace(/^\$/, "");
  const capture = (name, props) => { try { window.posthog?.capture?.(name, props || {}); } catch { /* never break the page */ } };
  const funnel = label => { try { window.InsidirFunnel?.send("onboarding_step", { label }); } catch { /* never break the page */ } };
  const api = (path, method = "GET", body) => UI.api(path, { method, body });
  const why = (e, fallback) => e instanceof TypeError ? "We couldn't reach Insidir. Check your connection and try again." : e?.message && e.message !== "Something went wrong" ? e.message : fallback;
  const TITLES = { confirm: "You're in.", stocks: "Pick 3 stocks to watch.", trade: "The latest insider trade.", alerts: "Turn on notifications." };
  const title = $("#wl-title");

  function show(step) {
    for (const s of document.querySelectorAll("[data-wl-step]")) s.hidden = s.dataset.wlStep !== step;
    const order = ["stocks", "trade", "alerts"], i = order.indexOf(step);
    for (const d of document.querySelectorAll("[data-wl-dot]")) {
      d.classList.toggle("is-on", order.indexOf(d.dataset.wlDot) <= Math.max(0, i));
      if (d.dataset.wlDot === order[Math.max(0, i)]) d.setAttribute("aria-current", "step"); else d.removeAttribute("aria-current");
    }
    title.textContent = TITLES[step] || "";
    $("[data-wl-skip]").hidden = step === "confirm";
    if (step !== "confirm") title.focus({ preventScroll: true });
  }
  const say = (step, text, error) => { const m = $(`[data-wl-step="${step}"] [data-wl-msg]`); if (m) { m.textContent = text || ""; m.classList.toggle("is-error", !!error); } };

  /* ---------- 1. Stripe's confirmation ---------- */
  async function confirm() {
    for (let i = 0; i < 30; i++) {
      try {
        const s = await api("/v1/billing/status" + (i % 3 === 0 ? "?refresh=1" : ""));
        if (s?.active) { capture("trial_confirmed"); return startStocks(); }
      } catch (e) { if (e.status === 401) return; /* ui.js is sending the browser to sign in */ }
      await new Promise(r => setTimeout(r, 2000));
    }
    $("[data-wl-confirm-text]").textContent = "Stripe hasn't confirmed your payment yet. This page keeps checking; there's no need to pay again.";
    const m = $('[data-wl-step="confirm"] [data-wl-msg]');
    m.replaceChildren("If it takes more than a few minutes, open ", Object.assign(document.createElement("a"), { href: "/billing.html", className: "au-link", textContent: "Billing" }), " or write to hello@aethric.llc.");
    setTimeout(confirm, 10000);
  }

  /* ---------- 2. Pick 3 stocks ---------- */
  const inputs = () => [...document.querySelectorAll(".wl-input")];
  let first = null;
  function startStocks() {
    show("stocks");
    let searched = null;
    try { searched = clean(localStorage.getItem("insidir:first-ticker")); } catch { searched = null; }
    if (TICK.test(searched || "")) inputs()[0].value = searched;
    for (const chip of document.querySelectorAll("[data-wl-chip]")) if (chip.textContent === searched) chip.hidden = true;
  }
  for (const chip of document.querySelectorAll("[data-wl-chip]")) chip.addEventListener("click", () => {
    const taken = inputs().map(i => clean(i.value));
    if (taken.includes(chip.textContent)) return;
    const empty = inputs().find(i => !clean(i.value));
    if (empty) { empty.value = chip.textContent; chip.hidden = true; say("stocks", ""); }
    else say("stocks", "You've picked 3. Clear one to swap it.");
  });
  $("[data-wl-stocks-form]").addEventListener("submit", async e => {
    e.preventDefault();
    const picks = [...new Set(inputs().map(i => clean(i.value)).filter(Boolean))];
    const bad = picks.find(t => !TICK.test(t));
    if (bad) return say("stocks", bad + " doesn't look like a stock symbol.", true);
    if (!picks.length) return say("stocks", "Pick at least one stock.", true);
    const btn = e.submitter || $("[data-wl-stocks-form] button[type=submit]");
    btn.disabled = true;
    say("stocks", "Saving…");
    try {
      for (const t of picks) await api("/v1/me/watchlist", "POST", { ticker: t, mode: "important" });
      first = picks[0];
      try { localStorage.removeItem("insidir:first-ticker"); } catch { /* fine */ }
      capture("onboarding_stocks", { count: picks.length }); funnel("watchlist");
      startTrade();
    } catch (err) { say("stocks", why(err, "Your stocks weren't saved. Try again."), true); }
    finally { btn.disabled = false; }
  });

  /* ---------- 3. The latest trade ---------- */
  const value = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? fmt.money(n) : null; };
  function sentence(r) {
    const verb = r.transaction_code === "P" ? "bought" : r.transaction_code === "S" ? "sold" : "reported";
    const v = value(r.estimated_value), shares = Number(r.shares);
    const amount = v ? v + " of " : shares > 0 ? fmt.shares(shares) + " shares of " : "shares of ";
    const plan = verb === "sold" && r.rule_10b5_1 === true ? ", under a plan set up in advance" : "";
    const day = fmt.date(r.transaction_date);
    return fmt.person(r.owner_name) + " " + verb + " " + amount + String(r.ticker || first).toUpperCase() + " stock" + (day ? " on " + day : "") + plan + ".";
  }
  async function startTrade() {
    show("trade");
    title.textContent = "The latest insider trade at " + first + ".";
    const box = $("[data-wl-trade]");
    const done = html => { box.innerHTML = html; box.removeAttribute("aria-busy"); hydrateLogos(box); };
    try {
      const rows = (await api("/v1/transactions?limit=20&ticker=" + encodeURIComponent(first)))?.items || [];
      const r = rows.find(x => ["P", "S"].includes(x.transaction_code)) || rows[0];
      if (!r) return done(`<p class="au-sub">No insider at ${esc(first)} has filed a trade we have on record yet. It lands in your Alerts the minute one does.</p>`);
      const t = String(r.ticker || first).toUpperCase();
      // The in-app filing view, or the filing on SEC.gov; nothing else is linked.
      const link = filingHref(r.source_url, r.id || r.accession);
      const href = /^\/filing\.html\?accession=|^https:\/\/www\.sec\.gov\//.test(link) ? link : "";
      const kind = r.transaction_code === "P" ? trade({ kind: "buy" }) : r.transaction_code === "S" ? trade({ kind: "sell", planned: r.rule_10b5_1 === true }) : "";
      const text = esc(sentence(r));
      done(`<div class="wl-trade__head">${logo(t, 32, r.issuer_name)}<div class="wl-trade__co"><span class="tick">${esc(t)}</span><span class="t-label muted">${esc(fmt.company(r.issuer_name) || "")}</span></div></div>
        <div class="wl-trade__who">${face(r.owner_name, { cik: r.owner_cik, ticker: t, issuerCik: r.issuer_cik, size: 24 })}<span class="t-label">${esc(fmt.person(r.owner_name))}</span>${kind}</div>
        <p class="wl-trade__text">${href ? `<a href="${esc(href)}">${text}</a>` : text}</p>
        ${href ? `<a class="wl-trade__link" href="${esc(href)}">Open the SEC filing ${UI.icon("arrow-up-right", 14)}</a>` : ""}`);
    } catch (e) {
      if (e.status === 401 || e.status === 402) return;
      done(`<p class="au-sub">We couldn't load ${esc(first)}'s latest trade just now. It's on Today.</p>`);
    }
  }
  $("[data-wl-next]").addEventListener("click", () => { funnel("trade"); startAlerts(); });

  /* ---------- 4. Notifications on this device ---------- */
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const pushable = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && window.isSecureContext;
  const b64 = key => { const s = (key + "=".repeat((4 - key.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/"); return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
  async function startAlerts() {
    show("alerts");
    const pushBtn = $("[data-wl-push]"), pushText = $("[data-wl-push-text]");
    if (ios && !standalone) { pushBtn.hidden = true; pushText.textContent = "On iPhone, notifications work once Insidir is on your Home Screen: tap Share, then Add to Home Screen. Until then, new filings for your stocks wait in Alerts."; }
    else if (!pushable()) { pushBtn.hidden = true; pushText.textContent = "This browser can't show notifications. New filings for your stocks wait in Alerts."; }
    else {
      try { const s = await api("/v1/me/push"); if (!s?.configured) { pushBtn.hidden = true; pushText.textContent = "Device notifications aren't switched on for Insidir yet. New filings for your stocks wait in Alerts."; } }
      catch { pushBtn.hidden = true; pushText.textContent = "New filings for your stocks wait in Alerts."; }
    }
  }
  $("[data-wl-push]").addEventListener("click", async e => {
    const btn = e.currentTarget;
    btn.disabled = true;
    say("alerts", "");
    try {
      const state = await api("/v1/me/push");
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      if (await Notification.requestPermission() !== "granted") throw Error("Notifications are blocked. You can allow them later in your browser settings.");
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(state.publicKey) });
      try { await api("/v1/me/push", "POST", sub.toJSON()); } catch (err) { await sub.unsubscribe(); throw err; }
      btn.textContent = "Notifications are on";
      say("alerts", "Done. The next filing at your stocks arrives on this device.");
      capture("onboarding_alerts", { channel: "push" }); funnel("alerts-push");
    } catch (err) { say("alerts", why(err, "Notifications couldn't be turned on. Try again."), true); btn.disabled = false; }
  });

  confirm();
})();
