/* Alerts page: renders the (sample) alert feed, filter pills with a sliding
   thumb and hash preselect (#insider #filings #political #price #watchlist),
   animated filtering (FLIP), expandable rows with source links, and the
   "Manage alerts" drawer (focus trap, Esc, toggles saved to localStorage). */
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const EASE = "cubic-bezier(.16,1,.3,1)";
  const I = window.Insidir || {};
  const ICONS = I.icons || {};

  const table = document.querySelector(".alerts-table");
  const panel = document.querySelector(".alerts-panel");
  if (!table || !panel) return;

  /* ---------- sample data (illustrative, see footer note) ---------- */
  const WATCHLIST = ["AAPL", "NVDA", "MSFT", "TSLA", "META"];

  const svg = inner => `<svg viewBox="0 0 20 20" aria-hidden="true">${inner}</svg>`;
  const stroke = 'fill="none" stroke-linecap="round" stroke-linejoin="round"';
  const doc = c => `<path d="M7.2 5.4h3.9l2.3 2.3v6.4a.6.6 0 0 1-.6.6H7.2a.6.6 0 0 1-.6-.6V6a.6.6 0 0 1 .6-.6Z" ${stroke} stroke="${c}" stroke-width="1.3"/>
    <path d="M10.9 5.6v2.3h2.3M8.4 10.6h3.2M8.4 12.5h2.1" ${stroke} stroke="${c}" stroke-width="1.2"/>`;
  const ICON = {
    buy: svg(`<circle cx="10" cy="10" r="10" fill="#1c5a3a"/><path d="M7 13 13 7M8.4 7H13v4.6" ${stroke} stroke="#fff" stroke-width="1.7"/>`),
    sell: svg(`<circle cx="10" cy="10" r="10" fill="#df3f45"/><path d="M7 7l6 6M13 8.4V13H8.4" ${stroke} stroke="#fff" stroke-width="1.7"/>`),
    sec: svg(`<circle cx="10" cy="10" r="10" fill="#4874c2"/>${doc("#fff")}`),
    secOutline: svg(`<circle cx="10" cy="10" r="9.1" fill="#fff" stroke="#4874c2" stroke-width="1.6"/>${doc("#4874c2")}`),
    political: svg(`<circle cx="10" cy="10" r="10" fill="#e0373d"/><path d="M7.9.2A10 10 0 0 0 7.9 19.8Z" fill="#dbe2e9"/>
      <path d="M9.4 14.7h7.2M10 13.4h6M10.7 13.1V10.3M13 13.1V10.3M15.3 13.1V10.3M10 9.9h6M10.6 9.7a2.4 2.4 0 0 1 4.8 0M13 7.3V5.8" ${stroke} stroke="#fff" stroke-width="1.2"/>`),
    price: svg(`<circle cx="10" cy="10" r="10" fill="#1f5ff0"/><path d="M5.4 12.8 8.5 9.7l2.3 2.3 3.8-4.1M12 7.8h2.7v2.7" ${stroke} stroke="#fff" stroke-width="1.6"/>`)
  };
  const CHEV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
  const EXT = ICONS.external || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>';
  const ARROW = ICONS.arrow || '<svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

  const TYPES = {
    buy: { label: "Insider Buy", cls: "t-buy", group: "insider" },
    sell: { label: "Insider Sell", cls: "t-sell", group: "insider" },
    sec: { label: "SEC Filing", cls: "t-sec", group: "filings" },
    political: { label: "Political Trade", cls: "t-political", group: "political" },
    price: { label: "Price Move", cls: "t-price", group: "price" }
  };

  const ALERTS = [
    { time: "2m ago", dot: "green", type: "buy", ticker: "NVDA", form: "4", text: "New Form 4 filed by Jensen Huang (12,000 shares)",
      facts: [["Form", "Form 4"], ["Filed by", "Jensen Huang"], ["Transaction", "Purchase"], ["Shares", "12,000"]] },
    { time: "12m ago", dot: "red", type: "sec", ticker: "TSLA", form: "8-K", text: "8-K: Material agreement filed",
      facts: [["Form", "8-K · current report"], ["Item", "1.01 Material agreement"], ["Filer", "Tesla, Inc."]] },
    { time: "28m ago", dot: "green", type: "political", ticker: "NVDA", chamber: "house", text: "Nancy Pelosi bought NVDA call options",
      facts: [["Disclosure", "Periodic transaction report"], ["Filer", "Nancy Pelosi"], ["Asset", "NVDA call options"], ["Transaction", "Purchase"]] },
    { time: "1h ago", dot: "red", type: "sell", ticker: "AAPL", form: "4", text: "Tim Cook sold 50,000 shares",
      facts: [["Form", "Form 4"], ["Filed by", "Tim Cook"], ["Transaction", "Sale"], ["Shares", "50,000"]] },
    { time: "3h ago", dot: "green", type: "price", ticker: "GOOGL", text: "Up 8% in the last hour",
      facts: [["Move", "+8%"], ["Window", "Last hour"], ["Threshold", "Greater than 5%"]] },
    { time: "4h ago", dot: "green", type: "sec", ticker: "META", form: "10-Q", outline: true, text: "New Form 10-Q filed",
      facts: [["Form", "10-Q · quarterly report"], ["Filer", "Meta Platforms, Inc."]] },
    { time: "Yesterday", dot: "green", type: "buy", ticker: "MSFT", form: "4", text: "Director purchase reported on Form 4 (4,500 shares)",
      facts: [["Form", "Form 4"], ["Filed by", "Company director"], ["Transaction", "Purchase"], ["Shares", "4,500"]] },
    { time: "Yesterday", dot: "red", type: "price", ticker: "TSLA", text: "Down 6% in the last hour",
      facts: [["Move", "−6%"], ["Window", "Last hour"], ["Threshold", "Greater than 5%"]] },
    { time: "Yesterday", dot: "green", type: "political", ticker: "AAPL", chamber: "house", text: "Periodic transaction report: AAPL purchase ($15K–$50K)",
      facts: [["Disclosure", "Periodic transaction report"], ["Filer", "House member"], ["Asset", "AAPL stock"], ["Amount", "$15,001–$50,000"]] },
    { time: "2d ago", dot: "red", type: "sell", ticker: "ABNB", form: "4", text: "Officer sale reported on Form 4 (18,250 shares)",
      facts: [["Form", "Form 4"], ["Filed by", "Company officer"], ["Transaction", "Sale"], ["Shares", "18,250"]] },
    { time: "2d ago", dot: "green", type: "sec", ticker: "MSFT", form: "8-K", text: "8-K: Results of operations filed",
      facts: [["Form", "8-K · current report"], ["Item", "2.02 Results of operations"], ["Filer", "Microsoft Corporation"]] },
    { time: "2d ago", dot: "red", type: "political", ticker: "TSLA", chamber: "senate", text: "Periodic transaction report: TSLA sale ($1K–$15K)",
      facts: [["Disclosure", "Periodic transaction report"], ["Filer", "Senator"], ["Asset", "TSLA stock"], ["Amount", "$1,001–$15,000"]] }
  ];

  const FILTERS = {
    all: () => true,
    insider: a => TYPES[a.type].group === "insider",
    filings: a => TYPES[a.type].group === "filings",
    political: a => TYPES[a.type].group === "political",
    price: a => TYPES[a.type].group === "price",
    watchlist: a => WATCHLIST.includes(a.ticker)
  };
  const HASHES = {
    all: "all", insider: "insider", "insider-trades": "insider", filings: "filings", "sec-filings": "filings", sec: "filings",
    political: "political", "political-trades": "political", price: "price", "price-moves": "price", watchlist: "watchlist"
  };

  /* ---------- rendering ---------- */
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const edgar = (ticker, type = "") =>
    `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${encodeURIComponent(ticker)}&type=${encodeURIComponent(type)}&dateb=&owner=include&count=40`;

  function sources(a) {
    const out = [];
    if (a.type === "buy" || a.type === "sell") out.push([edgar(a.ticker, "4"), `Form 4 filings on SEC EDGAR`]);
    else if (a.type === "sec") out.push([edgar(a.ticker, a.form), `${a.form} filings on SEC EDGAR`]);
    else out.push([edgar(a.ticker), `${a.ticker} filings on SEC EDGAR`]);
    if (a.chamber === "house") out.unshift(["https://disclosures-clerk.house.gov/FinancialDisclosure", "House disclosures"]);
    if (a.chamber === "senate") out.unshift(["https://efdsearch.senate.gov/search/", "Senate disclosures"]);
    return out;
  }

  function alertHTML(a, i) {
    const t = TYPES[a.type];
    const icon = a.type === "sec" ? (a.outline ? ICON.secOutline : ICON.sec) : ICON[a.type];
    const id = `alert-${i + 1}`;
    return `<tbody class="alert alert-in" data-index="${i}" data-group="${t.group}" data-ticker="${a.ticker}">
      <tr class="alert-row">
        <td class="cell-time"><span class="cell-in"><span class="dot alert-dot${a.dot === "red" ? " alert-dot--red" : ""}${i < 2 ? " dot--live" : ""}" aria-hidden="true"></span><span class="alert-time">${esc(a.time)}</span></span></td>
        <td class="cell-type"><span class="alert-type ${t.cls}"><span class="alert-icon">${icon}</span>${t.label}</span></td>
        <td class="cell-desc"><button class="alert-toggle" type="button" id="${id}" aria-expanded="false" aria-controls="${id}-detail">${esc(a.text)}</button></td>
        <td class="cell-co"><a class="ticker" href="company.html?ticker=${encodeURIComponent(a.ticker)}" aria-label="${a.ticker} company page">${a.ticker}</a><span class="alert-chev" aria-hidden="true">${CHEV}</span></td>
      </tr>
      <tr class="alert-detail"><td colspan="4">
        <div class="alert-detail__wrap" id="${id}-detail" role="region" aria-labelledby="${id}" inert>
          <div class="alert-detail__inner"><div class="alert-detail__card">
            <dl class="alert-facts">${a.facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>
            <div class="alert-links">
              ${sources(a).map(([href, label]) => `<a class="alert-src" href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)}${EXT}<span class="sr-only"> (opens in a new tab)</span></a>`).join("")}
              <a class="btn btn--light btn--sm" href="company.html?ticker=${encodeURIComponent(a.ticker)}">View company ${ARROW}</a>
            </div>
            <p class="alert-detail__note">Sample alert shown for illustration. Verify against the original record before acting.</p>
          </div></div>
        </div>
      </td></tr>
    </tbody>`;
  }

  table.insertAdjacentHTML("beforeend", ALERTS.map(alertHTML).join(""));
  const groups = [...table.querySelectorAll("tbody.alert")];
  const data = new Map(groups.map((g, i) => [g, ALERTS[i]]));
  const empty = panel.querySelector(".alerts-empty");
  const status = document.getElementById("alerts-status");

  /* ---------- rows reveal as they scroll into view ---------- */
  let firstBatch = true;
  const rowIO = !reduce && "IntersectionObserver" in window ? new IntersectionObserver(entries => {
    const incoming = entries.filter(e => e.isIntersecting && !e.target.classList.contains("is-in") && !e.target.hidden)
      .map(e => e.target).sort((a, b) => a.dataset.index - b.dataset.index);
    const base = firstBatch ? 0.36 : 0.02;
    incoming.forEach((g, k) => { g.style.setProperty("--delay", (base + k * 0.065).toFixed(3) + "s"); g.classList.add("is-in"); });
    if (incoming.length) firstBatch = false;
  }, { rootMargin: "0px 0px -4% 0px", threshold: 0 }) : null;
  groups.forEach(g => rowIO ? rowIO.observe(g) : g.classList.add("is-in"));

  /* ---------- expandable rows ---------- */
  function setOpen(g, open) {
    g.classList.toggle("is-open", open);
    g.querySelector(".alert-toggle").setAttribute("aria-expanded", String(open));
    const wrap = g.querySelector(".alert-detail__wrap");
    if (open) wrap.removeAttribute("inert"); else wrap.setAttribute("inert", "");
  }
  table.addEventListener("click", e => {
    const row = e.target.closest(".alert-row");
    if (!row || e.target.closest("a")) return;
    const g = row.parentElement;
    setOpen(g, !g.classList.contains("is-open"));
  });

  /* ---------- filter pills ---------- */
  const tablist = document.querySelector(".alert-filters");
  const scroller = document.querySelector(".alert-filters-scroll");
  const tabs = [...tablist.querySelectorAll(".alert-filter")];
  const thumb = tablist.querySelector(".alert-filters__thumb");
  let current = "all";

  function placeThumb(btn, instant) {
    if (!btn) return;
    if (instant) thumb.style.transition = "none";
    thumb.style.width = btn.offsetWidth + "px";
    thumb.style.height = btn.offsetHeight + "px";
    thumb.style.transform = `translate3d(${btn.offsetLeft}px,${btn.offsetTop}px,0)`;
    if (instant) { void thumb.offsetWidth; thumb.style.transition = ""; }
  }
  const activeTab = () => tabs.find(t => t.dataset.filter === current) || tabs[0];

  function revealPillIfScrolled(btn) {
    if (scroller.scrollWidth <= scroller.clientWidth + 1) return;
    const left = btn.offsetLeft - (scroller.clientWidth - btn.offsetWidth) / 2;
    scroller.scrollTo({ left: Math.max(0, left), behavior: reduce ? "auto" : "smooth" });
  }

  function updateHash(value) {
    const url = location.pathname + location.search + (value === "all" ? "" : "#" + value);
    try { history.replaceState(null, "", url); } catch (_) { /* file:// or sandboxed */ }
  }

  function markLast() {
    let last = null;
    groups.forEach(g => { g.classList.remove("is-last"); if (!g.hidden) last = g; });
    if (last) last.classList.add("is-last");
  }

  function announce(count) {
    const label = activeTab().textContent.trim();
    status.textContent = count ? `${count} ${count === 1 ? "alert" : "alerts"} shown${current === "all" ? "" : " for " + label}.` : `No alerts for ${label}.`;
  }

  let running = [], pending = null;
  function finishRunning() {
    if (pending) { clearTimeout(pending.timer); pending.run(true); }
    running.forEach(a => { if (a.playState === "idle") return; try { a.finish(); } catch (_) { a.cancel(); } });
    running = [];
  }

  function showEmpty(show, animate) {
    if (show === !empty.hidden) return;
    empty.hidden = !show;
    if (show && animate) running.push(empty.animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 600, easing: EASE }));
  }

  function applyFilter(animate) {
    finishRunning(); // settle any half-finished transition before reading the DOM state
    const match = FILTERS[current] || (() => false);
    const want = new Set(groups.filter(g => match(data.get(g))));
    const visible = groups.filter(g => !g.hidden);
    const outgoing = visible.filter(g => !want.has(g));
    const staying = visible.filter(g => want.has(g));
    const incoming = groups.filter(g => g.hidden && want.has(g));

    if (!animate || reduce) {
      groups.forEach(g => { g.hidden = !want.has(g); if (g.hidden) setOpen(g, false); });
      showEmpty(want.size === 0, false);
      markLast();
      announce(want.size);
      return;
    }

    const firstTop = new Map(staying.map(g => [g, g.getBoundingClientRect().top]));
    const h0 = panel.offsetHeight;
    const fades = outgoing.map(g => g.animate([{ opacity: 1 }, { opacity: 0, transform: "translateY(-4px)" }], { duration: 170, easing: "ease-in", fill: "forwards" }));
    running.push(...fades);

    const swap = () => {
      pending = null;
      outgoing.forEach(g => { g.hidden = true; setOpen(g, false); });
      fades.forEach(a => a.cancel());
      running = running.filter(a => !fades.includes(a));
      incoming.forEach(g => { g.hidden = false; });
      showEmpty(want.size === 0, true);
      markLast();
      announce(want.size);

      const vh = window.innerHeight;
      staying.forEach(g => {
        const dy = firstTop.get(g) - g.getBoundingClientRect().top;
        if (Math.abs(dy) > 0.5) running.push(g.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 620, easing: EASE }));
      });
      let k = 0;
      incoming.forEach(g => {
        // rows that land below the fold keep their scroll-triggered reveal
        if (g.getBoundingClientRect().top > vh) { g.classList.remove("is-in"); g.style.removeProperty("--delay"); return; }
        g.style.setProperty("--delay", "0s");
        g.style.transition = "none";
        g.classList.add("is-in");
        void g.offsetWidth;
        g.style.transition = "";
        running.push(g.animate([{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "none" }],
          { duration: 640, delay: 40 + k++ * 50, easing: EASE, fill: "backwards" }));
      });
      const h1 = panel.offsetHeight;
      if (Math.abs(h1 - h0) > 1) running.push(panel.animate([{ height: h0 + "px" }, { height: h1 + "px" }], { duration: 620, easing: EASE }));
    };
    if (outgoing.length) pending = { run: swap, timer: setTimeout(swap, 160) };
    else swap();
  }

  function setFilter(value, { animate = true, focus = false, hash = true } = {}) {
    if (!FILTERS[value]) value = "all";
    const btn = tabs.find(t => t.dataset.filter === value);
    tabs.forEach(t => {
      const on = t === btn;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
    });
    panel.setAttribute("aria-labelledby", btn.id);
    placeThumb(btn, !animate);
    if (focus) btn.focus({ preventScroll: true });
    revealPillIfScrolled(btn);
    if (value === current && animate) return;
    current = value;
    if (hash) updateHash(value);
    applyFilter(animate);
  }

  tabs.forEach(t => t.addEventListener("click", () => setFilter(t.dataset.filter)));
  tablist.addEventListener("keydown", e => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    let n = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") n = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = tabs.length - 1;
    if (n === null) return;
    e.preventDefault();
    setFilter(tabs[n].dataset.filter, { focus: true });
  });
  panel.querySelector("[data-show-all]").addEventListener("click", () => {
    setFilter("all");
    tabs[0].focus({ preventScroll: true });
  });

  const fromHash = () => HASHES[decodeURIComponent(location.hash.slice(1)).toLowerCase()] || null;
  const initial = fromHash() || "all";
  current = null;
  setFilter(initial, { animate: false, hash: false });
  window.addEventListener("hashchange", () => {
    if (location.hash === "#manage") { openDrawer(); return; }
    const v = fromHash();
    if (v && v !== current) setFilter(v, { hash: false });
  });

  // keep the thumb glued to its pill through font loading and resizes
  const replace = () => placeThumb(activeTab(), true);
  requestAnimationFrame(replace);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(replace);
  if ("ResizeObserver" in window) new ResizeObserver(replace).observe(tablist);
  else window.addEventListener("resize", replace);

  /* ---------- Manage alerts drawer ---------- */
  const drawer = document.getElementById("alerts-drawer");
  const dPanel = drawer.querySelector(".drawer__panel");
  const opener = document.getElementById("manage-alerts");
  const switches = [...drawer.querySelectorAll(".switch")];
  const KEY = "insidir.alertPrefs";
  const DEFAULTS = { insiderWatchlist: true, filingsWatchlist: true, political: true, priceMoves: false, weeklyDigest: false };
  let lastFocus = null;

  function loadPrefs() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (_) { saved = null; }
    const prefs = Object.assign({}, DEFAULTS, saved && typeof saved === "object" ? saved : {});
    prefs.weeklyDigest = false; // not available yet
    return prefs;
  }
  function renderPrefs(prefs) {
    switches.forEach(s => s.setAttribute("aria-checked", String(!!prefs[s.dataset.pref])));
  }
  switches.forEach(s => s.addEventListener("click", () => {
    if (s.disabled || s.getAttribute("aria-disabled") === "true") return;
    s.setAttribute("aria-checked", String(s.getAttribute("aria-checked") !== "true"));
  }));

  const outside = () => [...document.body.children].filter(el => el !== drawer && el.tagName !== "SCRIPT" && !el.classList.contains("toast"));
  function openDrawer() {
    if (drawer.classList.contains("is-open")) return;
    lastFocus = document.activeElement;
    renderPrefs(loadPrefs());
    const sbw = window.innerWidth - document.documentElement.clientWidth;
    document.documentElement.classList.add("drawer-lock");
    if (sbw > 0) document.body.style.paddingRight = sbw + "px";
    outside().forEach(el => { el.inert = true; });
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
    opener.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => dPanel.focus({ preventScroll: true }));
  }
  function closeDrawer() {
    if (!drawer.classList.contains("is-open")) return;
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    opener.setAttribute("aria-expanded", "false");
    outside().forEach(el => { el.inert = false; });
    document.documentElement.classList.remove("drawer-lock");
    document.body.style.paddingRight = "";
    if (location.hash === "#manage") updateHash(current);
    const back = lastFocus && document.contains(lastFocus) && lastFocus !== document.body ? lastFocus : opener;
    back.focus({ preventScroll: true });
  }
  opener.setAttribute("aria-expanded", "false");
  opener.addEventListener("click", openDrawer);
  drawer.querySelectorAll("[data-drawer-close]").forEach(el => el.addEventListener("click", closeDrawer));

  const focusables = () => [...dPanel.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])')]
    .filter(el => el.getClientRects().length);
  drawer.addEventListener("keydown", e => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeDrawer(); return; }
    if (e.key !== "Tab") return;
    const f = focusables();
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1], active = document.activeElement;
    if (e.shiftKey && (active === first || active === dPanel || !dPanel.contains(active))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (active === last || !dPanel.contains(active))) { e.preventDefault(); first.focus(); }
  });

  drawer.querySelector("[data-save-prefs]").addEventListener("click", () => {
    const prefs = {};
    switches.forEach(s => { prefs[s.dataset.pref] = s.getAttribute("aria-checked") === "true"; });
    prefs.weeklyDigest = false;
    let ok = true;
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (_) { ok = false; }
    closeDrawer();
    if (I.toast) I.toast(ok ? "Alert preferences saved" : "Preferences couldn't be stored in this browser");
  });

  if (location.hash === "#manage") requestAnimationFrame(openDrawer);

  window.Insidir = Object.assign(window.Insidir || {}, {
    alerts: { setFilter: (v, o) => setFilter(v, o), open: openDrawer, close: closeDrawer, filters: FILTERS, get filter() { return current; } }
  });
})();
