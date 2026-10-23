/* The first minute after paying (welcome.html, Stripe Checkout's success_url).
   1. Wait for Stripe's confirmation: access is granted by Stripe's webhook, never by this redirect, so the page
      polls /v1/billing/status?refresh=1 and moves on only once the subscription is active.
   2. Pick 3 stocks: the first is the one searched before signing up (insidir:first-ticker), saved to the watchlist.
   3. The latest insider trade at the first stock, in one sentence, linked to its SEC filing.
   4. Alerts: notifications on this device (permission asked only on the button) and email alerts (with the
      consent text the server stores). Either can be skipped. */
(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const TICK = /^[A-Z][A-Z0-9.-]{0,9}$/;
  const clean = v => String(v || "").trim().toUpperCase().replace(/^\$/, "");
  const capture = (name, props) => { try { window.posthog?.capture?.(name, props || {}); } catch { /* never break the page */ } };
  const funnel = (label) => { try { window.InsidirFunnel?.send("onboarding_step", { label }); } catch { /* never break the page */ } };
  const api = async (path, method = "GET", body) => {
    const res = await fetch(path, { method, credentials: "same-origin", headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    let data = {};
    try { data = await res.json(); } catch { data = {}; }
    if (!res.ok) throw Object.assign(Error(data.error || "Something went wrong. Try again."), { status: res.status });
    return data;
  };
  function show(step) {
    for (const s of document.querySelectorAll("[data-wl-step]")) s.hidden = s.dataset.wlStep !== step;
    const order = ["stocks", "trade", "alerts"], i = order.indexOf(step);
    for (const d of document.querySelectorAll("[data-wl-dot]")) d.classList.toggle("is-on", order.indexOf(d.dataset.wlDot) <= Math.max(0, i));
    const h = $(`[data-wl-step="${step}"] h1`);
    if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
  }
  const say = (step, text, error) => { const m = $(`[data-wl-step="${step}"] [data-wl-msg]`); if (m) { m.textContent = text; m.classList.toggle("is-error", !!error); } };

  /* ---------- 1. Stripe's confirmation ---------- */
  async function confirm() {
    for (let i = 0; i < 30; i++) {
      try {
        const s = await api("/v1/billing/status" + (i % 3 === 0 ? "?refresh=1" : ""));
        if (s.active) { capture("trial_confirmed"); return startStocks(); }
      } catch (e) {
        if (e.status === 401) { location.href = "/signin.html?next=" + encodeURIComponent("/welcome.html"); return; }
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    $("[data-wl-confirm-text]").textContent = "Stripe hasn't confirmed your payment yet. This page keeps checking; there's no need to pay again.";
    say("confirm", "If it takes more than a few minutes, open Billing or email hello@aethric.llc.");
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
    if (empty) { empty.value = chip.textContent; chip.hidden = true; }
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
    } catch (err) { say("stocks", err.message, true); }
    finally { btn.disabled = false; }
  });

  /* ---------- 3. The latest trade ---------- */
  const money = v => { const n = Number(v); if (!Number.isFinite(n) || n <= 0) return null; const a = Math.abs(n);
    return a >= 1e9 ? "$" + (a / 1e9).toFixed(1).replace(/\.0$/, "") + "B" : a >= 1e6 ? "$" + (a / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : a >= 1e3 ? "$" + Math.round(a / 1e3) + "K" : "$" + Math.round(a); };
  const day = v => { const d = String(v || "").slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : null; };
  const person = raw => { const s = String(raw || "").trim().replace(/\s+/g, " "); if (!s) return "An insider"; if (s !== s.toUpperCase()) return s;
    const p = s.toLowerCase().split(" ").map(w => w.replace(/(^|[-'])([a-z])/g, (_, a, b) => a + b.toUpperCase())).map(w => /^[A-Z]$/.test(w) ? w + "." : w);
    return p.length > 1 && !/,/.test(s) ? [...p.slice(1), p[0]].join(" ") : p.join(" "); };
  function sentence(r) {
    const verb = r.transaction_code === "P" ? "bought" : r.transaction_code === "S" ? "sold" : "reported";
    const value = money(r.estimated_value), shares = Number(r.shares);
    const amount = value ? value + " of " : shares > 0 ? Math.round(shares).toLocaleString("en-US") + " shares of " : "shares of ";
    const plan = verb === "sold" && r.rule_10b5_1 === true ? ", under a plan set up in advance" : "";
    return person(r.owner_name) + " " + verb + " " + amount + String(r.ticker || first).toUpperCase() + " stock" + (day(r.transaction_date) ? " on " + day(r.transaction_date) : "") + plan + ".";
  }
  async function startTrade() {
    show("trade");
    $("[data-wl-ticker]").textContent = first;
    const box = $("[data-wl-trade]");
    try {
      const rows = (await api("/v1/transactions?limit=20&ticker=" + encodeURIComponent(first))).items || [];
      const r = rows.find(x => ["P", "S"].includes(x.transaction_code)) || rows[0];
      box.replaceChildren();
      const p = document.createElement("p");
      if (!r) { p.textContent = "No insider at " + first + " has filed a trade we have on record yet. You'll get an alert the minute one does."; box.append(p); return; }
      p.textContent = sentence(r);
      box.append(p);
      if (/^https:\/\/www\.sec\.gov\//.test(String(r.source_url || ""))) {
        const a = document.createElement("a");
        a.href = r.source_url; a.target = "_blank"; a.rel = "noopener"; a.textContent = "See the SEC filing ↗";
        box.append(a);
      }
    } catch { box.replaceChildren(Object.assign(document.createElement("p"), { textContent: "We couldn't load " + first + "'s latest trade just now. It's on your dashboard." })); }
  }
  $("[data-wl-next]").addEventListener("click", () => { funnel("trade"); startAlerts(); });

  /* ---------- 4. Alerts ---------- */
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const pushable = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && window.isSecureContext;
  const b64 = key => { const s = (key + "=".repeat((4 - key.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/"); return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
  let consent = null;
  async function startAlerts() {
    show("alerts");
    const pushBtn = $("[data-wl-push]"), pushText = $("[data-wl-push-text]");
    if (ios && !standalone) { pushBtn.hidden = true; pushText.textContent = "On iPhone, notifications work once Insidir is on your Home Screen: tap Share, then Add to Home Screen. Email alerts work right now."; }
    else if (!pushable()) { pushBtn.hidden = true; pushText.textContent = "This browser can't show notifications. Email alerts work everywhere."; }
    else {
      try { const s = await api("/v1/me/push"); if (!s.configured) { pushBtn.hidden = true; pushText.textContent = "Phone notifications aren't switched on yet. Email alerts work right now."; } }
      catch { pushBtn.hidden = true; }
    }
    try {
      const prefs = await api("/v1/me/email-preferences");
      consent = prefs.consent;
      if (prefs.consent?.text) $("[data-wl-consent-text]").textContent = prefs.consent.text;
      if (prefs.emailAlerts && prefs.emailAlerts !== "off") { $("[data-wl-email]").textContent = "Email alerts are on"; $("[data-wl-email]").disabled = true; $("[data-wl-consent]").closest("label").hidden = true; }
      else if (!prefs.emailAvailable) { $("[data-wl-email]").hidden = true; $("[data-wl-consent]").closest("label").hidden = true; }
    } catch { /* the buttons explain themselves on failure */ }
  }
  $("[data-wl-consent]").addEventListener("change", e => { $("[data-wl-email]").disabled = !e.currentTarget.checked; });
  $("[data-wl-email]").addEventListener("click", async e => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await api("/v1/me/email-preferences", "POST", { emailAlerts: "immediate", consent: true, consentVersion: consent?.version });
      btn.textContent = "Email alerts are on"; $("[data-wl-consent]").closest("label").hidden = true;
      capture("onboarding_alerts", { channel: "email" }); funnel("alerts-email");
    } catch (err) { say("alerts", err.message, true); btn.disabled = false; }
  });
  $("[data-wl-push]").addEventListener("click", async e => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const state = await api("/v1/me/push");
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      if (await Notification.requestPermission() !== "granted") throw Error("Notifications are blocked. You can allow them later in your browser settings.");
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(state.publicKey) });
      try { await api("/v1/me/push", "POST", sub.toJSON()); } catch (err) { await sub.unsubscribe(); throw err; }
      btn.textContent = "Notifications are on";
      capture("onboarding_alerts", { channel: "push" }); funnel("alerts-push");
    } catch (err) { say("alerts", err.message, true); btn.disabled = false; }
  });

  confirm();
})();
