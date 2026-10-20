/* Alerts (alerts.html): factual notifications about new filings for the companies on the member's watchlist and the
   people they follow (GET /v1/me/notifications), mark read, a sourced explanation of each, and the real preferences
   (GET/POST /v1/me/email-preferences): in-app on or off, which events, email off / immediate / daily with the consent
   text the engine records. Nothing here is a recommendation; matching never uses holdings. */
(() => {
  "use strict";
  const X = () => window.InsidirExplain;
  const $ = s => document.querySelector(s);
  const E = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const day = v => { const d = new Date(v); return v && !isNaN(d) ? d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—"; };
  const LABEL = { insider_purchase: ["Purchase", "is-up"], insider_sale: ["Sale", "is-down"], multi_insider_purchase: ["Several insiders", "is-up"], form4_amendment: ["Amended Form 4", ""], company_disclosure: ["Company filing", ""] };
  const TYPE_TEXT = { insider_purchase: "Open-market purchases (Form 4, code P)", insider_sale: "Open-market sales (Form 4, code S)", multi_insider_purchase: "Purchases by two or more insiders within 14 days",
    form4_amendment: "Amended Form 4 filings and what changed", company_disclosure: "Other SEC filings of watched companies (8-K, 10-Q, 10-K, 13D/G and more)" };
  async function api(path, body) {
    const res = await fetch(path, { method: body ? "POST" : "GET", credentials: "same-origin", headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    let data = null; try { data = await res.json(); } catch (_) { /* not JSON */ }
    if (!res.ok) throw Object.assign(new Error((data && data.error) || "Alerts are unavailable right now."), { status: res.status });
    return data;
  }
  const safe = u => /^https:\/\/(www\.)?sec\.gov\//.test(String(u || "")) ? u : null;

  let next = null;
  async function loadNotifications(append) {
    const list = $("#ac-list"), status = $("#alerts-status");
    try {
      const r = await api("/v1/me/notifications?limit=40" + (append && next ? "&before=" + encodeURIComponent(next) : ""));
      next = r.items.length === 40 ? r.next : null;
      $("#ac-unread").textContent = r.unread ? `${r.unread} unread` : "All read";
      $("#ac-more").hidden = !next;
      if (!append) list.replaceChildren();
      if (!r.items.length && !append) { list.innerHTML = `<li class="ac-empty">No alerts yet. Alerts appear when a new filing is imported for a company on your <a href="watchlist.html">watchlist</a> or a person you <a href="people.html">follow</a>.</li>`; return; }
      for (const n of r.items) {
        const [label, tone] = LABEL[n.event.type] || ["Filing", ""];
        const li = document.createElement("li");
        li.className = "ac-item" + (n.readAt ? "" : " is-unread");
        const source = safe(n.event.sourceUrls && n.event.sourceUrls[0]);
        li.innerHTML = `${n.event.headline ? `<p class="ac-item__headline">${E(n.event.headline)}</p>` : ""}<p class="ac-item__summary"><span class="ac-badge ${tone}">${E(label)}</span>${E(n.event.summary)}</p>
          <p class="ac-item__meta">${n.event.ticker ? `<a href="company.html?ticker=${encodeURIComponent(n.event.ticker)}">${E(n.event.ticker)}</a> · ` : ""}Filed ${E(day(n.event.filingDate))} · retrieved ${E(day(n.event.retrievedAt))} · ${n.reason === "watchlist" ? "on your watchlist" : "a person you follow"}${n.event.status === "superseded" ? " · replaced by a later amendment" : ""}${source ? ` · <a href="${E(source)}" rel="noopener noreferrer" target="_blank">Original filing</a>` : ""}</p>
          <div class="ac-item__actions"><button type="button" class="ac-btn" data-explain>Explain</button>${n.readAt ? "" : `<button type="button" class="ac-btn" data-read>Mark read</button>`}</div>
          <div class="re-explain" hidden></div>`;
        X().toggle(li.querySelector("[data-explain]"), li.querySelector(".re-explain"), n.event.id);
        const read = li.querySelector("[data-read]");
        if (read) read.addEventListener("click", async () => { read.disabled = true; try { await api("/v1/me/notifications/read", { ids: [n.id] }); li.classList.remove("is-unread"); read.remove(); refreshCount(); } catch (e) { read.disabled = false; status.textContent = e.message; } });
        list.append(li);
      }
    } catch (e) {
      if (e.status === 401 || e.status === 402) return; // app.js sends the browser to sign-in or subscribe
      list.innerHTML = `<li class="ac-empty">${E(e.message)}</li>`;
    }
  }
  async function refreshCount() { try { const r = await api("/v1/me/notifications?limit=1&unread=1"); $("#ac-unread").textContent = r.unread ? `${r.unread} unread` : "All read"; } catch (_) { /* keep */ } }

  /* ---------- preferences ---------- */
  let prefs = null;
  function renderPrefs() {
    const form = $("#ac-prefs"), p = prefs;
    const hours = Array.from({ length: 24 }, (_, h) => { const local = new Date(Date.UTC(2026, 0, 1, h)).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); return `<option value="${h}"${h === p.digestHourUtc ? " selected" : ""}>${String(h).padStart(2, "0")}:00 UTC (${E(local)} your time)</option>`; }).join("");
    const emailNote = !p.emailAvailable ? "Alert emails are not available yet. Alerts appear here in the app."
      : !p.emailVerified ? `Confirm your email address in your <a href="account.html">account</a> to turn on alert emails.` : "";
    form.innerHTML = `<fieldset><legend>In the app</legend><label class="ac-choice"><input type="checkbox" name="inApp"${p.inApp ? " checked" : ""}> Create alerts for my watchlist and the people I follow</label></fieldset>
      <fieldset><legend>Which filings</legend>${p.eventTypesAvailable.map(t => `<label class="ac-choice"><input type="checkbox" name="type" value="${E(t)}"${p.eventTypes.includes(t) ? " checked" : ""}> ${E(TYPE_TEXT[t] || t)}</label>`).join("")}</fieldset>
      <fieldset><legend>Email</legend>${emailNote ? `<p class="ac-status">${emailNote}</p>` : ""}
        ${[["off", "No alert emails"], ["immediate", "Email me as alerts arrive (at most every few minutes)"], ["daily", "One daily digest"]].map(([v, t]) => `<label class="ac-choice"><input type="radio" name="emailAlerts" value="${v}"${p.emailAlerts === v ? " checked" : ""}${v !== "off" && (!p.emailAvailable || !p.emailVerified) ? " disabled" : ""}> ${E(t)}</label>`).join("")}
        <label class="ac-label" for="ac-hour">Digest time</label><select id="ac-hour" name="digestHourUtc">${hours}</select></fieldset>
      <div class="ac-consent" id="ac-consent" hidden><label class="ac-choice"><input type="checkbox" name="consent"> ${E(p.consent.text)}</label></div>
      <div><button type="submit" class="ac-btn ac-btn--ink">Save preferences</button></div>
      <p class="ac-status" id="ac-prefs-status" role="status" aria-live="polite">${p.unsubscribedAt && p.emailAlerts === "off" ? "Alert emails were turned off on " + E(day(p.unsubscribedAt)) + "." : ""}</p>`;
    const consent = $("#ac-consent");
    const sync = () => { const mode = form.querySelector('input[name="emailAlerts"]:checked')?.value || "off"; consent.hidden = !(mode !== "off" && p.emailAlerts === "off"); };
    form.querySelectorAll('input[name="emailAlerts"]').forEach(r => r.addEventListener("change", sync)); sync();
    $("#alerts-delivery").textContent = p.emailAlerts === "immediate" ? "In the app and by email as they arrive" : p.emailAlerts === "daily" ? "In the app and a daily email digest" : "In the app";
  }
  async function loadPrefs() {
    try { prefs = await api("/v1/me/email-preferences"); renderPrefs(); }
    catch (e) { $("#ac-prefs").innerHTML = `<p class="ac-status is-error">${E(e.message)}</p>`; }
  }
  async function savePrefs(e) {
    e.preventDefault();
    const form = e.target, out = $("#ac-prefs-status");
    const mode = form.querySelector('input[name="emailAlerts"]:checked')?.value || "off";
    const payload = { inApp: form.elements.inApp.checked, eventTypes: [...form.querySelectorAll('input[name="type"]:checked')].map(i => i.value), emailAlerts: mode, digestHourUtc: Number(form.elements.digestHourUtc.value) };
    if (mode !== "off" && prefs.emailAlerts === "off") {
      if (!form.elements.consent.checked) { out.className = "ac-status is-error"; out.textContent = "Tick the box to agree to receive alert emails."; return; }
      payload.consent = true; payload.consentVersion = prefs.consent.version;
    }
    out.className = "ac-status"; out.textContent = "Saving…";
    try { prefs = await api("/v1/me/email-preferences", payload); renderPrefs(); $("#ac-prefs-status").textContent = "Preferences saved."; }
    catch (err) { out.className = "ac-status is-error"; out.textContent = err.message; }
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (!$("#ac-list")) return;
    loadNotifications(false); loadPrefs();
    $("#ac-more").addEventListener("click", () => loadNotifications(true));
    $("#ac-read-all").addEventListener("click", async () => { try { await api("/v1/me/notifications/read", { all: true }); loadNotifications(false); } catch (e) { $("#alerts-status").textContent = e.message; } });
    $("#ac-prefs").addEventListener("submit", savePrefs);
  });
})();
