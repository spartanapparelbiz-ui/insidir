/* Insidir Intelligence (intelligence.html): Briefing, Investigate and Mirror, shown one at a time as tabs (the
   address keeps the open one: #briefing, #investigate, #mirror). Each loads its data the first time it is opened.
   Every value on this page comes from the /v1 API and is shown as received; text from the server is escaped before
   it is placed in the page, and only https links to sec.gov (or Insidir's own pages) are rendered as links.
   401/402 responses are handled by app.js (sign in / subscribe). Motion is opacity only and stops under
   prefers-reduced-motion. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const secUrl = u => { try { const x = new URL(u); return x.protocol === "https:" && (x.hostname === "www.sec.gov" || x.hostname === "data.sec.gov") ? x.href : null; } catch { return null; } };
  const tickerOk = t => typeof t === "string" && /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(t);
  const cikOk = c => typeof c === "string" && /^\d{1,10}$/.test(c);

  async function api(path, { method = "GET", body } = {}) {
    let res;
    try {
      res = await fetch(path, { method, credentials: "same-origin", headers: body ? { "Content-Type": "application/json", Accept: "application/json" } : { Accept: "application/json" }, body: body ? JSON.stringify(body) : undefined });
    } catch { throw Object.assign(new Error("Insidir could not be reached. Check your connection and try again."), { status: 0 }); }
    let data = null;
    try { data = await res.json(); } catch { /* not JSON */ }
    if (!res.ok) throw Object.assign(new Error((data && data.error) || "Request failed (" + res.status + ")"), { status: res.status, data });
    return data;
  }

  /* ---------- formatting (display only; never computes a figure) ---------- */
  const DAY = { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" };
  const fmtDay = v => { if (!v) return "Not stated"; const d = new Date(String(v).length === 10 ? v + "T12:00:00Z" : v); return Number.isFinite(d.getTime()) ? d.toLocaleDateString("en-US", DAY) : "Not stated"; };
  const fmtTime = v => { if (!v) return "Not stated"; const d = new Date(v); return Number.isFinite(d.getTime()) ? d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Not stated"; };
  const fmtRange = r => !r ? "Not stated" : r.from === r.to ? fmtDay(r.from) : fmtDay(r.from) + " – " + fmtDay(r.to);
  const money = (n, cents = false) => n == null || !Number.isFinite(Number(n)) ? "—" : "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
  const compact = n => { const v = Number(n); if (!Number.isFinite(v)) return "—"; const a = Math.abs(v); return a >= 1e9 ? "$" + (v / 1e9).toFixed(a >= 1e11 ? 0 : 1) + "B" : a >= 1e6 ? "$" + (v / 1e6).toFixed(a >= 1e8 ? 0 : 1) + "M" : a >= 1e3 ? "$" + (v / 1e3).toFixed(0) + "K" : "$" + v.toFixed(0); };
  const num = n => n == null ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: 4 });
  const pct = (x, d = 1) => x == null ? "—" : (x * 100).toFixed(d) + "%";
  const ago = v => { const t = Date.parse(v); if (!Number.isFinite(t)) return ""; const m = Math.round((Date.now() - t) / 60000); return m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " d ago"; };
  const media = () => window.InsidirMedia;
  const logo = (ticker, cik, name) => { try { return tickerOk(ticker) && media() ? media().logo(ticker, 28, { cik, name, label: name || ticker }) : ""; } catch { return ""; } };
  const hydrate = root => { try { media() && media().hydrate(root); } catch { /* tiles are decoration */ } };
  const companyLink = (t, label) => tickerOk(t) ? '<a class="ix-ticker" href="company.html?ticker=' + encodeURIComponent(t) + '">' + esc(label || t) + "</a>" : '<span class="ix-ticker">' + esc(label || "—") + "</span>";

  /* Count up a figure when it changes (skipped under reduced motion). */
  function tween(el, to, format) {
    const from = Number(el.dataset.value || 0);
    el.dataset.value = String(to);
    if (reduce.matches || !Number.isFinite(from) || from === to) { el.textContent = format(to); return; }
    const start = performance.now(), dur = 420;
    const step = now => { const k = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = format(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); else el.textContent = format(to); };
    requestAnimationFrame(step);
  }
  const store = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };
  const errorBlock = (title, e, retry) => '<div class="ix-error" role="alert"><strong>' + esc(title) + "</strong>" + esc(e && e.message || "Something went wrong.") + (retry ? ' <button type="button" class="ix-btn" data-retry="' + esc(retry) + '" style="margin-top:12px">Try again</button>' : "") + "</div>";

  /* ---------- three experiences, one at a time ---------- */
  const TABS = ["briefing", "investigate", "mirror"];
  const opened = {};
  function select(name, { scroll = false, focus = false } = {}) {
    if (!TABS.includes(name)) name = "briefing";
    for (const t of TABS) {
      const on = t === name, tab = $("#ix-tab-" + t), panel = document.getElementById(t);
      if (tab) { tab.setAttribute("aria-selected", String(on)); tab.tabIndex = on ? 0 : -1; }
      if (panel) panel.hidden = !on;
    }
    $$("[data-open]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.open === name)));
    const inst = $("[data-instrument]");
    if (inst) inst.dataset.active = name;
    if (location.hash !== "#" + name) try { history.replaceState(null, "", location.pathname + location.search + "#" + name); } catch { /* keep the URL */ }
    // Each experience asks for its data the first time it is opened.
    if (!opened[name]) { opened[name] = true; if (name === "briefing") loadBriefing(); if (name === "mirror") loadMirror(); }
    if (focus) { const t = $("#ix-tab-" + name); if (t) t.focus(); }
    if (scroll) { const bar = $(".ix-bar"), panel = document.getElementById(name); if (panel) panel.scrollIntoView({ block: "start", behavior: reduce.matches ? "auto" : "smooth" }); else if (bar) bar.scrollIntoView({ block: "start" }); }
  }
  function wireTabs() {
    const tabs = $$("[role=tab][data-tab]");
    tabs.forEach(t => t.addEventListener("click", () => {
      // From under the sticky bar, open the new panel at its top; from the hero, stay put.
      const stuck = $(".ix-bar").getBoundingClientRect().top < 140;
      select(t.dataset.tab, { scroll: stuck });
    }));
    $(".ix-tabs").addEventListener("keydown", e => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      const to = e.key === "ArrowRight" ? (i + 1) % tabs.length : e.key === "ArrowLeft" ? (i - 1 + tabs.length) % tabs.length : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1;
      if (to < 0) return;
      e.preventDefault();
      select(tabs[to].dataset.tab, { focus: true });
    });
    $$("[data-open]").forEach(b => b.addEventListener("click", () => select(b.dataset.open, { scroll: true })));
    // In-page links such as "Ask a question instead" (#investigate) open their tab.
    window.addEventListener("hashchange", () => { const h = location.hash.slice(1); if (TABS.includes(h)) select(h, { scroll: true }); });
  }
  /* Radio groups move with the arrow keys, as radio groups do. */
  function wireRadios() {
    $$("main.ix [role=radiogroup]").forEach(g => {
      const items = () => $$("[role=radio]", g);
      const sync = () => { const list = items(), on = list.find(x => x.getAttribute("aria-checked") === "true") || list[0]; list.forEach(x => { x.tabIndex = x === on ? 0 : -1; }); };
      sync();
      new MutationObserver(sync).observe(g, { attributes: true, subtree: true, attributeFilter: ["aria-checked"] });
      g.addEventListener("keydown", e => {
        const list = items(), i = list.indexOf(document.activeElement);
        if (i < 0) return;
        const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        const next = list[(i + step + list.length) % list.length];
        next.focus(); next.click();
      });
    });
  }

  /* ---------- AI availability (decides whether summary buttons are offered at all) ---------- */
  let aiConfigured = false;
  async function aiStatus() {
    try {
      const s = await api("/v1/ai/status");
      aiConfigured = !!s.configured;
      const el = $("[data-ai-status]");
      if (el) el.textContent = aiConfigured ? "Plain-English summaries on · cached, cited, checked" : "Facts from SEC records · AI summaries off";
    } catch { aiConfigured = false; }
  }

  /* ======================= BRIEFING ======================= */
  const brief = { days: 7, order: "priority", data: null };
  const feed = $("[data-feed]");

  function storyHtml(s, i) {
    const lead = i === 0 && brief.order === "priority";
    const kind = s.kind === "company_report" ? "Company report" : "Insider filings";
    const people = (s.people || []).map(p => {
      const inner = esc(p.name) + (p.role ? "<small>" + esc(p.role) + "</small>" : "");
      return cikOk(p.cik) ? '<li><a href="person.html?cik=' + encodeURIComponent(p.cik) + '">' + inner + "</a></li>" : '<li><span class="ix-person">' + inner + "</span></li>";
    }).join("") + (s.peopleCount > (s.people || []).length ? '<li><span class="ix-person">+' + (s.peopleCount - s.people.length) + " more</span></li>" : "");
    const sources = (s.sources || []).map(src => {
      const url = secUrl(src.url);
      return url ? '<li><a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(src.label) + " ↗</a><small>Filed " + esc(fmtTime(src.filedAt)) + (src.people && src.people.length ? " · " + esc(src.people.join(", ")) : "") + "</small></li>" : "";
    }).join("");
    const firstAcc = s.kind === "insider_filings" ? (s.sources || []).map(x => x.accession).find(a => /^\d{18}$/.test(String(a || ""))) : null;
    const related = (s.related || []).map(id => (brief.data.stories || []).find(x => x.id === id)).filter(Boolean);
    return '<article class="ix-story' + (lead ? " ix-story--lead" : "") + '" data-story="' + esc(s.id) + '">' +
      '<div class="ix-story__side"><div class="ix-story__mark">' + logo(s.ticker, s.issuerCik, s.company) + companyLink(s.ticker, s.ticker || s.company) + "</div>" +
      '<span class="ix-story__kind">' + kind + "</span>" + (s.isNew ? '<span class="ix-new">New</span>' : "") + '<span class="ix-story__when">' + esc(ago(s.disclosedAt)) + "</span></div>" +
      '<div class="ix-story__body"><h3 class="ix-story__head">' + esc(s.headline) + "</h3>" +
      (s.company && s.company !== s.ticker ? '<p class="ix-story__company">' + esc(s.company) + (s.filingsCount > 1 ? " · " + s.filingsCount + " filings grouped" : "") + "</p>" : "") +
      '<ul class="ix-facts">' + (s.facts || []).map(f => "<li>" + esc(f) + "</li>").join("") + "</ul>" +
      (people ? '<ul class="ix-people" aria-label="People">' + people + "</ul>" : "") +
      '<dl class="ix-dates"><div><dt>Event</dt><dd>' + esc(fmtRange(s.eventDate)) + "</dd></div><div><dt>Disclosed</dt><dd>" + esc(fmtTime(s.disclosedAt)) + "</dd></div><div><dt>Retrieved by Insidir</dt><dd>" + esc(fmtTime(s.retrievedAt)) + "</dd></div></dl>" +
      '<p class="ix-why"><b>Why it’s here:</b> ' + esc((s.why || []).map(w => w.text).join(" · ") || "Matches your briefing") + "</p>" +
      '<details class="ix-more"><summary>Sources, ordering and context</summary><div class="ix-more__body">' +
        (sources ? '<div><p class="ix-sub">Original documents</p><ul class="ix-sources">' + sources + "</ul></div>" : '<p class="ix-plain">No SEC document link was recorded for this item.</p>') +
        '<div><p class="ix-sub">Ordering</p><p class="ix-plain">' + esc((s.ranking && s.ranking.reasons || []).join(" · ") || "Newest first") + "</p></div>" +
        (related.length ? '<div><p class="ix-sub">Related in this briefing</p><ul class="ix-sources">' + related.map(r => '<li><a href="#" data-jump="' + esc(r.id) + '">' + esc(r.headline) + "</a></li>").join("") + "</ul></div>" : "") +
        (aiConfigured && firstAcc ? '<div data-explain-box><button type="button" class="ix-btn" data-explain="' + esc(firstAcc) + '">Explain this filing in plain English</button></div>' : "") +
      "</div></details></div></article>";
  }

  function renderBriefing() {
    const d = brief.data;
    feed.setAttribute("aria-busy", "false");
    const subj = d.subjects || {};
    const edition = $("[data-edition]");
    const nT = Number(subj.tickers) || 0, nP = Number(subj.people) || 0;
    if (edition) edition.textContent = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }) +
      " · Edition for " + nT + " compan" + (nT === 1 ? "y" : "ies") + " and " + nP + " " + (nP === 1 ? "person" : "people") + " you follow" + (d.since ? " · new since " + fmtTime(d.since) : "");
    const span = brief.days === 1 ? "in the last 24 hours" : "in the last " + brief.days + " days";
    const heroMeta = $("[data-hero-brief]");
    if (d.needsSetup) {
      if (heroMeta) heroMeta.textContent = "Follow a company to begin";
      feed.innerHTML = '<div class="ix-empty"><h3>Your briefing starts with what you follow.</h3><p>Add companies to your watchlist or follow the people who file at them. Insidir then reads every new Form 4 and company report for you, groups what belongs together and lists it here with the original SEC documents.</p>' +
        '<div class="ix-empty__actions"><form class="ix-inline" data-quick-add><label class="sr-only" for="ix-quick">Ticker</label><input id="ix-quick" maxlength="15" placeholder="Ticker, e.g. NVDA" autocomplete="off" autocapitalize="characters" required><button class="ix-btn ix-btn--solid" type="submit">Add to watchlist</button></form>' +
        '<a class="ix-btn" href="explore.html">Browse companies</a><a class="ix-btn" href="people.html">Find people</a></div><p class="ix-note" data-quick-status role="status"></p></div>';
      $("[data-quick-add]").addEventListener("submit", quickAdd);
    } else {
      const list = [...(d.stories || [])];
      if (brief.order === "latest") list.sort((a, b) => String(b.disclosedAt).localeCompare(String(a.disclosedAt)));
      const fresh = list.filter(s => s.isNew).length;
      if (heroMeta) heroMeta.textContent = list.length ? list.length + " " + (list.length === 1 ? "story" : "stories") + (fresh ? " · " + fresh + " new" : "") + " " + span : "Quiet " + span;
      feed.innerHTML = list.length ? list.map(storyHtml).join("") :
        '<div class="ix-empty"><h3>Nothing new in the last ' + (brief.days === 1 ? "24 hours" : brief.days + " days") + ".</h3><p>None of the companies or people you follow filed a Form 4 or company report that Insidir has indexed in this window. Disclosures can arrive days after an event, so this can change.</p>" +
        '<div class="ix-empty__actions">' + (brief.days < 30 ? '<button type="button" class="ix-btn" data-widen>Show the last 30 days</button>' : "") + '<a class="ix-btn" href="#investigate">Ask a question instead</a></div></div>';
      store("insidir:onboard:briefing", "1");
      const widen = $("[data-widen]", feed);
      if (widen) widen.addEventListener("click", () => setWindow(30));
      hydrate(feed);
    }
    $("[data-rules]").innerHTML = (d.rankingRules || []).map(r => "<li><span>" + esc(r.label) + "</span><b>" + (r.points > 0 ? "+" : "") + r.points + "</b></li>").join("");
    const cov = d.coverage || {};
    $("[data-coverage]").innerHTML = (cov.notes || []).map(n => '<p class="ix-note">' + esc(n) + "</p>").join("") +
      (cov.quietCount ? '<p class="ix-note">Quiet in this window (' + cov.quietCount + "):</p><ul class=\"ix-quiet\">" + (cov.quiet || []).map(t => "<li>" + esc(t) + "</li>").join("") + "</ul>" : "");
    renderDelivery(d.preferences && d.preferences.frequency, d.delivery || {});
  }

  function renderDelivery(freq, del) {
    $$("[data-frequency] button").forEach(b => b.setAttribute("aria-checked", String(b.dataset.frequencyValue === freq)));
    const el = $("[data-delivery]");
    if (!el) return;
    const label = freq === "daily" ? "a daily digest" : freq === "weekly" ? "a weekly digest" : "an alert for each new filing";
    let text;
    if (!del.pushConfigured) text = "Device notifications are not available on this deployment. Your briefing still updates here.";
    else if (!del.devices) text = "Your choice is saved, but no device has notifications turned on, so nothing will be sent. <a href=\"alerts.html\">Turn them on in Alerts</a>.";
    else text = "You will receive " + esc(label) + " on " + del.devices + " device" + (del.devices === 1 ? "" : "s") + ". Last 7 days: " + del.sent7d + " delivered" + (del.failed7d ? ", " + del.failed7d + " failed" : "") + (del.pending ? ", " + del.pending + " waiting" : "") + "." + (del.lastSentAt ? " Last delivered " + esc(fmtTime(del.lastSentAt)) + "." : "");
    el.innerHTML = text;
  }

  async function loadBriefing() {
    feed.setAttribute("aria-busy", "true");
    if (!brief.data) feed.innerHTML = '<div class="ix-skel" aria-hidden="true"><i></i><i></i><i></i></div><div class="ix-skel" aria-hidden="true"><i></i><i></i></div>';
    try {
      brief.data = await api("/v1/me/intelligence/briefing?days=" + brief.days);
      renderBriefing();
    } catch (e) {
      feed.setAttribute("aria-busy", "false");
      if (e.status === 401 || e.status === 402) return;
      feed.innerHTML = errorBlock("The briefing could not be loaded.", e, "briefing");
      $("[data-delivery]").textContent = "Delivery settings are unavailable until the briefing loads.";
      $("[data-rules]").innerHTML = "<li>Shown once the briefing loads.</li>";
      $("[data-coverage]").innerHTML = '<p class="ix-note">Shown once the briefing loads.</p>';
    }
  }
  function setWindow(days) {
    brief.days = days;
    $$("[data-window] button").forEach(b => b.setAttribute("aria-checked", String(Number(b.dataset.days) === days)));
    loadBriefing();
  }
  async function quickAdd(ev) {
    ev.preventDefault();
    const input = $("#ix-quick"), status = $("[data-quick-status]");
    const t = input.value.trim().toUpperCase().replace(/^\$/, "");
    if (!tickerOk(t)) { status.textContent = "Enter a ticker symbol such as NVDA."; input.setAttribute("aria-invalid", "true"); return; }
    input.removeAttribute("aria-invalid");
    status.textContent = "Adding " + t + "…";
    try { await api("/v1/me/watchlist", { method: "POST", body: { ticker: t } }); status.textContent = t + " added."; loadBriefing(); }
    catch (e) { status.textContent = e.message; }
  }
  async function explain(btn) {
    const box = btn.closest("[data-explain-box]");
    btn.disabled = true; btn.textContent = "Reading the filing…";
    try {
      const r = await api("/v1/ai/explain?accession=" + encodeURIComponent(btn.dataset.explain));
      box.innerHTML = '<div class="ix-ai"><span class="ix-k ix-k--ai">AI</span><p>' + esc(r.explanation) + "</p><small>Written by AI from this filing’s reported lines and checked against its figures" + (r.cached ? " · shared summary" : "") + ". The SEC document above is the authoritative record.</small></div>";
    } catch (e) {
      box.innerHTML = '<p class="ix-plain">' + esc(e.status === 429 ? e.message : e.status === 422 ? "The summary did not pass Insidir’s source checks, so it is not shown. The filing above is the full record." : "A plain-English summary is not available right now. The filing above is the full record.") + "</p>";
    }
  }
  function wireBriefing() {
    $$("[data-window] button").forEach(b => b.addEventListener("click", () => setWindow(Number(b.dataset.days))));
    $$("[data-order] button").forEach(b => b.addEventListener("click", () => {
      brief.order = b.dataset.orderBy;
      $$("[data-order] button").forEach(x => x.setAttribute("aria-checked", String(x === b)));
      if (brief.data) renderBriefing();
    }));
    $$("[data-frequency] button").forEach(b => b.addEventListener("click", async () => {
      const value = b.dataset.frequencyValue, el = $("[data-delivery]");
      const before = $$("[data-frequency] button").find(x => x.getAttribute("aria-checked") === "true");
      $$("[data-frequency] button").forEach(x => x.setAttribute("aria-checked", String(x === b)));
      el.textContent = "Saving…";
      try {
        await api("/v1/me/intelligence/preferences", { method: "POST", body: { frequency: value } });
        if (brief.data) { brief.data.preferences = { ...(brief.data.preferences || {}), frequency: value }; renderDelivery(value, brief.data.delivery || {}); }
        else el.textContent = "Saved.";
      } catch (e) {
        $$("[data-frequency] button").forEach(x => x.setAttribute("aria-checked", String(x === before)));
        el.textContent = "Not saved: " + e.message;
      }
    }));
    feed.addEventListener("click", ev => {
      const ex = ev.target.closest("[data-explain]");
      if (ex) { explain(ex); return; }
      const jump = ev.target.closest("[data-jump]");
      if (jump) { ev.preventDefault(); const t = feed.querySelector('[data-story="' + CSS.escape(jump.dataset.jump) + '"]'); if (t) { t.scrollIntoView({ behavior: reduce.matches ? "auto" : "smooth", block: "start" }); const d = t.querySelector("details"); if (d) d.open = true; } }
      if (ev.target.closest('[data-retry="briefing"]')) loadBriefing();
    });
  }

  /* ======================= INVESTIGATE ======================= */
  const thread = $("[data-thread]"), form = $("[data-ask]"), field = $("#ix-question"), askError = $("[data-ask-error]");
  let lastPlan = null, seq = 0;

  function autosize() { field.style.height = "auto"; field.style.height = Math.min(220, field.scrollHeight) + "px"; }
  const cites = (ids, aid) => (ids || []).length ? '<sup class="ix-cites">' + ids.map(n => '<a class="ix-cite" href="#ix-src-' + aid + "-" + Number(n) + '" aria-label="Source ' + Number(n) + '">' + Number(n) + "</a>").join("") + "</sup>" : "";
  const recordTable = (records, aid) => !records || !records.length ? "" :
    '<div class="ix-tablewrap"><table class="ix-table ix-table--stack"><thead><tr><th>Date</th><th>Person</th><th>Transaction</th><th class="num">Shares</th><th class="num">Price</th><th class="num">Reported value</th><th>Source</th></tr></thead><tbody>' +
    records.map(r => "<tr><td data-label=\"Traded\">" + esc(fmtDay(r.transactionDate)) + "<small>Disclosed " + esc(fmtDay(r.disclosedAt)) + "</small></td>" +
      '<td class="ix-wide">' + (cikOk(String(r.personCik || "")) ? '<a href="person.html?cik=' + encodeURIComponent(r.personCik) + '"><strong>' + esc(r.person) + "</strong></a>" : "<strong>" + esc(r.person) + "</strong>") + (r.role ? "<small>" + esc(r.role) + "</small>" : "") + (r.ticker && r.company ? "<small>" + esc(r.ticker) + "</small>" : "") + "</td>" +
      '<td class="ix-wide">' + esc(r.codeLabel) + (r.code ? " (" + esc(r.code) + ")" : "") + (r.derivative ? "<small>Derivative security</small>" : "") + (r.amendment ? "<small>From an amended report</small>" : "") + "</td>" +
      '<td class="num" data-label="Shares">' + esc(num(r.shares)) + '</td><td class="num" data-label="Price">' + (r.price == null ? "—" : "$" + esc(Number(r.price).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 }))) + '</td><td class="num" data-label="Value">' + esc(money(r.value)) + "</td>" +
      '<td data-label="Source">' + cites([r.citation], aid) + "</td></tr>").join("") + "</tbody></table></div>";

  function answerHtml(a, aid) {
    const plan = a.plan || {};
    const planBits = [];
    if (plan.companies && plan.companies.length) planBits.push("<li><b>Companies</b>" + plan.companies.map(c => esc(c.ticker)).join(", ") + "</li>");
    if (plan.scope === "followed_people") planBits.push("<li><b>People</b>You follow</li>");
    if (plan.scope === "watchlist") planBits.push("<li><b>Scope</b>Your watchlist</li>");
    if (plan.scope === "market") planBits.push("<li><b>Scope</b>All indexed companies</li>");
    if (plan.timeLabel) planBits.push("<li><b>Period</b>" + esc(plan.timeLabel) + "</li>");
    if (plan.categories && plan.categories.length) planBits.push("<li><b>Records</b>" + plan.categories.map(c => c === "reported_sale" ? "Sales" : "Purchases").join(", ") + "</li>");
    else if (plan.intent) planBits.push("<li><b>Records</b>" + esc({ insider_activity: "Form 4 transactions", filings: "SEC filings", overview: "Form 4 and SEC filings", compare: "Form 4, side by side", changes_since_visit: "Your briefing" }[plan.intent] || plan.intent) + "</li>");
    if (plan.usedContext) planBits.push("<li><b>Follow-up</b>Kept your previous focus</li>");
    const status = { answered: "Answer from indexed records", no_data: "No matching records", unresolved: "Needs a company or scope", refused: "Outside Insidir’s scope" }[a.status] || "";
    let main = "";
    if (a.status === "refused") main = '<div class="ix-summary"><p>' + esc(a.message) + "</p></div>";
    else {
      main += '<div class="ix-summary">' + (a.summary || []).map(s => "<p>" + esc(s.text) + cites(s.cites, aid) + "</p>").join("") + "</div>";
      if (a.synthesis && a.synthesis.available) main += '<div class="ix-block" data-synth-box><p class="ix-sub">Plain-English synthesis</p><p class="ix-plain" style="margin-bottom:12px">An AI-written reading of the cited records above. It is checked against them before it is shown; if a check fails, nothing is shown.</p><button type="button" class="ix-btn" data-synth>Write a synthesis</button></div>';
      for (const sec of a.sections || []) {
        if (sec.kind === "comparison") {
          main += '<section class="ix-block"><h3 class="ix-block__title">' + esc(sec.title) + '</h3><div class="ix-tablewrap"><table class="ix-table ix-table--stack"><thead><tr><th>Company</th><th class="num">Filings</th><th class="num">People</th><th class="num">Sales</th><th class="num">Sale value</th><th class="num">Purchases</th><th class="num">Purchase value</th><th class="num">Other</th><th>Last disclosed</th></tr></thead><tbody>' +
            sec.rows.map(r => '<tr><td class="ix-wide">' + companyLink(r.ticker) + "<small>" + esc(r.company) + '</small></td><td class="num" data-label="Filings">' + r.filings + '</td><td class="num" data-label="People">' + r.people + '</td><td class="num" data-label="Sales">' + r.sales + '</td><td class="num" data-label="Sale value">' + esc(money(r.saleValue)) + '</td><td class="num" data-label="Purchases">' + r.purchases + '</td><td class="num" data-label="Purchase value">' + esc(money(r.purchaseValue)) + '</td><td class="num" data-label="Other">' + r.other + '</td><td data-label="Last disclosed">' + esc(fmtDay(r.lastDisclosed)) + cites(r.citation ? [r.citation] : [], aid) + "</td></tr>").join("") +
            "</tbody></table></div></section>";
          continue;
        }
        main += '<section class="ix-block"><h3 class="ix-block__title">' + (sec.ticker ? logo(sec.ticker, null, sec.company) : "") + esc(sec.title) + (sec.ticker && sec.kind !== "story" ? ' <a class="ix-btn" href="company.html?ticker=' + encodeURIComponent(sec.ticker) + '">Company report</a>' : "") + "</h3>" +
          (sec.facts && sec.facts.length ? '<ul class="ix-facts">' + sec.facts.map(f => "<li>" + esc(f.text) + cites(f.cites, aid) + "</li>").join("") + "</ul>" : "") +
          (sec.filings && sec.filings.length ? '<p class="ix-sub" style="margin-top:18px">SEC filings in this period</p><ul class="ix-facts">' + sec.filings.map(f => "<li>" + esc(f.text) + cites(f.cites, aid) + "</li>").join("") + "</ul>" : "") +
          recordTable(sec.records, aid) + "</section>";
      }
    }
    const sources = (a.citations || []).map(c => { const url = secUrl(c.url); return '<li id="ix-src-' + aid + "-" + c.id + '"><b>' + c.id + "</b><span>" + (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(c.label) + " ↗</a>" : esc(c.label)) + "<br>" + (c.date ? "Event " + esc(fmtDay(c.date)) + " · " : "") + "Filed " + esc(fmtDay(c.publishedAt)) + "</span></li>"; }).join("");
    const side = (sources ? '<section class="ix-card"><h4 class="ix-card__title">Sources <span class="ix-k ix-k--source">Source</span></h4><ol class="ix-srclist">' + sources + "</ol></section>" : "") +
      ((a.gaps || []).length ? '<section class="ix-card"><h4 class="ix-card__title">What this answer cannot tell you</h4><ul class="ix-gaps">' + a.gaps.map(g => "<li>" + esc(g) + "</li>").join("") + "</ul></section>" : "") +
      ((a.followUps || []).length ? '<section class="ix-card"><h4 class="ix-card__title">Ask next</h4><ul class="ix-follow">' + a.followUps.map(f => '<li><button type="button" data-follow>' + esc(f) + "</button></li>").join("") + "</ul></section>" : "");
    return '<p class="ix-status">' + esc(status) + " · retrieved " + esc(fmtTime(a.retrievedAt)) + "</p>" + (planBits.length ? '<ul class="ix-plan" aria-label="How Insidir read the question">' + planBits.join("") + "</ul>" : "") +
      '<div class="ix-answer__grid"><div>' + main + '</div><aside class="ix-side">' + side + "</aside></div>";
  }

  async function ask(question, { followUp = false } = {}) {
    const q = String(question || "").trim();
    askError.hidden = true;
    if (!q) { askError.textContent = "Type a question, or choose one of the examples."; askError.hidden = false; field.focus(); return; }
    if (q.length > 400) { askError.textContent = "Questions are limited to 400 characters."; askError.hidden = false; return; }
    const aid = "a" + (++seq);
    // Earlier answers fold away so the newest stays in reach; they remain one tap away.
    $$(".ix-answer", thread).forEach(el => { if (el.closest(".ix-prev")) return; const d = document.createElement("details"); d.className = "ix-prev"; d.innerHTML = "<summary>" + esc(el.dataset.q) + "</summary>"; el.replaceWith(d); d.appendChild(el); });
    const box = document.createElement("article");
    box.className = "ix-answer"; box.dataset.q = q; box.id = aid;
    // What is happening, said once and truthfully: no staged progress that the server does not report.
    box.innerHTML = '<h3 class="ix-answer__q">' + esc(q) + '</h3><p class="ix-working" role="status">Finding the companies, people and dates in your question, then retrieving the matching SEC records…<i aria-hidden="true"></i></p>';
    box.setAttribute("aria-busy", "true");
    thread.prepend(box);
    box.scrollIntoView({ behavior: reduce.matches ? "auto" : "smooth", block: "start" });
    const btn = $(".ix-ask__go", form); btn.disabled = true;
    try {
      const a = await api("/v1/me/intelligence/investigate", { method: "POST", body: { question: q, context: followUp && lastPlan ? lastPlan : null } });
      if (a.plan && a.status !== "refused") lastPlan = a.plan;
      box.innerHTML = '<h3 class="ix-answer__q">' + esc(q) + "</h3>" + answerHtml(a, aid);
      box._answer = a;
      box._followUp = followUp;
      hydrate(box);
      store("insidir:onboard:investigate", "1");
    } catch (e) {
      if (e.status === 401 || e.status === 402) return;
      box._followUp = followUp;
      box.innerHTML = '<h3 class="ix-answer__q">' + esc(q) + "</h3>" + errorBlock(e.status === 429 ? "Research limit reached." : "This question could not be researched right now.", e, e.status === 429 ? null : "ask");
    } finally { btn.disabled = false; box.removeAttribute("aria-busy"); }
  }

  async function synth(btn) {
    const box = btn.closest("[data-synth-box]"), article = btn.closest(".ix-answer"), a = article && article._answer;
    if (!a) return;
    btn.disabled = true; btn.textContent = "Writing from the cited records…";
    try {
      const r = await api("/v1/me/intelligence/synthesize", { method: "POST", body: { question: a.question, context: a.plan && a.plan.usedContext ? a.plan : null } });
      if (r.status === "ready") {
        const aid = article.id;
        const html = esc(r.text).split(/\n{2,}/).map(p => "<p>" + p.replace(/\[(\d{1,3})\]/g, (m, n) => '<a class="ix-cite" href="#ix-src-' + aid + "-" + n + '">' + n + "</a>") + "</p>").join("");
        box.innerHTML = '<p class="ix-sub">Plain-English synthesis</p><div class="ix-ai"><span class="ix-k ix-k--ai">AI</span>' + html + "<small>Written by AI (" + esc(r.tier === "deep" ? "research model" : "standard model") + ") from the cited records only; figures and citations were checked before display" + (r.cached ? "; shared with other readers who asked about the same records" : "") + ".</small></div>";
      } else box.innerHTML = '<p class="ix-sub">Plain-English synthesis</p><p class="ix-plain">' + esc(r.reason || "Not available.") + "</p>";
    } catch (e) { box.innerHTML = '<p class="ix-sub">Plain-English synthesis</p><p class="ix-plain">' + esc(e.message) + "</p>"; }
  }

  function wireInvestigate() {
    field.addEventListener("input", autosize);
    field.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
    form.addEventListener("submit", e => { e.preventDefault(); const q = field.value; ask(q, { followUp: !!lastPlan && /^(what about|and|how about|only|just|same|now|also)\b/i.test(q.trim()) }); });
    $$("[data-examples] button").forEach(b => b.addEventListener("click", () => { field.value = b.textContent; autosize(); ask(b.textContent); }));
    thread.addEventListener("click", e => {
      const f = e.target.closest("[data-follow]");
      if (f) { field.value = f.textContent; autosize(); ask(f.textContent, { followUp: true }); return; }
      const s = e.target.closest("[data-synth]");
      if (s) { synth(s); return; }
      const again = e.target.closest('[data-retry="ask"]');
      if (again) { const box = again.closest(".ix-answer"); if (box) { box.remove(); ask(box.dataset.q, { followUp: !!box._followUp }); } }
    });
  }

  /* ======================= MIRROR ======================= */
  const mirror = $("[data-mirror]");
  const mstate = { managers: [], cik: null, detail: null, budget: 500, timer: null, simSeq: 0, pickSeq: 0 };
  const SHADES = ["#e9e4da", "#bdb9b1", "#9e9b94", "#8c8983", "#7b7873", "#696762", "#575550", "#47453f", "#3a3935", "#2f2f2c"];

  function unavailable(m) {
    mirror.className = "ix-mirror ix-mirror--single";
    mirror.innerHTML = '<div class="ix-unavailable"><div><p class="ix-kicker">Not yet available</p><h3>Mirror opens when the first Form 13F reports are imported.</h3><p>' + esc(m.reason || "Form 13F filings have not been imported yet.") + "</p><p>Mirror only ever shows holdings read from managers’ own SEC filings. Until they are imported and checked, there is nothing to show, so nothing is shown.</p>" +
      (m.lastCheckedAt ? '<p class="ix-note">Last checked ' + esc(fmtTime(m.lastCheckedAt)) + ".</p>" : "") + "</div><div><p class=\"ix-sub\">What a 13F is, and is not</p><ol>" + (m.notes || []).map(n => "<li>" + esc(n) + "</li>").join("") + "</ol></div></div>";
  }
  function managerList() {
    return '<ul class="ix-managers" aria-label="Institutional managers">' + mstate.managers.map(m => '<li><button type="button" aria-pressed="' + (m.cik === mstate.cik) + '" data-manager="' + esc(m.cik) + '"><strong>' + esc(m.name || "CIK " + m.cik) + "</strong><span>Quarter ended " + esc(fmtDay(m.latestPeriod)) + " · " + esc(compact(m.reportedValue)) + "</span></button></li>").join("") + "</ul>";
  }
  function profileHtml(d) {
    const c = d.current;
    const complete = c.completeness === "complete";
    return '<div class="ix-profile"><p class="ix-kicker">Form 13F-HR · CIK ' + esc(d.manager.cik) + '</p><h3 class="ix-profile__name">' + esc(d.manager.name) + "</h3>" +
      '<p class="ix-profile__meta"><span>Holdings as of ' + esc(fmtDay(c.periodOfReport)) + "</span><span>Filed with the SEC " + esc(fmtDay(c.filedAt)) + "</span>" + (secUrl(c.sourceUrl) ? '<a href="' + esc(secUrl(c.sourceUrl)) + '" target="_blank" rel="noopener noreferrer">Filing ↗</a>' : "") + (secUrl(c.infoTableUrl) ? '<a href="' + esc(secUrl(c.infoTableUrl)) + '" target="_blank" rel="noopener noreferrer">Information table ↗</a>' : "") + "</p>" +
      '<p style="margin:0 0 20px"><span class="ix-badge' + (complete ? "" : " ix-badge--warn") + '">' + (complete ? "Totals match the filing’s cover page" : c.completeness === "totals_missing" ? "No cover-page totals to check against" : "Totals do not match the cover page") + "</span></p>" +
      '<dl class="ix-stats"><div><dt>Reported value</dt><dd>' + esc(compact(d.reportedValue)) + "<small>" + esc(money(d.reportedValue)) + "</small></dd></div><div><dt>Positions</dt><dd>" + d.positionsTotal + "<small>" + c.entries + " table rows</small></dd></div><div><dt>Quarter</dt><dd>" + esc(String(c.periodOfReport || "").slice(0, 7) || "—") + "<small>Quarter end</small></dd></div><div><dt>Disclosed</dt><dd>" + esc(fmtDay(c.filedAt).replace(/, \d{4}$/, "")) + "<small>" + esc(String(c.filedAt || "").slice(0, 4)) + "</small></dd></div></dl>" +
      '<section class="ix-sim" aria-labelledby="ix-sim-title"><h4 class="ix-card__title" id="ix-sim-title">Illustrative allocation <span class="ix-k ix-k--sim">Hypothetical</span></h4>' +
      '<div class="ix-sim__row"><div class="ix-budget"><label for="ix-budget">Hypothetical budget</label><div class="ix-budget__field"><span aria-hidden="true">$</span><input id="ix-budget" inputmode="decimal" autocomplete="off" value="' + esc(String(mstate.budget)) + '" aria-describedby="ix-budget-note"></div></div>' +
      '<div class="ix-chips" role="group" aria-label="Quick budgets">' + [100, 500, 1000, 10000].map(v => '<button type="button" data-budget="' + v + '" aria-pressed="' + (mstate.budget === v) + '">' + money(v) + "</button>").join("") + "</div></div>" +
      '<p class="ix-note" id="ix-budget-note" style="margin:0 0 18px">Each eligible holding gets the share of the budget that its reported value is of the eligible total, rounded to cents. Nothing is purchased or sent anywhere.</p>' +
      '<div data-sim aria-live="polite"><div class="ix-skel" aria-hidden="true"><i></i><i></i></div></div></section>' +
      '<section class="ix-block"><h4 class="ix-block__title">Reported holdings</h4><div class="ix-tablewrap"><table class="ix-table ix-table--stack"><thead><tr><th>Holding</th><th>Class</th><th class="num">Shares</th><th class="num">Reported value</th><th class="num">Weight</th></tr></thead><tbody>' +
        d.positions.slice(0, 40).map(p => "<tr><td class=\"ix-wide\"><strong>" + esc(p.issuer) + "</strong><small>CUSIP " + esc(p.cusip) + (p.putCall ? " · " + esc(p.putCall) + " option" : "") + (p.shareType === "PRN" ? " · principal amount" : "") + '</small></td><td data-label="Class">' + esc(p.titleOfClass || "—") + '</td><td class="num" data-label="Shares">' + esc(num(p.shares)) + '</td><td class="num" data-label="Value">' + esc(money(p.value)) + '</td><td class="num" data-label="Weight">' + esc(pct(p.weightOfReported, 2)) + '<span class="ix-meter"><i style="width:' + Math.min(100, (p.weightOfReported || 0) * 100 / Math.max(.0001, d.positions[0].weightOfReported || 1)).toFixed(1) + '%"></i></span></td></tr>').join("") +
      "</tbody></table></div>" + (d.positionsTotal > 40 ? '<p class="ix-note">Showing the 40 largest of ' + d.positionsTotal + " positions. The simulation uses all of them.</p>" : "") + "</section>" +
      '<section class="ix-block"><h4 class="ix-block__title">Disclosure history</h4><ol class="ix-timeline">' + d.history.map((h, i) => '<li class="' + (i === 0 ? "is-current" : "") + '"><strong>Quarter ended ' + esc(fmtDay(h.periodOfReport)) + "</strong>Filed " + esc(fmtDay(h.filedAt)) + " · " + h.entries + " rows · " + esc(compact(h.reportedValue)) + (h.formType === "13F-HR/A" ? " · amendment" : "") + (h.completeness !== "complete" ? " · totals unverified" : "") + (secUrl(h.sourceUrl) ? ' · <a href="' + esc(secUrl(h.sourceUrl)) + '" target="_blank" rel="noopener noreferrer">source ↗</a>' : "") + "</li>").join("") + "</ol></section>" +
      changesHtml(d) +
      '<section class="ix-block"><h4 class="ix-block__title">Coverage</h4><ul class="ix-gaps">' + d.notes.map(n => "<li>" + esc(n) + "</li>").join("") + "</ul></section></div>";
  }
  function changesHtml(d) {
    const ch = d.changes;
    if (!ch) return '<section class="ix-block"><h4 class="ix-block__title">Changes from the previous quarter</h4><p class="ix-plain">Only one quarterly report has been imported for this manager, so there is nothing to compare yet.</p></section>';
    const list = (items, fmt) => items.length ? "<ul>" + items.slice(0, 8).map(fmt).join("") + "</ul>" + (items.length > 8 ? '<p class="ix-note">and ' + (items.length - 8) + " more</p>" : "") : '<p class="ix-plain">None</p>';
    return '<section class="ix-block"><h4 class="ix-block__title">Changes from the quarter ended ' + esc(fmtDay(ch.comparedTo.periodOfReport)) + "</h4>" +
      (ch.comparable ? "" : '<p class="ix-plain" style="margin-bottom:14px">One of the two reports did not match its own cover-page totals, so some differences below may reflect missing rows rather than changes.</p>') +
      '<div class="ix-changes"><div><h4>New positions</h4>' + list(ch.new, x => "<li><span>" + esc(x.issuer) + "</span><b>" + esc(num(x.shares)) + " sh</b></li>") + "</div>" +
      "<div><h4>Exited</h4>" + list(ch.exited, x => "<li><span>" + esc(x.issuer) + "</span><b>was " + esc(num(x.previousShares)) + " sh</b></li>") + "</div>" +
      "<div><h4>Share count increased</h4>" + list(ch.increased, x => "<li><span>" + esc(x.issuer) + "</span><b>+" + esc(num(x.change)) + (x.changePct != null ? " (" + pct(x.changePct, 0) + ")" : "") + "</b></li>") + "</div>" +
      "<div><h4>Share count decreased</h4>" + list(ch.decreased, x => "<li><span>" + esc(x.issuer) + "</span><b>" + esc(num(x.change)) + (x.changePct != null ? " (" + pct(x.changePct, 0) + ")" : "") + "</b></li>") + "</div></div>" +
      '<p class="ix-note">Compares share counts reported for the two quarter ends. It does not show when, or at what price, anything changed in between.</p></section>';
  }
  function simHtml(s) {
    const top = s.allocations.slice(0, 9), rest = s.allocations.slice(9);
    const restDollars = rest.reduce((x, a) => x + Math.round(a.dollars * 100), 0) / 100, restWeight = rest.reduce((x, a) => x + a.weight, 0);
    const parts = top.map((a, i) => ({ label: a.issuer, weight: a.weight, dollars: a.dollars, shade: SHADES[i] })).concat(rest.length ? [{ label: rest.length + " other holdings", weight: restWeight, dollars: restDollars, shade: SHADES[9] }] : []);
    return '<dl class="ix-stats" style="margin-bottom:18px"><div><dt>Allocated</dt><dd data-tw="allocated">' + esc(money(s.allocated, true)) + "</dd></div><div><dt>Holdings used</dt><dd>" + s.eligiblePositions + "<small>of " + s.positions + "</small></dd></div><div><dt>Coverage</dt><dd>" + esc(pct(s.coverage)) + "<small>of reported value</small></dd></div><div><dt>Excluded</dt><dd>" + s.excluded.length + "<small>" + (s.excluded.length ? "listed below" : "none") + "</small></dd></div></dl>" +
      '<div class="ix-bar-chart" role="img" aria-label="Allocation by holding: ' + esc(parts.map(p => p.label + " " + pct(p.weight)).join(", ")) + '">' + parts.map(p => '<i style="flex-grow:' + Math.max(.0001, p.weight).toFixed(6) + ";background:" + p.shade + '" title="' + esc(p.label + " · " + pct(p.weight) + " · " + money(p.dollars, true)) + '"></i>').join("") + "</div>" +
      '<ul class="ix-legend">' + parts.map(p => '<li><i style="background:' + p.shade + '"></i><span>' + esc(p.label) + "</span><b>" + esc(money(p.dollars, true)) + "</b></li>").join("") + "</ul>" +
      '<details class="ix-more"><summary>Every illustrative amount (' + s.allocations.length + ")</summary><div class=\"ix-more__body\"><div class=\"ix-tablewrap\"><table class=\"ix-table ix-table--stack\"><thead><tr><th>Holding</th><th class=\"num\">Reported value</th><th class=\"num\">Weight</th><th class=\"num\">Illustrative amount</th></tr></thead><tbody>" +
        s.allocations.map(a => '<tr><td class="ix-wide"><strong>' + esc(a.issuer) + "</strong><small>" + esc(a.titleOfClass || "") + " · " + esc(a.cusip) + '</small></td><td class="num" data-label="Value">' + esc(money(a.reportedValue)) + '</td><td class="num" data-label="Weight">' + esc(pct(a.weight, 3)) + '</td><td class="num" data-label="Amount">' + esc(money(a.dollars, true)) + "</td></tr>").join("") + "</tbody></table></div></div></details>" +
      (s.excluded.length ? '<details class="ix-more"><summary>Excluded from the simulation (' + s.excluded.length + ")</summary><div class=\"ix-more__body\"><ul class=\"ix-gaps\">" + s.excluded.map(x => "<li>" + esc(x.issuer) + " (" + esc(money(x.reportedValue)) + "): " + esc(x.reason) + "</li>").join("") + "</ul></div></details>" : "") +
      (s.belowOneCent ? '<p class="ix-note">' + s.belowOneCent + " holdings are too small a share of this budget to receive a whole cent.</p>" : "") +
      '<p class="ix-disclaimer">' + esc(s.disclaimer) + " " + esc(s.method) + "</p>";
  }
  async function runSim() {
    const box = $("[data-sim]", mirror), input = $("#ix-budget", mirror);
    if (!box || !mstate.cik) return;
    const raw = (input ? input.value : String(mstate.budget)).replace(/[$,\s]/g, "");
    if (!/^\d{1,8}(\.\d{1,2})?$/.test(raw) || Number(raw) < 1 || Number(raw) > 10000000) {
      if (input) input.setAttribute("aria-invalid", "true");
      box.innerHTML = '<p class="ix-plain" role="alert">Enter a budget between $1 and $10,000,000, with at most two decimals.</p>';
      return;
    }
    if (input) input.removeAttribute("aria-invalid");
    mstate.budget = Number(raw);
    $$("[data-budget]", mirror).forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.budget) === mstate.budget)));
    // Only the newest budget's answer is drawn: a slower earlier reply never overwrites a later one.
    const mine = ++mstate.simSeq;
    try {
      const s = await api("/v1/intelligence/mirror/simulate?cik=" + encodeURIComponent(mstate.cik) + "&budget=" + encodeURIComponent(raw));
      if (mine !== mstate.simSeq) return;
      const prev = $("[data-tw=allocated]", box);
      const was = prev ? Number(prev.dataset.value || 0) : 0;
      box.innerHTML = simHtml(s);
      const el = $("[data-tw=allocated]", box);
      if (el) { el.dataset.value = String(was); tween(el, s.allocated, v => money(v, true)); }
    } catch (e) { if (mine === mstate.simSeq && e.status !== 401 && e.status !== 402) box.innerHTML = errorBlock("The simulation could not be run.", e); }
  }
  async function selectManager(cik) {
    mstate.cik = cik;
    $$("[data-manager]", mirror).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.manager === cik)));
    const pane = $("[data-profile]", mirror);
    pane.innerHTML = '<div class="ix-skel ix-skel--tall" aria-hidden="true"><i></i><i></i><i></i><i></i></div>';
    const mine = ++mstate.pickSeq;
    try {
      const detail = await api("/v1/intelligence/mirror/managers/" + encodeURIComponent(cik));
      if (mine !== mstate.pickSeq) return;
      mstate.detail = detail;
      pane.innerHTML = profileHtml(mstate.detail);
      pane.style.animation = "none"; void pane.offsetWidth; pane.style.animation = "";
      runSim();
    } catch (e) { if (mine === mstate.pickSeq && e.status !== 401 && e.status !== 402) pane.innerHTML = errorBlock("This manager’s filings could not be loaded.", e, "mirror"); }
  }
  async function loadMirror() {
    try {
      const m = await api("/v1/intelligence/mirror/managers");
      mirror.setAttribute("aria-busy", "false");
      const heroMeta = $("[data-hero-mirror]");
      if (!m.available || !Array.isArray(m.managers) || !m.managers.length) { if (heroMeta) heroMeta.textContent = "Awaiting first 13F import"; unavailable(m); return; }
      mstate.managers = m.managers;
      if (heroMeta) heroMeta.textContent = m.managers.length + (m.managers.length === 1 ? " manager" : " managers") + " · Form 13F";
      mirror.className = "ix-mirror";
      mirror.innerHTML = "<div>" + managerList() + '</div><div data-profile class="ix-in"></div>';
      selectManager(m.managers[0].cik);
    } catch (e) {
      mirror.setAttribute("aria-busy", "false");
      if (e.status !== 401 && e.status !== 402) { mirror.className = "ix-mirror ix-mirror--single"; mirror.innerHTML = errorBlock("Mirror could not be loaded.", e, "mirror"); }
    }
  }
  function wireMirror() {
    mirror.addEventListener("click", e => {
      const m = e.target.closest("[data-manager]");
      if (m && m.dataset.manager !== mstate.cik) { selectManager(m.dataset.manager); return; }
      const b = e.target.closest("[data-budget]");
      if (b) { const input = $("#ix-budget", mirror); if (input) input.value = b.dataset.budget; runSim(); return; }
      if (e.target.closest('[data-retry="mirror"]')) loadMirror();
    });
    mirror.addEventListener("input", e => { if (e.target.id === "ix-budget") { clearTimeout(mstate.timer); mstate.timer = setTimeout(runSim, 350); } });
    mirror.addEventListener("keydown", e => { if (e.target.id === "ix-budget" && e.key === "Enter") { clearTimeout(mstate.timer); runSim(); } });
  }

  function start() {
    wireTabs(); wireBriefing(); wireInvestigate(); wireMirror(); wireRadios();
    // AI status and the briefing load side by side; explain buttons appear once AI is known to be on.
    aiStatus().then(() => { if (aiConfigured && brief.data && !brief.data.needsSetup) renderBriefing(); });
    autosize();
    const q = new URLSearchParams(location.search).get("q"), hash = location.hash.slice(1);
    const ask0 = q && q.length <= 400;
    select(ask0 ? "investigate" : TABS.includes(hash) ? hash : "briefing");
    if (ask0) { field.value = q; autosize(); ask(q); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
