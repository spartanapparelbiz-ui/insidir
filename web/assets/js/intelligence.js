/* Insidir Intelligence (intelligence.html): the instrument, the tape, the briefing, capital structure,
   Investigate and Mirror. Every value comes from the /v1 API and is shown as received; server text is escaped
   before it enters the page; only https links to sec.gov (or Insidir's own pages) become links. Motion is opacity,
   blur and stroke drawing only, each tied to something real (data arriving, a stage the server completed, a
   selection), and all of it stops under prefers-reduced-motion. 401/402 are handled by app.js. */
(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
  const wide = window.matchMedia("(min-width: 1080px)");
  const M = () => window.InsidirMark, V = () => window.InsidirViz;
  const secUrl = u => { try { const x = new URL(u); return x.protocol === "https:" && (x.hostname === "www.sec.gov" || x.hostname === "data.sec.gov") ? x.href : null; } catch { return null; } };
  const localHref = h => typeof h === "string" && /^(#[a-z-]+|[a-z-]+\.html(\?[A-Za-z0-9=&%._-]*)?)$/.test(h) ? h : null;
  const tickerOk = t => typeof t === "string" && /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(t);
  const cikOk = c => typeof c === "string" && /^\d{1,10}$/.test(c);

  async function api(path, { method = "GET", body } = {}) {
    let res;
    try { res = await fetch(path, { method, credentials: "same-origin", headers: body ? { "Content-Type": "application/json", Accept: "application/json" } : { Accept: "application/json" }, body: body ? JSON.stringify(body) : undefined }); }
    catch { throw Object.assign(new Error("Insidir could not be reached. Check your connection and try again."), { status: 0 }); }
    let data = null;
    try { data = await res.json(); } catch { /* not JSON */ }
    if (!res.ok) throw Object.assign(new Error((data && data.error) || "Request failed (" + res.status + ")"), { status: res.status, data });
    return data;
  }

  /* ---------- formatting (display only; never computes a figure) ---------- */
  const DAY = { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" };
  const fmtDay = v => { if (!v) return "Not stated"; const d = new Date(String(v).length === 10 ? v + "T12:00:00Z" : v); return Number.isFinite(d.getTime()) ? d.toLocaleDateString("en-US", DAY) : "Not stated"; };
  const fmtShort = v => { const d = new Date(String(v).length === 10 ? v + "T12:00:00Z" : v); return Number.isFinite(d.getTime()) ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "—"; };
  const fmtTime = v => { if (!v) return "Not stated"; const d = new Date(v); return Number.isFinite(d.getTime()) ? d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Not stated"; };
  const fmtClock = v => { const d = new Date(v); return Number.isFinite(d.getTime()) ? d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : ""; };
  const fmtRange = r => !r ? "Not stated" : r.from === r.to ? fmtDay(r.from) : fmtDay(r.from) + " – " + fmtDay(r.to);
  const money = (n, cents = false) => n == null || !Number.isFinite(Number(n)) ? "—" : "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
  const compact = n => { const v = Number(n); if (n == null || !Number.isFinite(v)) return "—"; const a = Math.abs(v); return a >= 1e9 ? "$" + (v / 1e9).toFixed(a >= 1e11 ? 0 : 1) + "B" : a >= 1e6 ? "$" + (v / 1e6).toFixed(a >= 1e8 ? 0 : 1) + "M" : a >= 1e3 ? "$" + (v / 1e3).toFixed(0) + "K" : "$" + v.toFixed(0); };
  const num = n => n == null ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: 4 });
  const price = n => n == null ? "—" : "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const pct = (x, d = 1) => x == null ? "—" : (x * 100).toFixed(d) + "%";
  const ago = v => { const t = Date.parse(v); if (!Number.isFinite(t)) return ""; const m = Math.round((Date.now() - t) / 60000); return m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " d ago"; };
  const daysBetween = (a, b) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 86400000);
  const media = () => window.InsidirMedia;
  /* Identity tiles from entity-media.js (window.InsidirMedia): a company's real logo, a reporting person's real headshot
     (by owner CIK, with the issuer's logo standing in), resolved in one /v1/media batch per render. Sizes are the
     helper's named sizes (xs 20px, sm 28px, md 41px, lg 63px). A tile beside the name it pictures is aria-hidden. */
  const bare = c => String(c || "").replace(/^0+/, "");
  const logo = (ticker, cik, name, size = "sm") => { try { const m = media(), T = tickerOk(ticker) ? ticker : "", C = cikOk(bare(cik)) ? bare(cik) : undefined; return m && (T || C) ? m.logo(T, size, { cik: C, name }) : ""; } catch { return ""; } };
  const face = (name, cik, ticker, issuerCik, size = "xs") => { try { const m = media(), C = bare(cik); return m && cikOk(C) ? m.portrait(name || "", tickerOk(ticker) ? ticker : "", size, { cik: C, issuerCik: cikOk(bare(issuerCik)) ? bare(issuerCik) : undefined }) : ""; } catch { return ""; } };
  const ent = (tile, inner) => tile ? '<span class="ix-ent">' + tile + "<span>" + inner + "</span></span>" : inner;
  const hydrate = root => { try { media() && media().hydrate(root); } catch { /* decoration */ } };
  const companyLink = (t, label) => tickerOk(t) ? '<a class="ix-ticker" href="company.html?ticker=' + encodeURIComponent(t) + '">' + esc(label || t) + "</a>" : '<span class="ix-ticker">' + esc(label || "—") + "</span>";
  const personLink = (cik, name) => cikOk(String(cik || "")) ? '<a href="person.html?cik=' + encodeURIComponent(cik) + '">' + esc(name) + "</a>" : esc(name);
  const ext = (url, label) => { const u = secUrl(url); return u ? '<a class="ix-src" href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(label) + " ↗</a>" : ""; };
  const mark = (size, opts = {}) => M() ? M().svg({ size, ...opts }) : "";
  const loader = (label = "Loading") => '<div class="ix-loading">' + (M() ? M().loader(30, label) : "") + "<span>" + esc(label) + "…</span></div>";
  const errorBlock = (title, e, retry) => '<div class="ix-error" role="alert"><strong>' + esc(title) + "</strong>" + esc(e && e.message || "Something went wrong.") + (retry ? ' <button type="button" class="ix-btn" data-retry="' + esc(retry) + '">Try again</button>' : "") + "</div>";
  const empty = (title, text, actions = "") => '<div class="ix-empty"><div class="ix-empty__mark" aria-hidden="true">' + mark(72) + '</div><div><h3>' + esc(title) + "</h3><p>" + text + "</p>" + (actions ? '<div class="ix-empty__actions">' + actions + "</div>" : "") + "</div></div>";
  function tween(el, to, format) {
    const from = Number(el.dataset.value || 0);
    el.dataset.value = String(to);
    if (reduce.matches || !Number.isFinite(from) || from === to) { el.textContent = format(to); return; }
    const start = performance.now(), dur = 520;
    const step = now => { const k = Math.min(1, (now - start) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = format(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); else el.textContent = format(to); };
    requestAnimationFrame(step);
  }

  /* ======================= THE INSTRUMENT ======================= */
  /* Rows follow the height at which each dot's line leaves the mark, so no two lines cross. Dots hemmed in by a
     neighbour on their own row leave vertically first (EXIT), into the clear space above the crossbar or below the base. */
  const MARKET = ["insiders", "filings", "companies", "purchases", "sales", "changes"];
  const MEMBER = ["findings", "holdings", "people", "watchlist"];
  const EXIT = { insiders: ["up", .6], filings: ["up", .28], people: ["down", .28], watchlist: ["down", .6] };
  const POS = { companies: "Crossbar · left", filings: "Crossbar · centre", insiders: "Crossbar · right", purchases: "Stem · upper", sales: "Stem · middle", changes: "Stem · lower",
    watchlist: "Base · left", people: "Base · centre", holdings: "Base · right", findings: "Tittle" };
  const inst = { data: null, cats: {}, selected: "findings", hover: null, brief: null };
  const instEl = $("[data-instrument]");

  const categoryCount = c => !c || c.count == null ? "—" : Number(c.count).toLocaleString("en-US");
  function rowHtml(id) {
    const c = inst.cats[id] || {};
    const sub = c.value ? compact(c.value) + " reported value" : c.detail || c.unit || "";
    return '<li><button type="button" class="ix-row' + (c.count === 0 ? " is-empty" : "") + '" data-cat="' + id + '" aria-pressed="' + (inst.selected === id) + '">' +
      '<span class="ix-row__pos">' + esc(POS[id]) + '</span><span class="ix-row__label">' + esc(c.label || id) + '</span><span class="ix-row__count" data-count="' + id + '">' + categoryCount(c) + '</span><span class="ix-row__unit">' + esc(sub) + "</span></button></li>";
  }
  function findingsCategory() {
    const b = inst.brief;
    if (!b) return { id: "findings", label: "Research findings", count: null, unit: "stories in your briefing", records: [], explore: { label: "Read the briefing", href: "#briefing" }, loading: true };
    const fresh = (b.stories || []).filter(s => s.isNew).length;
    return { id: "findings", label: "Research findings", count: (b.stories || []).length, unit: "stories in your briefing", detail: fresh + " new since your last visit",
      records: (b.stories || []).slice(0, 6).map(s => ({ title: s.headline, meta: (s.ticker || s.company) + " · " + ago(s.disclosedAt) + (s.isNew ? " · new" : ""), href: "#briefing", story: s.id, ticker: s.ticker, issuerCik: s.issuerCik })),
      explore: { label: "Read the briefing", href: "#briefing" }, needsSetup: !!b.needsSetup };
  }
  function panelHtml(id) {
    const c = inst.cats[id];
    if (!c) return loader("Reading records");
    const recs = (c.records || []).map(r => {
      const href = r.external ? secUrl(r.href) : localHref(r.href);
      const tile = r.personCik ? face(r.person || r.title, r.personCik, r.ticker, r.issuerCik) : r.ticker ? logo(r.ticker, r.issuerCik, r.title, "xs") : "";
      const inner = '<span class="ix-rec__media">' + tile + '</span><span class="ix-rec__title">' + esc(r.title) + '</span><span class="ix-rec__meta">' + esc(r.meta || "") + (r.value ? " · " + esc(money(r.value)) : "") + "</span>";
      return "<li>" + (href ? '<a href="' + esc(href) + '"' + (r.external ? ' target="_blank" rel="noopener noreferrer"' : "") + (r.story ? ' data-story-jump="' + esc(r.story) + '"' : "") + ">" + inner + (r.external ? '<span class="ix-rec__go">SEC ↗</span>' : '<span class="ix-rec__go">Open →</span>') + "</a>" : '<span class="ix-rec__plain">' + inner + "</span>") + "</li>";
    }).join("");
    const none = c.loading ? loader("Reading your briefing") : id === "findings" && c.needsSetup ? '<p class="ix-plain">Follow a company or a person and your findings appear here.</p>' : '<p class="ix-plain">No records in this layer for the last 30 days.</p>';
    const ex = localHref(c.explore && c.explore.href);
    return '<header class="ix-panel__head"><span class="ix-panel__mark">' + mark(46, { lit: [id] }) + '</span><div><p class="ix-sub">' + esc(POS[id]) + "</p><h3>" + esc(c.label) + '</h3><p class="ix-panel__count"><strong>' + categoryCount(c) + "</strong> " + esc(c.unit || "") + (c.detail ? " · " + esc(c.detail) : "") + "</p></div></header>" +
      (recs ? '<ul class="ix-panel__list">' + recs + "</ul>" : none) +
      (ex ? '<a class="ix-btn ix-panel__more" href="' + esc(ex) + '">' + esc(c.explore.label) + " →</a>" : "");
  }
  function drawLinks() {
    const overlay = $("[data-links]", instEl);
    if (!overlay || !V()) return;
    if (!wide.matches) { overlay.innerHTML = ""; return; }
    const links = [], host = instEl.getBoundingClientRect(), svg = $("[data-mark] svg", instEl);
    const markL = $("[data-rows=market]", instEl), memL = $("[data-rows=member]", instEl);
    if (!svg || !markL || !memL) return;
    const m = svg.getBoundingClientRect(), colR = markL.getBoundingClientRect().right, colL = memL.getBoundingClientRect().left;
    const add = (ids, side) => ids.forEach((id, i) => {
      const dot = $('[data-mark] [data-dot="' + id + '"] .im-core', instEl), row = $('[data-cat="' + id + '"]', instEl);
      if (!dot || !row) return;
      const k = (ids.length - 1 - i) / Math.max(1, ids.length - 1), h = dot.getBoundingClientRect().height, ex = EXIT[id];
      const gx = side === "left" ? colR + (m.left - colR) * (0.18 + 0.6 * k) - host.left : m.right + (colL - m.right) * (0.22 + 0.6 * (1 - k)) - host.left;
      links.push({ from: dot, to: row, side, key: id, gx, exit: ex && ex[0], lane: ex ? ex[1] * h : 0, active: id === inst.selected || id === inst.hover });
    });
    add(MARKET, "left"); add(MEMBER, "right");
    V().connect(overlay, instEl, links);
  }
  function setState() {
    const sel = inst.selected, hov = inst.hover;
    instEl.classList.toggle("has-selection", !!sel);
    $$("[data-mark] [data-dot]", instEl).forEach(g => { const id = g.dataset.dot; g.classList.toggle("is-selected", id === sel); g.classList.toggle("is-hover", id === hov); g.classList.toggle("is-empty", (inst.cats[id] || {}).count === 0); if (g.hasAttribute("role")) g.setAttribute("aria-pressed", String(id === sel)); });
    $$("[data-cat]", instEl).forEach(b => { b.setAttribute("aria-pressed", String(b.dataset.cat === sel)); b.classList.toggle("is-hover", b.dataset.cat === hov); });
    $$("[data-links] [data-link]", instEl).forEach(p => p.classList.toggle("is-active", p.dataset.link === sel || p.dataset.link === hov));
  }
  function select(id, { focusPanel = false } = {}) {
    if (!inst.cats[id]) return;
    inst.selected = id;
    const panel = $("[data-panel]", instEl);
    panel.innerHTML = panelHtml(id);
    hydrate(panel);
    panel.classList.remove("ix-in"); void panel.offsetWidth; panel.classList.add("ix-in");
    $("[data-caption]", instEl).textContent = (inst.cats[id].label || id) + " · " + categoryCount(inst.cats[id]) + " " + (inst.cats[id].unit || "");
    setState();
    if (focusPanel && !wide.matches) panel.scrollIntoView({ behavior: reduce.matches ? "auto" : "smooth", block: "nearest" });
  }
  /* Real events light the dots they concern: data arriving, a research stage completing. */
  function pulse(ids) {
    for (const id of ids) {
      const g = $('[data-mark] [data-dot="' + id + '"]', instEl);
      if (!g) continue;
      g.classList.remove("is-pulse"); void g.getBoundingClientRect(); g.classList.add("is-pulse");
      setTimeout(() => g.classList.remove("is-pulse"), 1400);
    }
  }
  function renderInstrument() {
    const d = inst.data, labels = {};
    for (const id of [...MARKET, ...MEMBER]) { const c = inst.cats[id] || {}; labels[id] = (c.label || id) + ": " + categoryCount(c) + " " + (c.unit || ""); }
    $("[data-mark]", instEl).innerHTML = mark(640, { interactive: true, labels });
    $("[data-rows=market]", instEl).innerHTML = MARKET.map(rowHtml).join("");
    $("[data-rows=member]", instEl).innerHTML = MEMBER.map(rowHtml).join("");
    if (d) { $("[data-meta-latest]").textContent = d.latestFilingAt ? fmtTime(d.latestFilingAt) : "None stored"; $("[data-meta-computed]").textContent = fmtTime(d.computedAt); }
    instEl.setAttribute("aria-busy", "false");
    select(inst.selected);
    requestAnimationFrame(drawLinks);
  }
  async function loadInstrument() {
    try {
      inst.data = await api("/v1/me/intelligence/instrument");
      for (const c of inst.data.mark) inst.cats[c.id] = c;
      inst.cats.findings = findingsCategory();
      renderInstrument();
      wireStructureChips();
    } catch (e) {
      instEl.setAttribute("aria-busy", "false");
      if (e.status === 401 || e.status === 402) return;
      $("[data-panel]", instEl).innerHTML = errorBlock("The instrument could not be loaded.", e, "instrument");
    }
  }
  function wireInstrument() {
    // The mark itself, dim until its records arrive.
    $("[data-mark]", instEl).innerHTML = mark(640, { lit: [] });
    $("[data-panel]", instEl).innerHTML = loader("Reading stored records");
    instEl.addEventListener("click", e => {
      const j = e.target.closest("[data-story-jump]");
      if (j) { e.preventDefault(); jumpToStory(j.dataset.storyJump); return; }
      const t = e.target.closest("[data-dot], [data-cat]");
      if (t) { select(t.dataset.dot || t.dataset.cat, { focusPanel: !!t.dataset.dot }); return; }
      if (e.target.closest('[data-retry="instrument"]')) loadInstrument();
    });
    instEl.addEventListener("keydown", e => {
      const g = e.target.closest("[data-dot]");
      if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); select(g.dataset.dot, { focusPanel: true }); }
    });
    const hover = id => { if (inst.hover === id) return; inst.hover = id; setState(); };
    instEl.addEventListener("pointerover", e => { const t = e.target.closest("[data-dot], [data-cat]"); hover(t ? t.dataset.dot || t.dataset.cat : null); });
    instEl.addEventListener("pointerleave", () => hover(null));
    instEl.addEventListener("focusin", e => { const t = e.target.closest("[data-dot], [data-cat]"); if (t) hover(t.dataset.dot || t.dataset.cat); });
    if ("ResizeObserver" in window) new ResizeObserver(() => requestAnimationFrame(drawLinks)).observe(instEl);
    wide.addEventListener("change", drawLinks);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawLinks);
  }
  /* The introduction: the mark resolves, its lines draw, the heading arrives. Short; any input skips it. */
  function intro() {
    const root = document.documentElement;
    if (!root.classList.contains("ix-intro")) return;
    const end = () => { root.classList.remove("ix-intro"); try { sessionStorage.setItem("ix-intro", "1"); } catch { /* private mode */ } };
    ["pointerdown", "keydown", "wheel", "touchstart"].forEach(t => window.addEventListener(t, end, { once: true, passive: true }));
    $("[data-skip-intro]").addEventListener("click", end);
    setTimeout(end, 2200);
  }

  /* ---------- section bar and marks ---------- */
  function sectionSpy() {
    const links = $$(".ix-bar a[data-spy]");
    if (!("IntersectionObserver" in window)) return;
    const seen = new Map();
    const io = new IntersectionObserver(entries => {
      for (const e of entries) seen.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0);
      let best = null, ratio = 0;
      for (const [id, r] of seen) if (r > ratio) { best = id; ratio = r; }
      links.forEach(a => a.setAttribute("aria-current", String(a.dataset.spy === best)));
    }, { rootMargin: "-120px 0px -45% 0px", threshold: [0, .1, .3, .6] });
    links.forEach(a => { const el = document.getElementById(a.dataset.spy); if (el) io.observe(el); });
  }
  let aiConfigured = false;
  async function aiStatus() {
    try {
      const s = await api("/v1/ai/status");
      aiConfigured = !!s.configured;
      const el = $("[data-ai-status]");
      if (el) el.textContent = aiConfigured ? "Plain-English summaries on · cited, checked" : "Facts from SEC records · AI summaries off";
    } catch { aiConfigured = false; }
  }

  /* ======================= THE TAPE ======================= */
  const tape = { filters: { days: 7, form: "all", ticker: "", person: "" }, events: [], selected: null, nextBefore: null, timer: null, seq: 0, since: null };
  const tapeEl = $("[data-tape]");
  function tapeQuery(before) {
    const f = tape.filters, q = new URLSearchParams({ days: String(f.days), form: f.form });
    if (f.ticker) q.set("ticker", f.ticker);
    if (f.person) q.set("person", f.person);
    if (before) q.set("before", before);
    return "/v1/intelligence/tape?" + q;
  }
  function tapeRow(e) {
    const sel = tape.selected === e.id;
    return '<li class="ix-tape__item' + (sel ? " is-selected" : "") + (e.new ? " is-new" : "") + '" data-event="' + esc(e.id) + '">' +
      '<button type="button" class="ix-tape__row" aria-expanded="' + sel + '">' +
        '<span class="ix-tape__time"><b>' + esc(fmtShort(e.filedAt)) + "</b>" + esc(fmtClock(e.filedAt)) + "</span>" +
        '<span class="ix-tape__form">' + esc(e.form) + "</span>" +
        '<span class="ix-tape__co">' + ent(logo(e.ticker, e.issuerCik, e.company, "xs"), "<b>" + esc(e.ticker || "—") + "</b>" + esc(e.company || "")) + "</span>" +
        '<span class="ix-tape__who">' + ent(e.person ? face(String(e.person).split("; ")[0], e.personCik, e.ticker, e.issuerCik) : "", esc(e.person || "—")) + "</span>" +
        '<span class="ix-tape__class">' + esc(e.classification) + "</span>" +
        '<span class="ix-tape__amt">' + (e.amount != null ? esc(compact(e.amount)) : "—") + "</span>" +
        '<span class="ix-tape__state">' + (e.new ? "New" : "Historical") + "</span>" +
      "</button>" +
      (sel ? '<div class="ix-tape__detail ix-in"><dl>' +
        "<div><dt>Event date</dt><dd>" + esc(fmtDay(e.eventDate)) + "</dd></div><div><dt>Filed</dt><dd>" + esc(fmtTime(e.filedAt)) + "</dd></div><div><dt>Retrieved by Insidir</dt><dd>" + esc(fmtTime(e.retrievedAt)) + "</dd></div>" +
        "<div><dt>Amount</dt><dd>" + (e.amount != null ? esc(money(e.amount)) + (e.amountNote ? "<small>" + esc(e.amountNote) + "</small>" : "") : "Not reported") + "</dd></div></dl>" +
        '<p class="ix-tape__links">' + ext(e.source, "Original filing") + (tickerOk(e.ticker) ? ' <a href="company.html?ticker=' + encodeURIComponent(e.ticker) + '">Company report →</a>' : "") + (localHref(e.personHref) ? ' <a href="' + esc(e.personHref) + '">Reporting person →</a>' : "") + (tickerOk(e.ticker) ? ' <button type="button" class="ix-btn ix-btn--quiet" data-structure-open="' + esc(e.ticker) + '">Capital structure</button>' : "") + "</p></div>" : "") +
      "</li>";
  }
  const stripFor = width => V() ? V().strip(tape.events.map(e => ({ id: e.id, t: Date.parse(e.filedAt), strong: e.new })), { from: Date.now() - tape.filters.days * 86400000, to: Date.now(), selected: tape.selected, width, height: 48, ticks: width < 560 ? 3 : 6, label: "When each listed disclosure was filed" }) : "";
  function renderTape() {
    const fresh = tape.events.filter(e => e.new).length;
    tapeEl.innerHTML = '<div class="ix-tape__strip" data-strip>' + stripFor(Math.max(320, Math.round(tapeEl.clientWidth || 900))) + '</div><p class="ix-tape__summary">' + tape.events.length + " disclosures shown" + (fresh ? " · " + fresh + " new since your last visit" : " · none new since your last visit") + (tape.since ? " (" + esc(fmtTime(tape.since)) + ")" : "") + "</p>" +
      (tape.events.length ? '<div class="ix-tape__head" aria-hidden="true"><span>Filed</span><span>Form</span><span>Company</span><span>Reporting person</span><span>Classification</span><span>Amount</span><span>Status</span></div><ol class="ix-tape__list">' + tape.events.map(tapeRow).join("") + "</ol>" +
        (tape.nextBefore ? '<button type="button" class="ix-btn ix-tape__more" data-tape-more>Earlier disclosures</button>' : "") :
        empty("Nothing on the tape for these filters.", "No stored disclosure matches this company, person, filing type and period. Widen the period or clear the filters.", '<button type="button" class="ix-btn" data-tape-reset>Clear filters</button>'));
    hydrate(tapeEl);
    tapeEl.setAttribute("aria-busy", "false");
  }
  async function loadTape({ append = false } = {}) {
    const seq = ++tape.seq;
    tapeEl.setAttribute("aria-busy", "true");
    if (!append) tapeEl.innerHTML = loader("Reading the tape");
    try {
      const d = await api(tapeQuery(append ? tape.nextBefore : null));
      if (seq !== tape.seq) return;
      tape.events = append ? tape.events.concat(d.events) : d.events;
      tape.nextBefore = d.nextBefore; tape.since = d.since;
      if (!append) tape.selected = null;
      renderTape();
    } catch (e) {
      if (seq !== tape.seq) return;
      tapeEl.setAttribute("aria-busy", "false");
      if (e.status !== 401 && e.status !== 402) tapeEl.innerHTML = errorBlock("The tape could not be loaded.", e, "tape");
    }
  }
  function wireTape() {
    const form = $("[data-tape-filters]");
    form.addEventListener("submit", e => e.preventDefault());
    const seg = (sel, key, cast = v => v) => $$(sel + " button", form).forEach(b => b.addEventListener("click", () => {
      $$(sel + " button", form).forEach(x => x.setAttribute("aria-checked", String(x === b)));
      tape.filters[key] = cast(b.dataset.value); loadTape();
    }));
    seg("[data-tape-form]", "form"); seg("[data-tape-days]", "days", Number);
    const typed = () => {
      clearTimeout(tape.timer);
      tape.timer = setTimeout(() => {
        const t = $("#tape-ticker").value.trim().toUpperCase().replace(/^\$/, ""), p = $("#tape-person").value.trim();
        const okT = !t || tickerOk(t), okP = !p || /^[\p{L}\p{N} .,'&-]{1,60}$/u.test(p);
        $("#tape-ticker").toggleAttribute("aria-invalid", !okT); $("#tape-person").toggleAttribute("aria-invalid", !okP);
        if (!okT || !okP) return;
        tape.filters.ticker = t; tape.filters.person = p; loadTape();
      }, 380);
    };
    $("#tape-ticker").addEventListener("input", typed); $("#tape-person").addEventListener("input", typed);
    const clear = () => { tape.filters = { days: 7, form: "all", ticker: "", person: "" }; $("#tape-ticker").value = ""; $("#tape-person").value = "";
      $$("[data-tape-form] button").forEach(b => b.setAttribute("aria-checked", String(b.dataset.value === "all"))); $$("[data-tape-days] button").forEach(b => b.setAttribute("aria-checked", String(b.dataset.value === "7"))); loadTape(); };
    $("[data-tape-clear]").addEventListener("click", clear);
    tapeEl.addEventListener("click", e => {
      if (e.target.closest("[data-tape-reset]")) { clear(); return; }
      if (e.target.closest("[data-tape-more]")) { loadTape({ append: true }); return; }
      if (e.target.closest('[data-retry="tape"]')) { loadTape(); return; }
      const so = e.target.closest("[data-structure-open]");
      if (so) { openStructure(so.dataset.structureOpen, true); return; }
      if (e.target.closest(".ix-tape__detail a")) return;
      const tick = e.target.closest(".iv-tick"), row = e.target.closest(".ix-tape__row");
      const id = tick ? tick.dataset.event : row ? row.closest("[data-event]").dataset.event : null;
      if (!id) return;
      tape.selected = tape.selected === id ? null : id;
      renderTape();
      const li = tapeEl.querySelector('[data-event="' + CSS.escape(id) + '"]');
      if (li && tick) li.scrollIntoView({ behavior: reduce.matches ? "auto" : "smooth", block: "nearest" });
    });
    let w = 0;
    if ("ResizeObserver" in window) new ResizeObserver(() => { const nw = Math.round(tapeEl.clientWidth); if (Math.abs(nw - w) > 24 && tape.events.length) { w = nw; const s = $("[data-strip]", tapeEl); if (s) s.innerHTML = stripFor(nw); } }).observe(tapeEl);
  }

  /* ======================= BRIEFING: MORNING REPORT ======================= */
  const brief = { days: 7, order: "priority", data: null };
  const feed = $("[data-feed]");
  const sources = s => (s.sources || []).map(src => { const u = secUrl(src.url); return u ? '<li><a href="' + esc(u) + '" target="_blank" rel="noopener noreferrer">' + esc(src.label) + " ↗</a><small>Filed " + esc(fmtTime(src.filedAt)) + (src.people && src.people.length ? " · " + esc(src.people.join(", ")) : "") + "</small></li>" : ""; }).join("");
  const peopleList = s => (s.people || []).map(p => { const inner = face(p.name, p.cik, s.ticker, s.issuerCik, "sm") + "<span>" + esc(p.name) + (p.role ? "<small>" + esc(p.role) + "</small>" : "") + "</span>"; return cikOk(p.cik) ? '<li><a href="person.html?cik=' + encodeURIComponent(p.cik) + '">' + inner + "</a></li>" : '<li><span class="ix-person">' + inner + "</span></li>"; }).join("");
  function details(s) {
    const firstAcc = s.kind === "insider_filings" ? (s.sources || []).map(x => x.accession).find(a => /^\d{18}$/.test(String(a || ""))) : null;
    const src = sources(s);
    return '<details class="ix-more"><summary>Sources and context</summary><div class="ix-more__body">' +
      (src ? '<div><p class="ix-sub">Original documents</p><ul class="ix-sources">' + src + "</ul></div>" : '<p class="ix-plain">No SEC document link was recorded for this item.</p>') +
      '<div><p class="ix-sub">Why it ranks here</p><p class="ix-plain">' + esc((s.ranking && s.ranking.reasons || []).join(" · ") || "Newest first") + "</p></div>" +
      (aiConfigured && firstAcc ? '<div data-explain-box><button type="button" class="ix-btn" data-explain="' + esc(firstAcc) + '">Explain this filing in plain English</button></div>' : "") + "</div></details>";
  }
  const dates = s => '<dl class="ix-dates"><div><dt>Event</dt><dd>' + esc(fmtRange(s.eventDate)) + "</dd></div><div><dt>Disclosed</dt><dd>" + esc(fmtTime(s.disclosedAt)) + "</dd></div><div><dt>Retrieved by Insidir</dt><dd>" + esc(fmtTime(s.retrievedAt)) + "</dd></div></dl>";
  const kicker = s => '<p class="ix-story__kicker">' + logo(s.ticker, s.issuerCik, s.company, "xs") + companyLink(s.ticker, s.ticker || s.company) + "<span>" + (s.kind === "company_report" ? "Company report" : "Insider filings") + "</span>" + (s.isNew ? '<span class="ix-new">New</span>' : "") + "<span>" + esc(ago(s.disclosedAt)) + "</span></p>";
  const leadHtml = s => '<article class="ix-lead ix-in" data-story="' + esc(s.id) + '"><p class="ix-sub">Main development</p>' + kicker(s) + '<h3 class="ix-lead__head">' + esc(s.headline) + "</h3>" +
    '<ul class="ix-facts">' + (s.facts || []).map(f => "<li>" + esc(f) + "</li>").join("") + "</ul>" +
    ((s.people || []).length ? '<ul class="ix-people">' + peopleList(s) + "</ul>" : "") + dates(s) +
    '<p class="ix-why"><b>Why it’s here:</b> ' + esc((s.why || []).map(w => w.text).join(" · ")) + "</p>" + details(s) + "</article>";
  const secondaryHtml = s => '<article class="ix-second ix-in" data-story="' + esc(s.id) + '">' + kicker(s) + '<h4 class="ix-second__head">' + esc(s.headline) + "</h4>" +
    '<p class="ix-plain">' + esc((s.facts || [])[0] || "") + "</p>" + dates(s) + details(s) + "</article>";
  function deskHtml(list) {
    const by = new Map();
    for (const s of list) { const k = s.ticker || s.company; if (!by.has(k)) by.set(k, []); by.get(k).push(s); }
    const to = Date.now(), from = to - brief.days * 86400000;
    return [...by.entries()].map(([k, ss]) => '<section class="ix-desk__co"><header>' + logo(ss[0].ticker, ss[0].issuerCik, ss[0].company, "xs") + "<h4>" + companyLink(ss[0].ticker, ss[0].company) + "</h4><span>" + ss.length + " " + (ss.length === 1 ? "item" : "items") + "</span></header>" +
      (V() ? '<div class="ix-desk__strip">' + V().strip(ss.map(s => ({ id: s.id, t: Date.parse(s.disclosedAt), strong: s.isNew })), { from, to, width: 520, height: 40, ticks: 3, label: "When " + k + "'s items were disclosed" }) + "</div>" : "") +
      "<ul>" + ss.map(s => '<li><a href="#" data-story-jump="' + esc(s.id) + '">' + esc(s.headline) + "</a><small>" + esc(fmtTime(s.disclosedAt)) + "</small></li>").join("") + "</ul></section>").join("");
  }
  function peopleDeskHtml(list) {
    const by = new Map();
    for (const s of list) for (const p of s.people || []) { const k = p.cik || p.name; if (!by.has(k)) by.set(k, { ...p, items: 0, tickers: new Set(), ticker: s.ticker, issuerCik: s.issuerCik }); const r = by.get(k); r.items++; if (s.ticker) r.tickers.add(s.ticker); }
    return [...by.values()].sort((a, b) => b.items - a.items).slice(0, 12).map(p => "<li>" + ent(face(p.name, p.cik, p.ticker, p.issuerCik, "sm"), personLink(p.cik, p.name) + "<small>" + esc(p.role || "Role not stated") + " · " + esc([...p.tickers].join(", ")) + "</small>") + "</li>").join("") || '<li class="ix-plain">No people named in this edition.</li>';
  }
  function renderBriefing() {
    const d = brief.data;
    feed.setAttribute("aria-busy", "false");
    const subj = d.subjects || {};
    $("[data-edition-date]").textContent = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    $("[data-edition]").textContent = (brief.days === 1 ? "Last 24 hours" : "Last " + brief.days + " days") + " · " + subj.tickers + " compan" + (subj.tickers === 1 ? "y" : "ies") + " and " + subj.people + " " + (subj.people === 1 ? "person" : "people") + " you follow" + (d.since ? " · new since " + fmtTime(d.since) : "");
    if (d.needsSetup) {
      feed.innerHTML = empty("Your briefing starts with what you follow.", "Add companies to your watchlist or follow the people who file at them. Insidir then reads every new Form 4 and company report for you, groups what belongs together and lists it here with the original SEC documents.",
        '<form class="ix-inline" data-quick-add><label class="sr-only" for="ix-quick">Ticker</label><input id="ix-quick" maxlength="15" placeholder="Ticker, e.g. NVDA" autocomplete="off" autocapitalize="characters" required><button class="ix-btn ix-btn--solid" type="submit">Add to watchlist</button></form><a class="ix-btn" href="explore.html">Browse companies</a><a class="ix-btn" href="people.html">Find people</a><p class="ix-note" data-quick-status role="status"></p>');
      $("[data-quick-add]").addEventListener("submit", quickAdd);
    } else {
      const list = [...(d.stories || [])];
      if (brief.order === "latest") list.sort((a, b) => String(b.disclosedAt).localeCompare(String(a.disclosedAt)));
      if (!list.length) feed.innerHTML = empty("Nothing new in the last " + (brief.days === 1 ? "24 hours" : brief.days + " days") + ".", "None of the companies or people you follow filed a Form 4 or company report that Insidir has indexed in this window. Disclosures can arrive days after an event, so this can change.",
        (brief.days < 30 ? '<button type="button" class="ix-btn" data-widen>Show the last 30 days</button>' : "") + '<a class="ix-btn" href="#investigate">Investigate instead</a>');
      else {
        const lead = list[0], second = list.slice(1, 5), rest = list.slice(5);
        feed.innerHTML = '<div class="ix-front"><div class="ix-front__lead">' + leadHtml(lead) + '</div><div class="ix-front__col">' + (second.length ? second.map(secondaryHtml).join("") : '<p class="ix-plain">No other stories in this edition.</p>') + "</div></div>" +
          '<div class="ix-desk"><section><h3 class="ix-sub">Company desk</h3><div class="ix-desk__grid">' + deskHtml(list) + "</div></section>" +
          '<section><h3 class="ix-sub">People in this edition</h3><ul class="ix-desk__people">' + peopleDeskHtml(list) + "</ul></section></div>" +
          (rest.length ? '<section class="ix-also"><h3 class="ix-sub">Also in this edition</h3>' + rest.map(secondaryHtml).join("") + "</section>" : "");
        hydrate(feed);
      }
      const widen = $("[data-widen]", feed);
      if (widen) widen.addEventListener("click", () => setWindow(30));
    }
    $("[data-rules]").innerHTML = (d.rankingRules || []).map(r => "<li><span>" + esc(r.label) + "</span><b>" + (r.points > 0 ? "+" : "") + r.points + "</b></li>").join("");
    const cov = d.coverage || {};
    $("[data-coverage]").innerHTML = (cov.notes || []).map(n => '<p class="ix-note">' + esc(n) + "</p>").join("") +
      (cov.quietCount ? '<p class="ix-note">Quiet in this window (' + cov.quietCount + '):</p><ul class="ix-quiet">' + (cov.quiet || []).map(t => "<li>" + esc(t) + "</li>").join("") + "</ul>" : "");
    renderDelivery(d.preferences && d.preferences.frequency, d.delivery || {});
  }
  function renderDelivery(freq, del) {
    $$("[data-frequency] button").forEach(b => b.setAttribute("aria-checked", String(b.dataset.frequencyValue === freq)));
    const el = $("[data-delivery]");
    const label = freq === "daily" ? "a daily digest" : freq === "weekly" ? "a weekly digest" : "an alert for each new filing";
    let text;
    if (!del.pushConfigured) text = "Device notifications are not available on this deployment. Your briefing still updates here.";
    else if (!del.devices) text = "Your choice is saved, but no device has notifications turned on, so nothing will be sent. <a href=\"alerts.html\">Turn them on in Alerts</a>.";
    else text = "You will receive " + esc(label) + " on " + del.devices + " device" + (del.devices === 1 ? "" : "s") + ". Last 7 days: " + del.sent7d + " delivered" + (del.failed7d ? ", " + del.failed7d + " failed" : "") + (del.pending ? ", " + del.pending + " waiting" : "") + "." + (del.lastSentAt ? " Last delivered " + esc(fmtTime(del.lastSentAt)) + "." : "");
    el.innerHTML = text;
  }
  // A new member's first steps on the overview (onboarding.js) tick off reading the briefing and asking a question.
  const onboarded = step => { try { localStorage.setItem("insidir:onboard:" + step, "1"); } catch { /* private mode */ } };
  async function loadBriefing() {
    feed.setAttribute("aria-busy", "true");
    if (!brief.data) feed.innerHTML = loader("Preparing your edition");
    try {
      brief.data = await api("/v1/me/intelligence/briefing?days=" + brief.days);
      renderBriefing();
      onboarded("briefing");
      inst.brief = brief.data; inst.cats.findings = findingsCategory();
      if (inst.data) { $("[data-rows=member]", instEl).innerHTML = MEMBER.map(rowHtml).join(""); if (inst.selected === "findings") select("findings"); else setState(); drawLinks(); }
      pulse(["findings"]);
    } catch (e) {
      feed.setAttribute("aria-busy", "false");
      if (e.status === 401 || e.status === 402) return;
      feed.innerHTML = errorBlock("The briefing could not be loaded.", e, "briefing");
      $("[data-delivery]").textContent = "Delivery settings are unavailable until the briefing loads.";
    }
  }
  function setWindow(days) { brief.days = days; $$("[data-window] button").forEach(b => b.setAttribute("aria-checked", String(Number(b.dataset.days) === days))); loadBriefing(); }
  async function quickAdd(ev) {
    ev.preventDefault();
    const input = $("#ix-quick"), status = $("[data-quick-status]");
    const t = input.value.trim().toUpperCase().replace(/^\$/, "");
    if (!tickerOk(t)) { status.textContent = "Enter a ticker symbol such as NVDA."; input.setAttribute("aria-invalid", "true"); return; }
    input.removeAttribute("aria-invalid"); status.textContent = "Adding " + t + "…";
    try { await api("/v1/me/watchlist", { method: "POST", body: { ticker: t } }); status.textContent = t + " added."; loadBriefing(); loadInstrument(); }
    catch (e) { status.textContent = e.message; }
  }
  async function explain(btn) {
    const box = btn.closest("[data-explain-box]");
    btn.disabled = true; btn.textContent = "Reading the filing…";
    try {
      const r = await api("/v1/ai/explain?accession=" + encodeURIComponent(btn.dataset.explain));
      box.innerHTML = '<div class="ix-ai"><p>' + esc(r.explanation) + "</p><small>Written by AI from this filing’s reported lines and checked against its figures" + (r.cached ? " · shared summary" : "") + ". The SEC document above is the authoritative record.</small></div>";
    } catch (e) {
      box.innerHTML = '<p class="ix-plain">' + esc(e.status === 429 ? e.message : e.status === 422 ? "The summary did not pass Insidir’s source checks, so it is not shown. The filing above is the full record." : "A plain-English summary is not available right now. The filing above is the full record.") + "</p>";
    }
  }
  function jumpToStory(id) {
    const t = feed.querySelector('[data-story="' + CSS.escape(id) + '"]');
    (t || document.getElementById("briefing")).scrollIntoView({ behavior: reduce.matches ? "auto" : "smooth", block: "start" });
    if (t) { const d = t.querySelector("details"); if (d) d.open = true; t.classList.remove("is-flash"); void t.offsetWidth; t.classList.add("is-flash"); }
  }
  function wireBriefing() {
    $$("[data-window] button").forEach(b => b.addEventListener("click", () => setWindow(Number(b.dataset.days))));
    $$("[data-order] button").forEach(b => b.addEventListener("click", () => { brief.order = b.dataset.orderBy; $$("[data-order] button").forEach(x => x.setAttribute("aria-checked", String(x === b))); if (brief.data) renderBriefing(); }));
    $$("[data-frequency] button").forEach(b => b.addEventListener("click", async () => {
      const value = b.dataset.frequencyValue, el = $("[data-delivery]");
      const before = $$("[data-frequency] button").find(x => x.getAttribute("aria-checked") === "true");
      $$("[data-frequency] button").forEach(x => x.setAttribute("aria-checked", String(x === b)));
      el.textContent = "Saving…";
      try {
        await api("/v1/me/intelligence/preferences", { method: "POST", body: { frequency: value } });
        if (brief.data) { brief.data.preferences = { ...(brief.data.preferences || {}), frequency: value }; renderDelivery(value, brief.data.delivery || {}); } else el.textContent = "Saved.";
      } catch (e) { $$("[data-frequency] button").forEach(x => x.setAttribute("aria-checked", String(x === before))); el.textContent = "Not saved: " + e.message; }
    }));
    feed.addEventListener("click", ev => {
      const ex = ev.target.closest("[data-explain]");
      if (ex) { explain(ex); return; }
      const j = ev.target.closest("[data-story-jump]");
      if (j) { ev.preventDefault(); jumpToStory(j.dataset.storyJump); return; }
      if (ev.target.closest('[data-retry="briefing"]')) loadBriefing();
    });
  }

  /* ======================= CAPITAL STRUCTURE ======================= */
  const structEl = $("[data-structure]");
  const struct = { data: null, person: null, seq: 0 };
  function structureHtml(d) {
    const people = d.people.map(p => '<li><button type="button" class="ix-node ix-node--person ix-node--media" data-person="' + esc(p.cik) + '" aria-pressed="' + (struct.person === p.cik) + '">' + face(p.name, p.cik, d.company.ticker, d.company.cik, "sm") + '<span class="ix-node__text"><b>' + esc(p.name) + "</b><span>" + esc(p.relationships.join(" · ") || "No relationship box recorded") + "</span><small>" + p.filings + " Form 4 · last " + esc(fmtShort(p.last)) + "</small></span></button></li>").join("");
    const secs = d.securities.map(s => '<li><div class="ix-node ix-node--security" data-security="' + esc(s.name) + '"><b>' + esc(s.name) + "</b><span>" + (s.derivative ? "Derivative security" : "Non-derivative security") + "</span><small>" + s.lines + " reported lines · " + s.people + " " + (s.people === 1 ? "person" : "people") + "</small></div></li>").join("");
    return '<div class="ix-cap"><svg class="ix-cap__links" data-cap-links aria-hidden="true"></svg>' +
      '<div class="ix-cap__col"><p class="ix-inst__head">Reporting people <span>' + d.people.length + " in 12 months</span></p><ul>" + (people || '<li class="ix-plain">No reporting people recorded.</li>') + "</ul></div>" +
      '<div class="ix-cap__core"><div class="ix-node ix-node--company" data-company>' + logo(d.company.ticker, d.company.cik, d.company.name, "md") + "<b>" + esc(d.company.ticker) + "</b><span>" + esc(d.company.name) + "</span><small>CIK " + esc(d.company.cik || "—") + " · last Form 4 " + esc(fmtShort(d.company.lastFiling)) + "</small>" +
        (localHref(d.company.href) ? '<a href="' + esc(d.company.href) + '">Company report →</a>' : "") + "</div></div>" +
      '<div class="ix-cap__col"><p class="ix-inst__head">Securities <span>as named on Form 4</span></p><ul>' + (secs || '<li class="ix-plain">No reported lines.</li>') + "</ul></div></div>" +
      '<div class="ix-cap__evidence" data-cap-evidence>' + evidenceHtml(d) + "</div>";
  }
  function evidenceHtml(d) {
    const p = d.people.find(x => x.cik === struct.person);
    if (!p) {
      const bars = V() ? V().bars(d.periods.map(x => x.filings), { width: 420, height: 64, labels: d.periods.map(x => x.month), label: "Form 4 filings per month for " + d.company.ticker }) : "";
      return '<div class="ix-evidence"><div><p class="ix-sub">Reporting periods</p>' + bars + '<p class="ix-note">Form 4 filings per month, last 12 months.</p></div><div><p class="ix-sub">What the lines mean</p><ul class="ix-gaps"><li>' + esc(d.labels.personCompany) + "</li><li>" + esc(d.labels.personSecurity) + '</li></ul><p class="ix-note">Select a person to inspect the evidence behind their lines.</p></div></div>';
    }
    const edges = d.edges.filter(e => e.person === p.cik);
    return '<div class="ix-evidence ix-in"><div><p class="ix-sub">Evidence</p><h3>' + ent(face(p.name, p.cik, d.company.ticker, d.company.cik, "md"), personLink(p.cik, p.name)) + "</h3>" +
      '<ul class="ix-rules"><li><span>Relationship (as filed)</span><b>' + esc(p.relationships.join(" · ") || "Not stated") + "</b></li><li><span>Form 4 filings, 12 months</span><b>" + p.filings + "</b></li><li><span>First / last in window</span><b>" + esc(fmtShort(p.first)) + " / " + esc(fmtShort(p.last)) + "</b></li></ul>" +
      '<p class="ix-note">' + esc(d.labels.personCompany) + "</p>" + (p.sources.length ? '<p class="ix-tape__links">' + p.sources.map((u, i) => ext(u, i ? "Earlier Form 4" : "Latest Form 4")).join(" ") + "</p>" : "") + "</div>" +
      '<div><p class="ix-sub">Reported transactions by security</p>' + (edges.length ? '<div class="ix-tablewrap"><table class="ix-table ix-table--stack"><thead><tr><th>Security</th><th class="num">Lines</th><th class="num">Purchases</th><th class="num">Sales</th><th class="num">Other</th><th>Last</th><th>Source</th></tr></thead><tbody>' +
        edges.map(e => '<tr><td class="ix-wide"><strong>' + esc(e.security) + "</strong>" + (e.derivative ? "<small>Derivative</small>" : "") + '</td><td class="num" data-label="Lines">' + e.lines + '</td><td class="num" data-label="Purchases">' + e.purchases + '</td><td class="num" data-label="Sales">' + e.sales + '</td><td class="num" data-label="Other">' + e.other + '</td><td data-label="Last">' + esc(fmtShort(e.last)) + '</td><td data-label="Source">' + ext(e.source, "Form 4") + "</td></tr>").join("") + "</tbody></table></div>" : '<p class="ix-plain">No individual lines are attributed to this person (their filings may be joint filings).</p>') +
      '<p class="ix-note">' + esc(d.labels.personSecurity) + "</p></div></div>";
  }
  function drawStructure() {
    const host = $(".ix-cap", structEl), overlay = $("[data-cap-links]", structEl), d = struct.data;
    if (!host || !overlay || !d || !V()) return;
    const active = struct.person ? new Set(d.edges.filter(e => e.person === struct.person).map(e => e.security)) : null;
    host.classList.toggle("has-selection", !!struct.person);
    $$("[data-security]", host).forEach(n => n.classList.toggle("is-related", !!(active && active.has(n.dataset.security))));
    if (!wide.matches) { overlay.innerHTML = ""; return; }
    const company = $("[data-company]", host), links = [];
    for (const p of d.people) { const n = $('[data-person="' + p.cik + '"]', host); if (n) links.push({ from: company, to: n, side: "left", key: "p:" + p.cik, active: struct.person === p.cik }); }
    for (const s of d.securities) { const n = $('[data-security="' + CSS.escape(s.name) + '"]', host); if (n) links.push({ from: company, to: n, side: "right", key: "s:" + s.name, active: !!(active && active.has(s.name)) }); }
    V().connect(overlay, host, links);
  }
  async function openStructure(ticker, scroll = false) {
    const t = String(ticker || "").trim().toUpperCase().replace(/^\$/, "");
    const input = $("#structure-ticker");
    if (!tickerOk(t)) { input.setAttribute("aria-invalid", "true"); return; }
    input.removeAttribute("aria-invalid"); input.value = t;
    $$("[data-structure-chips] button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.ticker === t)));
    if (scroll) document.getElementById("structure").scrollIntoView({ behavior: reduce.matches ? "auto" : "smooth", block: "start" });
    const seq = ++struct.seq;
    structEl.innerHTML = loader("Connecting records for " + t);
    try {
      const d = await api("/v1/intelligence/structure?ticker=" + encodeURIComponent(t));
      if (seq !== struct.seq) return;
      struct.data = d; struct.person = null;
      structEl.innerHTML = structureHtml(d);
      hydrate(structEl);
      requestAnimationFrame(drawStructure);
    } catch (e) {
      if (seq !== struct.seq) return;
      if (e.status === 404) structEl.innerHTML = empty("No Form 4 filings stored for " + t + ".", "Insidir builds this view only from reporting people’s own filings. When a filing for " + esc(t) + " is imported, its people and securities appear here.");
      else if (e.status !== 401 && e.status !== 402) structEl.innerHTML = errorBlock("The structure could not be loaded.", e);
    }
  }
  function wireStructureChips() {
    const box = $("[data-structure-chips]");
    const w = (inst.cats.watchlist && inst.cats.watchlist.records) || [], top = (inst.cats.companies && inst.cats.companies.records) || [];
    const tickers = [...new Set([...w.filter(r => r.active).map(r => r.ticker), ...w.map(r => r.ticker), ...top.map(r => r.ticker)].filter(tickerOk))].slice(0, 8);
    box.innerHTML = tickers.map(t => '<button type="button" data-ticker="' + esc(t) + '" aria-pressed="false">' + esc(t) + "</button>").join("");
    if (!struct.data && tickers[0]) openStructure(tickers[0]);
    else if (!tickers.length && !struct.data) structEl.innerHTML = empty("Choose a company.", "Type a ticker above to see its reporting people, their relationships as filed, and the securities they reported transactions in.");
  }
  function wireStructure() {
    structEl.innerHTML = loader("Waiting for your companies");
    $("[data-structure-form]").addEventListener("submit", e => { e.preventDefault(); openStructure($("#structure-ticker").value); });
    $("[data-structure-chips]").addEventListener("click", e => { const b = e.target.closest("[data-ticker]"); if (b) openStructure(b.dataset.ticker); });
    structEl.addEventListener("click", e => {
      const p = e.target.closest("[data-person]");
      if (!p || !struct.data) return;
      struct.person = struct.person === p.dataset.person ? null : p.dataset.person;
      $$("[data-person]", structEl).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.person === struct.person)));
      $("[data-cap-evidence]", structEl).innerHTML = evidenceHtml(struct.data);
      hydrate($("[data-cap-evidence]", structEl));
      drawStructure();
      if (!wide.matches) $("[data-cap-evidence]", structEl).scrollIntoView({ behavior: reduce.matches ? "auto" : "smooth", block: "nearest" });
    });
    if ("ResizeObserver" in window) new ResizeObserver(() => requestAnimationFrame(drawStructure)).observe(structEl);
  }

  /* ======================= INVESTIGATE: THE RESEARCH TERMINAL ======================= */
  const thread = $("[data-thread]"), form = $("[data-ask]"), field = $("#ix-question"), askError = $("[data-ask-error]");
  let lastPlan = null, seq = 0;
  const STAGE_DOTS = { understood: ["findings"], sources: ["filings", "companies"], connected: ["insiders", "purchases", "sales"], verified: ["changes", "watchlist", "people"], prepared: ["holdings", "findings"] };
  const stageDetail = (id, d) => !d ? "" : id === "sources" ? d.records + " records retrieved" : id === "connected" ? d.relationships + " relationships · " + d.events + " dated events" : id === "verified" ? d.references + " citation references checked against " + d.citations + " SEC sources" + (d.removed ? " · " + d.removed + " removed" : "") : id === "understood" && d.plan ? (d.plan.tickers.length ? d.plan.tickers.join(", ") + " · " : "") + (d.plan.timeLabel || "") : "";

  function autosize() { field.style.height = "auto"; field.style.height = Math.min(220, field.scrollHeight) + "px"; }
  const cites = (ids, aid) => (ids || []).length ? '<sup class="ix-cites">' + ids.map(n => '<a class="ix-cite" href="#ix-src-' + aid + "-" + Number(n) + '" aria-label="Source ' + Number(n) + '">' + Number(n) + "</a>").join("") + "</sup>" : "";
  function recordsHtml(records, aid) {
    if (!records || !records.length) return "";
    return '<div class="ix-recs"><div class="ix-recs__head" aria-hidden="true"><span>Traded</span><span>Reporting person</span><span>Transaction</span><span>Reported value</span><span>Source</span></div>' + records.map(r =>
      '<details class="ix-rec"><summary><span>' + esc(fmtShort(r.transactionDate)) + "</span><span>" + ent(face(r.person, r.personCik, r.ticker, null), "<b>" + esc(r.person) + "</b>" + (r.role ? "<small>" + esc(r.role) + "</small>" : "")) + "</span><span>" + esc(r.codeLabel) + (r.code ? " (" + esc(r.code) + ")" : "") + "</span><span>" + esc(money(r.value)) + "</span><span>" + cites(r.citation ? [r.citation] : [], aid) + "</span></summary>" +
      '<dl class="ix-rec__body"><div><dt>Company</dt><dd>' + companyLink(r.ticker, (r.ticker || "") + " · " + (r.company || "")) + "</dd></div><div><dt>Person</dt><dd>" + personLink(r.personCik, r.person) + "</dd></div><div><dt>Security</dt><dd>" + esc(r.security || "Not named") + (r.derivative ? " (derivative)" : "") + "</dd></div>" +
      "<div><dt>Shares</dt><dd>" + esc(num(r.shares)) + "</dd></div><div><dt>Price per share</dt><dd>" + esc(price(r.price)) + "</dd></div><div><dt>Reported value</dt><dd>" + esc(money(r.value)) + "</dd></div>" +
      "<div><dt>Transaction date</dt><dd>" + esc(fmtDay(r.transactionDate)) + "</dd></div><div><dt>Disclosed</dt><dd>" + esc(fmtTime(r.disclosedAt)) + "</dd></div><div><dt>Report</dt><dd>" + (r.amendment ? "Amended Form 4" : "Form 4") + "</dd></div></dl></details>").join("") + "</div>";
  }
  function reportHtml(a, aid) {
    const plan = a.plan || {};
    const chips = [];
    if (plan.companies && plan.companies.length) chips.push("<li><b>Companies</b>" + plan.companies.map(c => esc(c.ticker)).join(", ") + "</li>");
    if (plan.scope === "followed_people") chips.push("<li><b>People</b>You follow</li>");
    if (plan.scope === "watchlist") chips.push("<li><b>Scope</b>Your watchlist</li>");
    if (plan.scope === "market") chips.push("<li><b>Scope</b>All indexed companies</li>");
    if (plan.timeLabel) chips.push("<li><b>Period</b>" + esc(plan.timeLabel) + "</li>");
    if (plan.categories && plan.categories.length) chips.push("<li><b>Records</b>" + plan.categories.map(c => c === "reported_sale" ? "Sales" : "Purchases").join(", ") + "</li>");
    if (plan.usedContext) chips.push("<li><b>Follow-up</b>Kept your previous focus</li>");
    const status = { answered: "Answer from indexed records", no_data: "No matching records", unresolved: "Needs a company or scope", refused: "Outside Insidir’s scope" }[a.status] || "";
    const head = '<header class="ix-report__head"><span class="ix-report__mark">' + mark(40) + '</span><div><p class="ix-sub">Insidir research report · ' + esc(status) + " · retrieved " + esc(fmtTime(a.retrievedAt)) + '</p><h3 class="ix-answer__q">' + esc(a.question) + "</h3>" + (chips.length ? '<ul class="ix-plan" aria-label="How Insidir read the question">' + chips.join("") + "</ul>" : "") + "</div></header>";
    if (a.status === "refused") return head + '<section class="ix-part"><h4 class="ix-part__title"><span>§1</span>Finding</h4><div class="ix-summary"><p>' + esc(a.message) + "</p></div></section>";
    const nav = '<nav class="ix-report__nav" aria-label="Report sections"><a href="#' + aid + '-finding">Finding</a><a href="#' + aid + '-evidence">Evidence</a><a href="#' + aid + '-timeline">Timeline</a><a href="#' + aid + '-relationships">Relationships</a><a href="#' + aid + '-uncertainty">Uncertainty</a></nav>';
    let finding = '<div class="ix-summary">' + (a.summary || []).map(s => "<p>" + esc(s.text) + cites(s.cites, aid) + "</p>").join("") + "</div>";
    if (a.synthesis && a.synthesis.available) finding += '<div class="ix-block" data-synth-box><p class="ix-sub">Plain-English synthesis</p><p class="ix-plain" style="margin-bottom:12px">An AI-written reading of the cited records. It is checked against them before it is shown; if a check fails, nothing is shown.</p><button type="button" class="ix-btn" data-synth>Write a synthesis</button></div>';
    let evidence = "";
    for (const sec of a.sections || []) {
      if (sec.kind === "comparison") {
        evidence += '<div class="ix-block"><h5 class="ix-block__title">' + esc(sec.title) + '</h5><div class="ix-tablewrap"><table class="ix-table ix-table--stack"><thead><tr><th>Company</th><th class="num">Filings</th><th class="num">People</th><th class="num">Sales</th><th class="num">Sale value</th><th class="num">Purchases</th><th class="num">Purchase value</th><th class="num">Other</th><th>Last disclosed</th></tr></thead><tbody>' +
          sec.rows.map(r => '<tr><td class="ix-wide">' + companyLink(r.ticker) + "<small>" + esc(r.company) + '</small></td><td class="num" data-label="Filings">' + r.filings + '</td><td class="num" data-label="People">' + r.people + '</td><td class="num" data-label="Sales">' + r.sales + '</td><td class="num" data-label="Sale value">' + esc(money(r.saleValue)) + '</td><td class="num" data-label="Purchases">' + r.purchases + '</td><td class="num" data-label="Purchase value">' + esc(money(r.purchaseValue)) + '</td><td class="num" data-label="Other">' + r.other + '</td><td data-label="Last disclosed">' + esc(fmtDay(r.lastDisclosed)) + cites(r.citation ? [r.citation] : [], aid) + "</td></tr>").join("") + "</tbody></table></div></div>";
        continue;
      }
      evidence += '<div class="ix-block"><h5 class="ix-block__title">' + (sec.ticker ? logo(sec.ticker, null, sec.company, "xs") : "") + esc(sec.title) + (sec.ticker && sec.kind !== "story" ? ' <a class="ix-btn ix-btn--quiet" href="company.html?ticker=' + encodeURIComponent(sec.ticker) + '">Company report</a> <button type="button" class="ix-btn ix-btn--quiet" data-structure-open="' + esc(sec.ticker) + '">Capital structure</button>' : "") + "</h5>" +
        (sec.facts && sec.facts.length ? '<ul class="ix-facts">' + sec.facts.map(f => "<li>" + esc(f.text) + cites(f.cites, aid) + "</li>").join("") + "</ul>" : "") +
        (sec.filings && sec.filings.length ? '<p class="ix-sub" style="margin-top:18px">SEC filings in this period</p><ul class="ix-facts">' + sec.filings.map(f => "<li>" + esc(f.text) + cites(f.cites, aid) + "</li>").join("") + "</ul>" : "") +
        recordsHtml(sec.records, aid) + "</div>";
    }
    const KIND = { event: "Event", transaction: "Transaction", disclosed: "Disclosed", filed: "Filed" };
    const byDate = new Map();
    for (const e of a.timeline || []) { if (!byDate.has(e.date)) byDate.set(e.date, []); byDate.get(e.date).push(e); }
    const timeline = byDate.size ? '<ol class="ix-timeline ix-timeline--report">' + [...byDate.entries()].map(([d, es]) => "<li><strong>" + esc(fmtDay(d)) + "</strong><ul>" + es.map(e => '<li><span class="ix-kind">' + esc(KIND[e.kind] || e.kind) + "</span>" + esc(e.text) + cites(e.cites, aid) + "</li>").join("") + "</ul></li>").join("") + "</ol>" : '<p class="ix-plain">No dated records in this answer.</p>';
    const rel = (a.relationships || []).length ? '<ul class="ix-rels">' + a.relationships.map(r => '<li><span class="ix-rels__who">' + ent(face(r.person, r.personCik, r.ticker, null, "sm"), personLink(r.personCik, r.person) + "<small>" + esc(r.role || "Role not stated") + "</small>") + '</span><span class="ix-rels__line" aria-hidden="true"></span><span class="ix-rels__co">' + ent(logo(r.ticker, null, r.company, "sm"), companyLink(r.ticker, r.ticker || r.company) + "<small>" + esc(r.company || "") + "</small>") + "</span>" +
      '<span class="ix-rels__what">Reported ' + [r.sales ? r.sales + " sale" + (r.sales === 1 ? "" : "s") : "", r.purchases ? r.purchases + " purchase" + (r.purchases === 1 ? "" : "s") : "", r.other ? r.other + " other change" + (r.other === 1 ? "" : "s") : ""].filter(Boolean).join(", ") + (r.securities.length ? " in " + esc(r.securities.join(", ")) : "") + " · last " + esc(fmtShort(r.last)) + cites(r.cites, aid) + "<small>" + esc(r.basis) + "</small></span></li>").join("") + "</ul>" : '<p class="ix-plain">No person-to-company relationships appear in these records.</p>';
    const v = a.verification || {};
    const uncertainty = '<ul class="ix-gaps">' + (a.gaps || []).map(g => "<li>" + esc(g) + "</li>").join("") + "</ul>" + '<p class="ix-note">Verification: ' + (v.references || 0) + " citation references checked against " + (v.citations || 0) + " SEC sources" + (v.removed ? "; " + v.removed + " that did not resolve were removed" : "; all resolved") + ".</p>";
    const srcs = (a.citations || []).map(c => { const url = secUrl(c.url); return '<li id="ix-src-' + aid + "-" + c.id + '"><b>' + c.id + "</b><span>" + (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(c.label) + " ↗</a>" : esc(c.label)) + "<br>" + (c.date ? "Event " + esc(fmtDay(c.date)) + " · " : "") + "Filed " + esc(fmtDay(c.publishedAt)) + "</span></li>"; }).join("");
    const part = (n, id, title, body) => '<section class="ix-part" id="' + aid + "-" + id + '"><h4 class="ix-part__title"><span>§' + n + "</span>" + title + "</h4>" + body + "</section>";
    return head + nav + '<div class="ix-answer__grid"><div>' + part(1, "finding", "Finding", finding) + part(2, "evidence", "Evidence", evidence || '<p class="ix-plain">No records matched.</p>') + part(3, "timeline", "Timeline", timeline) + part(4, "relationships", "Relationships", rel) + part(5, "uncertainty", "Uncertainty", uncertainty) +
      '<form class="ix-followup" data-followup><label class="sr-only" for="' + aid + '-fu">Follow-up question</label><input id="' + aid + '-fu" maxlength="400" placeholder="Ask a follow-up, e.g. “Only purchases?” or “What about Microsoft?”" autocomplete="off"><button class="ix-btn ix-btn--solid" type="submit">Continue</button></form>' +
      ((a.followUps || []).length ? '<ul class="ix-follow">' + a.followUps.map(f => '<li><button type="button" data-follow>' + esc(f) + "</button></li>").join("") + "</ul>" : "") +
      '</div><aside class="ix-side">' + (srcs ? '<section class="ix-card"><h5 class="ix-card__title">Sources</h5><ol class="ix-srclist">' + srcs + "</ol></section>" : "") + "</aside></div>";
  }

  /* Streams /investigate?stream=1: each line is a stage the server has actually completed. */
  async function runInvestigation(q, context, onStage) {
    let res;
    try { res = await fetch("/v1/me/intelligence/investigate?stream=1", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" }, body: JSON.stringify({ question: q, context }) }); }
    catch { throw Object.assign(new Error("Insidir could not be reached. Check your connection and try again."), { status: 0 }); }
    if (!res.ok) { let d = null; try { d = await res.json(); } catch { /* */ } throw Object.assign(new Error((d && d.error) || "Request failed (" + res.status + ")"), { status: res.status }); }
    const handle = msg => { if (msg.stage === "answer") return msg.answer; if (msg.stage === "error") throw Object.assign(new Error(msg.error), { status: msg.status }); onStage(msg); return null; };
    if (!res.body || !res.body.getReader) { let answer = null; for (const l of (await res.text()).split("\n")) if (l.trim()) answer = handle(JSON.parse(l)) || answer; return answer; }
    const reader = res.body.getReader(), dec = new TextDecoder();
    let buf = "", answer = null;
    for (;;) {
      const { value, done } = await reader.read();
      if (value) buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) answer = handle(JSON.parse(line)) || answer; }
      if (done) break;
    }
    if (buf.trim()) answer = handle(JSON.parse(buf)) || answer;
    if (!answer) throw Object.assign(new Error("The research stream ended early. Try again."), { status: 0 });
    return answer;
  }
  async function ask(question, { followUp = false } = {}) {
    const q = String(question || "").trim();
    askError.hidden = true;
    if (!q) { askError.textContent = "Type a question, or choose one of the examples."; askError.hidden = false; field.focus(); return; }
    if (q.length > 400) { askError.textContent = "Questions are limited to 400 characters."; askError.hidden = false; return; }
    const aid = "a" + (++seq);
    $$(".ix-answer", thread).forEach(el => { if (el.closest(".ix-prev")) return; const d = document.createElement("details"); d.className = "ix-prev"; d.innerHTML = "<summary>" + esc(el.dataset.q) + "</summary>"; el.replaceWith(d); d.appendChild(el); });
    const box = document.createElement("article");
    box.className = "ix-answer ix-in"; box.dataset.q = q; box.id = aid;
    box.innerHTML = '<header class="ix-report__head"><span class="ix-report__mark" data-progress>' + mark(40, { progress: true, lit: [] }) + '</span><div><p class="ix-sub">Insidir research report · in progress</p><h3 class="ix-answer__q">' + esc(q) + '</h3></div></header><ol class="ix-steps" aria-label="Research status" data-steps><li class="is-active"><span>Sending the question</span><small></small></li></ol>';
    thread.prepend(box);
    box.scrollIntoView({ behavior: reduce.matches ? "auto" : "smooth", block: "start" });
    const btn = $(".ix-ask__go", form); btn.disabled = true;
    let done = 0;
    try {
      const a = await runInvestigation(q, followUp && lastPlan ? lastPlan : null, msg => {
        const steps = $("[data-steps]", box);
        if (msg.stage === "start") { steps.innerHTML = msg.stages.map((s, i) => '<li data-stage="' + esc(s.id) + '" class="' + (i === 0 ? "is-active" : "") + '"><span>' + esc(s.label) + "</span><small></small></li>").join(""); return; }
        const li = $('[data-stage="' + msg.stage + '"]', steps);
        if (!li) return;
        li.className = "is-done"; $("small", li).textContent = stageDetail(msg.stage, msg.detail);
        const next = li.nextElementSibling; if (next) next.className = "is-active";
        done++; if (M()) M().progress($("[data-progress]", box), done * 2);
        pulse(STAGE_DOTS[msg.stage] || []);
      });
      if (a.plan && a.status !== "refused") lastPlan = a.plan;
      box.innerHTML = reportHtml(a, aid);
      onboarded("investigate");
      box._answer = a;
      hydrate(box);
    } catch (e) {
      if (e.status === 401 || e.status === 402) return;
      box.innerHTML = '<h3 class="ix-answer__q">' + esc(q) + "</h3>" + errorBlock(e.status === 429 ? "Research limit reached." : "This question could not be researched right now.", e);
    } finally { btn.disabled = false; }
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
        box.innerHTML = '<p class="ix-sub">Plain-English synthesis</p><div class="ix-ai">' + html + "<small>Written by AI (" + esc(r.tier === "deep" ? "research model" : "standard model") + ") from the cited records only; figures and citations were checked before display" + (r.cached ? "; shared with other readers who asked about the same records" : "") + ".</small></div>";
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
      const so = e.target.closest("[data-structure-open]");
      if (so) openStructure(so.dataset.structureOpen, true);
    });
    thread.addEventListener("submit", e => { const f = e.target.closest("[data-followup]"); if (!f) return; e.preventDefault(); const v = $("input", f).value.trim(); if (v) { field.value = v; autosize(); ask(v, { followUp: true }); } });
  }

  /* ======================= MIRROR: OWNERSHIP INTELLIGENCE ======================= */
  const mirror = $("[data-mirror]");
  const mstate = { managers: [], cik: null, detail: null, budget: 500, timer: null, sim: null };
  const SHADES = ["#e9e4da", "#d3cec5", "#bdb9b1", "#a8a49d", "#9e9b94", "#8c8983", "#7b7873", "#696762", "#5c5a56", "#4f4d49", "#41403d", "#363532"];
  function unavailable(m) {
    mirror.className = "ix-mirror ix-mirror--single";
    mirror.innerHTML = '<div class="ix-unavailable"><div class="ix-unavailable__mark" aria-hidden="true">' + mark(150, { lit: ["holdings"] }) + '</div><div><p class="ix-kicker">Not yet available</p><h3>Mirror opens when the first Form 13F reports are imported.</h3><p>' + esc(m.reason || "Form 13F filings have not been imported yet.") + "</p><p>Mirror only ever shows holdings read from managers’ own SEC filings. Until they are imported and checked, there is nothing to show, so nothing is shown.</p>" +
      (m.lastCheckedAt ? '<p class="ix-note">Last checked ' + esc(fmtTime(m.lastCheckedAt)) + ".</p>" : "") + '<p class="ix-sub">What a 13F is, and is not</p><ol>' + (m.notes || []).map(n => "<li>" + esc(n) + "</li>").join("") + "</ol></div></div>";
  }
  const managerList = () => '<ul class="ix-managers" aria-label="Institutional managers">' + mstate.managers.map(m => '<li><button type="button" aria-pressed="' + (m.cik === mstate.cik) + '" data-manager="' + esc(m.cik) + '"><strong>' + esc(m.name || "CIK " + m.cik) + "</strong><span>Quarter ended " + esc(fmtDay(m.latestPeriod)) + " · " + esc(compact(m.reportedValue)) + "</span></button></li>").join("") + "</ul>";
  function profileHtml(d) {
    const c = d.current, complete = c.completeness === "complete";
    const delay = c.periodOfReport && c.filedAt ? daysBetween(c.periodOfReport, c.filedAt) : null;
    const hist = [...d.history].reverse();
    const valueBars = V() ? V().bars(hist.map(h => h.reportedValue), { width: 420, height: 64, labels: hist.map(h => String(h.periodOfReport || "").slice(0, 7)), label: "Reported value by quarter" }) : "";
    return '<div class="ix-profile ix-in"><header class="ix-profile__head"><div><p class="ix-kicker">Form 13F-HR · CIK ' + esc(d.manager.cik) + '</p><h3 class="ix-profile__name">' + esc(d.manager.name) + "</h3>" +
      '<p class="ix-profile__meta"><span>Holdings as of ' + esc(fmtDay(c.periodOfReport)) + "</span><span>Filed " + esc(fmtDay(c.filedAt)) + (delay != null ? " · " + delay + " days after quarter end" : "") + "</span>" + ext(c.sourceUrl, "Filing") + ext(c.infoTableUrl, "Information table") + "</p>" +
      '<p><span class="ix-badge' + (complete ? "" : " ix-badge--warn") + '">' + (complete ? "Totals match the filing’s cover page" : c.completeness === "totals_missing" ? "No cover-page totals to check against" : "Totals do not match the cover page") + "</span></p></div>" +
      '<div class="ix-profile__seal" aria-hidden="true">' + mark(96, { lit: ["holdings"] }) + "</div></header>" +
      '<dl class="ix-stats"><div><dt>Reported value</dt><dd>' + esc(compact(d.reportedValue)) + "<small>" + esc(money(d.reportedValue)) + "</small></dd></div><div><dt>Positions</dt><dd>" + d.positionsTotal + "<small>" + c.entries + " table rows</small></dd></div><div><dt>Quarter end</dt><dd>" + esc(fmtShort(c.periodOfReport)) + "<small>" + esc(String(c.periodOfReport || "").slice(0, 4)) + "</small></dd></div><div><dt>Reporting delay</dt><dd>" + (delay != null ? delay + " d" : "—") + "<small>quarter end to filing</small></dd></div></dl>" +
      '<section class="ix-sim" aria-labelledby="ix-sim-title"><h4 class="ix-card__title" id="ix-sim-title">Illustrative allocation</h4>' +
      '<div class="ix-sim__row"><div class="ix-budget"><label for="ix-budget">Hypothetical budget</label><div class="ix-budget__field"><span aria-hidden="true">$</span><input id="ix-budget" inputmode="decimal" autocomplete="off" value="' + esc(String(mstate.budget)) + '" aria-describedby="ix-budget-note"></div></div>' +
      '<div class="ix-chips" role="group" aria-label="Quick budgets">' + [100, 500, 1000, 10000].map(v => '<button type="button" data-budget="' + v + '" aria-pressed="' + (mstate.budget === v) + '">' + money(v) + "</button>").join("") + "</div></div>" +
      '<p class="ix-note" id="ix-budget-note" style="margin:0 0 18px">Each eligible holding gets the share of the budget that its reported value is of the eligible total, rounded to cents. Nothing is purchased or sent anywhere.</p>' +
      '<div data-sim aria-live="polite">' + loader("Calculating") + "</div></section>" +
      '<div class="ix-mirror__grid"><section class="ix-block"><h4 class="ix-block__title">Disclosure history</h4><ol class="ix-timeline">' + d.history.map((h, i) => { const dl = h.periodOfReport && h.filedAt ? daysBetween(h.periodOfReport, h.filedAt) : null; return '<li class="' + (i === 0 ? "is-current" : "") + '"><strong>Quarter ended ' + esc(fmtDay(h.periodOfReport)) + "</strong>Filed " + esc(fmtDay(h.filedAt)) + (dl != null ? " (" + dl + " days later)" : "") + " · " + h.entries + " rows · " + esc(compact(h.reportedValue)) + (h.formType === "13F-HR/A" ? " · amendment" : "") + (h.completeness !== "complete" ? " · totals unverified" : "") + " " + ext(h.sourceUrl, "source") + "</li>"; }).join("") + "</ol>" +
      (hist.length > 1 ? '<p class="ix-sub" style="margin-top:18px">Reported value by quarter</p>' + valueBars : "") + "</section>" + changesHtml(d) + "</div>" +
      '<section class="ix-block"><h4 class="ix-block__title">Reported holdings</h4><div class="ix-tablewrap"><table class="ix-table ix-table--stack"><thead><tr><th>Holding</th><th>Class</th><th class="num">Shares</th><th class="num">Reported value</th><th class="num">Weight</th></tr></thead><tbody>' +
        d.positions.slice(0, 40).map(p => '<tr><td class="ix-wide"><strong>' + esc(p.issuer) + "</strong><small>CUSIP " + esc(p.cusip) + (p.putCall ? " · " + esc(p.putCall) + " option" : "") + (p.shareType === "PRN" ? " · principal amount" : "") + '</small></td><td data-label="Class">' + esc(p.titleOfClass || "—") + '</td><td class="num" data-label="Shares">' + esc(num(p.shares)) + '</td><td class="num" data-label="Value">' + esc(money(p.value)) + '</td><td class="num" data-label="Weight">' + esc(pct(p.weightOfReported, 2)) + '<span class="ix-meter"><i style="width:' + Math.min(100, (p.weightOfReported || 0) * 100 / Math.max(.0001, d.positions[0].weightOfReported || 1)).toFixed(1) + '%"></i></span></td></tr>').join("") +
      "</tbody></table></div>" + (d.positionsTotal > 40 ? '<p class="ix-note">Showing the 40 largest of ' + d.positionsTotal + " positions. The simulation uses all of them.</p>" : "") + "</section>" +
      '<section class="ix-block"><h4 class="ix-block__title">Coverage and delays</h4><ul class="ix-gaps">' + d.notes.map(n => "<li>" + esc(n) + "</li>").join("") + "</ul></section></div>";
  }
  function changesHtml(d) {
    const ch = d.changes;
    if (!ch) return '<section class="ix-block"><h4 class="ix-block__title">Changes between quarters</h4><p class="ix-plain">Only one quarterly report has been imported for this manager, so there is nothing to compare yet.</p></section>';
    const list = (items, fmt) => items.length ? "<ul>" + items.slice(0, 8).map(fmt).join("") + "</ul>" + (items.length > 8 ? '<p class="ix-note">and ' + (items.length - 8) + " more</p>" : "") : '<p class="ix-plain">None</p>';
    return '<section class="ix-block"><h4 class="ix-block__title">Changes since the quarter ended ' + esc(fmtDay(ch.comparedTo.periodOfReport)) + "</h4>" +
      (ch.comparable ? "" : '<p class="ix-plain" style="margin-bottom:14px">One of the two reports did not match its own cover-page totals, so some differences may reflect missing rows rather than changes.</p>') +
      '<div class="ix-changes"><div><h5>New positions</h5>' + list(ch.new, x => "<li><span>" + esc(x.issuer) + "</span><b>" + esc(num(x.shares)) + " sh</b></li>") + "</div><div><h5>Exited</h5>" + list(ch.exited, x => "<li><span>" + esc(x.issuer) + "</span><b>was " + esc(num(x.previousShares)) + " sh</b></li>") + "</div>" +
      "<div><h5>Share count increased</h5>" + list(ch.increased, x => "<li><span>" + esc(x.issuer) + "</span><b>+" + esc(num(x.change)) + (x.changePct != null ? " (" + pct(x.changePct, 0) + ")" : "") + "</b></li>") + "</div><div><h5>Share count decreased</h5>" + list(ch.decreased, x => "<li><span>" + esc(x.issuer) + "</span><b>" + esc(num(x.change)) + (x.changePct != null ? " (" + pct(x.changePct, 0) + ")" : "") + "</b></li>") + "</div></div>" +
      '<p class="ix-note">Share counts at the two quarter ends. It does not show when, or at what price, anything changed in between.</p></section>';
  }
  function treemapHtml(s, W, H) {
    const top = s.allocations.slice(0, 18), rest = s.allocations.slice(18);
    const items = top.map((a, i) => ({ key: a.cusip, label: a.issuer, value: a.weight, dollars: a.dollars, shade: SHADES[Math.min(i, SHADES.length - 1)] }));
    if (rest.length) items.push({ key: "rest", label: rest.length + " other holdings", value: rest.reduce((x, a) => x + a.weight, 0), dollars: Math.round(rest.reduce((x, a) => x + a.dollars * 100, 0)) / 100, shade: "#2b2a28" });
    const rects = V() ? V().treemap(items, W, H) : [];
    return '<svg class="ix-treemap" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Illustrative allocation by holding: ' + esc(items.map(i => i.label + " " + pct(i.value)).join(", ")) + '">' + rects.map(r => {
      const it = r.item, light = SHADES.indexOf(it.shade) > -1 && SHADES.indexOf(it.shade) < 6, big = r.w > 110 && r.h > 46, mid = r.w > 64 && r.h > 26;
      const chars = Math.max(3, Math.floor((r.w - 16) / 7.6));
      return '<g class="ix-tm" data-key="' + esc(it.key) + '"><title>' + esc(it.label + " · " + pct(it.value, 2) + " · " + money(it.dollars, true)) + '</title><rect x="' + (r.x + .5).toFixed(1) + '" y="' + (r.y + .5).toFixed(1) + '" width="' + Math.max(0, r.w - 1).toFixed(1) + '" height="' + Math.max(0, r.h - 1).toFixed(1) + '" fill="' + it.shade + '"/>' +
        (mid ? '<text x="' + (r.x + 10).toFixed(1) + '" y="' + (r.y + 20).toFixed(1) + '" class="' + (light ? "on-light" : "on-dark") + '">' + esc(it.label.length > chars ? it.label.slice(0, chars - 1) + "…" : it.label) + "</text>" : "") +
        (big ? '<text x="' + (r.x + 10).toFixed(1) + '" y="' + (r.y + 38).toFixed(1) + '" class="' + (light ? "on-light" : "on-dark") + ' is-num">' + esc(pct(it.value)) + " · " + esc(money(it.dollars, true)) + "</text>" : "") + "</g>";
    }).join("") + "</svg>";
  }
  function simHtml(s, box) {
    const W = Math.max(300, Math.round((box && box.clientWidth) || 800)), H = W < 560 ? 260 : 340;
    return '<dl class="ix-stats" style="margin-bottom:18px"><div><dt>Allocated</dt><dd data-tw="allocated">' + esc(money(s.allocated, true)) + "</dd></div><div><dt>Holdings used</dt><dd>" + s.eligiblePositions + "<small>of " + s.positions + "</small></dd></div><div><dt>Coverage</dt><dd>" + esc(pct(s.coverage)) + "<small>of reported value</small></dd></div><div><dt>Excluded</dt><dd>" + s.excluded.length + "<small>" + (s.excluded.length ? "listed below" : "none") + "</small></dd></div></dl>" +
      '<div class="ix-treemap__wrap">' + treemapHtml(s, W, H) + "</div>" +
      '<details class="ix-more"><summary>Every illustrative amount (' + s.allocations.length + ')</summary><div class="ix-more__body"><div class="ix-tablewrap"><table class="ix-table ix-table--stack"><thead><tr><th>Holding</th><th class="num">Reported value</th><th class="num">Weight</th><th class="num">Illustrative amount</th></tr></thead><tbody>' +
        s.allocations.map(a => '<tr><td class="ix-wide"><strong>' + esc(a.issuer) + "</strong><small>" + esc(a.titleOfClass || "") + " · " + esc(a.cusip) + '</small></td><td class="num" data-label="Value">' + esc(money(a.reportedValue)) + '</td><td class="num" data-label="Weight">' + esc(pct(a.weight, 3)) + '</td><td class="num" data-label="Amount">' + esc(money(a.dollars, true)) + "</td></tr>").join("") + "</tbody></table></div></div></details>" +
      (s.excluded.length ? '<details class="ix-more"><summary>Excluded from the simulation (' + s.excluded.length + ')</summary><div class="ix-more__body"><ul class="ix-gaps">' + s.excluded.map(x => "<li>" + esc(x.issuer) + " (" + esc(money(x.reportedValue)) + "): " + esc(x.reason) + "</li>").join("") + "</ul></div></details>" : "") +
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
    try {
      const s = await api("/v1/intelligence/mirror/simulate?cik=" + encodeURIComponent(mstate.cik) + "&budget=" + encodeURIComponent(raw));
      const prev = $("[data-tw=allocated]", box), was = prev ? Number(prev.dataset.value || 0) : 0;
      mstate.sim = s;
      box.innerHTML = simHtml(s, box);
      const el = $("[data-tw=allocated]", box);
      if (el) { el.dataset.value = String(was); tween(el, s.allocated, v => money(v, true)); }
    } catch (e) { if (e.status !== 401 && e.status !== 402) box.innerHTML = errorBlock("The simulation could not be run.", e); }
  }
  async function selectManager(cik) {
    mstate.cik = cik;
    $$("[data-manager]", mirror).forEach(b => b.setAttribute("aria-pressed", String(b.dataset.manager === cik)));
    const pane = $("[data-profile]", mirror);
    pane.innerHTML = loader("Reading the manager’s filings");
    try { mstate.detail = await api("/v1/intelligence/mirror/managers/" + encodeURIComponent(cik)); pane.innerHTML = profileHtml(mstate.detail); runSim(); }
    catch (e) { if (e.status !== 401 && e.status !== 402) pane.innerHTML = errorBlock("This manager’s filings could not be loaded.", e, "mirror"); }
  }
  async function loadMirror() {
    mirror.innerHTML = loader("Reading Form 13F reports");
    try {
      const m = await api("/v1/intelligence/mirror/managers");
      mirror.setAttribute("aria-busy", "false");
      if (!m.available) { unavailable(m); return; }
      mstate.managers = m.managers;
      mirror.className = "ix-mirror";
      mirror.innerHTML = "<div>" + managerList() + "</div><div data-profile></div>";
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
    let w = 0;
    if ("ResizeObserver" in window) new ResizeObserver(() => { const box = $("[data-sim]", mirror), nw = box ? Math.round(box.clientWidth) : 0; if (mstate.sim && box && Math.abs(nw - w) > 40) { w = nw; const wrap = $(".ix-treemap__wrap", box); if (wrap) wrap.innerHTML = treemapHtml(mstate.sim, Math.max(300, nw), nw < 560 ? 260 : 340); } }).observe(mirror);
  }

  function start() {
    $$("[data-head-mark]").forEach(el => { el.innerHTML = mark(15); });
    const bm = $("[data-bar-mark]"); if (bm) bm.innerHTML = mark(18);
    intro();
    sectionSpy();
    wireInstrument(); wireTape(); wireBriefing(); wireStructure(); wireInvestigate(); wireMirror();
    aiStatus().finally(loadBriefing);
    loadInstrument(); loadTape(); loadMirror();
    autosize();
    const q = new URLSearchParams(location.search).get("q");
    if (q && q.length <= 400) { field.value = q; autosize(); ask(q); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
