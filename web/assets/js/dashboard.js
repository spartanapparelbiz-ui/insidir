/* Dashboard: greeting + New York market clock, index sparklines, and the
   four sample-data panels (insider activity with an animated Buys/Sells
   filter, watchlist, recent filings, political trades).
   Markup is rendered synchronously so motion.js picks it up on DOMContentLoaded. */
(() => {
  const I = window.Insidir || {};
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const mono = name => (I.monogram ? I.monogram(name, "dash-avatar") : `<span class="monogram dash-avatar" aria-hidden="true">${esc(name.split(" ").map(p => p[0]).join(""))}</span>`);
  const logo = (t, size) => (I.logo ? I.logo(t, size) : "");
  const spark = (seed, opts) => {
    if (!I.series || !I.sparkline) return "";
    return I.sparkline(I.series(seed, opts.n || 30, { start: 100, drift: opts.drift || 1.1, vol: opts.vol || 2.4 }), opts);
  };
  const secs = ms => (ms / 1000).toFixed(3) + "s";

  /* ---------- sample data (illustrative, mirrors the product mock) ---------- */
  const INSIDER = [
    { time: "12m ago", name: "Satya Nadella", ticker: "MSFT", type: "buy", value: "$33.2M" },
    { time: "28m ago", name: "Tim Cook", ticker: "AAPL", type: "sell", value: "$8.4M" },
    { time: "1h ago", name: "Jensen Huang", ticker: "NVDA", type: "buy", value: "$17.6M" },
    { time: "2h ago", name: "Mark Zuckerberg", ticker: "META", type: "sell", value: "$30.1M" },
    { time: "3h ago", name: "Brian Chesky", ticker: "ABNB", type: "buy", value: "$10.8M" }
  ];
  const WATCH = [
    { ticker: "AAPL", price: "168.21", d: "+0.6%", w: "+2.4%", m: "+8.1%", seed: "sp266" },
    { ticker: "NVDA", price: "146.33", d: "+2.3%", w: "+6.8%", m: "+23.4%", seed: "sp2859" },
    { ticker: "MSFT", price: "443.21", d: "+0.4%", w: "+1.9%", m: "+5.6%", seed: "sp1067" },
    { ticker: "TSLA", price: "195.22", d: "-0.8%", w: "+4.2%", m: "+12.1%", seed: "sp2673", red: true },
    { ticker: "META", price: "301.12", d: "+1.2%", w: "+3.1%", m: "+11.8%", seed: "sp2220" }
  ];
  const FILINGS = [
    { ticker: "AAPL", form: "8-K", date: "Jan 8, 2024" },
    { ticker: "NVDA", form: "10-Q", date: "Jan 8, 2024" },
    { ticker: "MSFT", form: "8-K", date: "Jan 7, 2024" },
    { ticker: "TSLA", form: "4", date: "Jan 7, 2024" },
    { ticker: "META", form: "10-K", date: "Jan 6, 2024" }
  ];
  const POLITICAL = [
    { name: "Nancy Pelosi", ticker: "NVDA", type: "buy", date: "Jan 6, 2024" },
    { name: "Josh Hawley", ticker: "TSLA", type: "buy", date: "Jan 5, 2024" },
    { name: "Mark Warner", ticker: "AAPL", type: "sell", date: "Jan 4, 2024" }
  ];
  // Seeds chosen for a steady zig-zag climb like the reference sparklines.
  const CARD_SEEDS = { spx: "sp18", ndx: "sp670", dji: "sp985", rut: "sp435" };

  const company = t => `company.html?ticker=${encodeURIComponent(t)}`;
  const txLabel = type => (type === "buy" ? '<span class="buy">Buy</span>' : '<span class="sell">Sell</span>');
  const chg = v => `<span class="chg ${v.trim().startsWith("-") ? "down" : "up"}">${esc(v)}</span>`;

  /* ---------- greeting (visitor's local time) ---------- */
  const greetingFor = h => (h >= 5 && h < 12 ? "Good morning." : h >= 12 && h < 18 ? "Good afternoon." : "Good evening.");
  const greetEl = $("[data-greeting]");
  if (greetEl) greetEl.textContent = greetingFor(new Date().getHours());

  /* ---------- New York clock + NYSE regular session ---------- */
  // Full-day NYSE closures (regular session) — keeps the status honest on holidays.
  const HOLIDAYS = new Set([
    "2025-01-01", "2025-01-09", "2025-01-20", "2025-02-17", "2025-04-18", "2025-05-26", "2025-06-19", "2025-07-04", "2025-09-01", "2025-11-27", "2025-12-25",
    "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
    "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24"
  ]);
  // 1:00 PM early closes.
  const EARLY = new Set(["2025-07-03", "2025-11-28", "2025-12-24", "2026-11-27", "2026-12-24", "2027-11-26"]);

  const nyParts = date => {
    const parts = {};
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).formatToParts(date).forEach(p => { parts[p.type] = p.value; });
    return parts;
  };
  const dateFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: true });

  function marketOpen(now) {
    const p = nyParts(now);
    if (p.weekday === "Sat" || p.weekday === "Sun") return false;
    const key = `${p.year}-${p.month}-${p.day}`;
    if (HOLIDAYS.has(key)) return false;
    const mins = (+p.hour % 24) * 60 + +p.minute;
    const close = EARLY.has(key) ? 13 * 60 : 16 * 60;
    return mins >= 9 * 60 + 30 && mins < close;
  }

  const statusEl = $("[data-market-status]"), labelEl = $("[data-market-label]");
  const clockEl = $("[data-clock]"), clockDate = $("[data-clock-date]"), clockTime = $("[data-clock-time]");
  function tick() {
    const now = new Date();
    let open = false;
    try {
      open = marketOpen(now);
      if (clockDate) clockDate.textContent = dateFmt.format(now);
      if (clockTime) clockTime.textContent = timeFmt.format(now) + " ET";
      if (clockEl) clockEl.setAttribute("datetime", now.toISOString());
    } catch (_) { /* Intl time zones unavailable: keep the static text */ }
    if (statusEl) {
      statusEl.classList.toggle("is-closed", !open);
      if (labelEl) labelEl.textContent = open ? "Markets open" : "Markets closed";
      const dot = statusEl.querySelector(".dot");
      if (dot) dot.classList.toggle("dot--live", open);
    }
    // Keep the greeting in step with the visitor's clock (rebuild the split words in place).
    if (greetEl && greetEl.dataset.splitDone) {
      const next = greetingFor(now.getHours());
      if (greetEl.textContent.replace(/\s+/g, " ").trim() !== next) {
        greetEl.textContent = next;
        delete greetEl.dataset.splitDone;
        if (I.observe) I.observe(greetEl.parentElement);
      }
    }
  }
  tick();
  setInterval(tick, 30000);

  /* ---------- index card sparklines ---------- */
  $$("[data-spark]").forEach((host, i) => {
    host.innerHTML = spark(CARD_SEEDS[host.dataset.spark] || "sp" + i, { width: 128, height: 66, color: "var(--green-chart)", n: 24, stroke: 1.8, drift: 1.1, vol: 2.6 });
    const svg = host.querySelector("svg");
    const card = host.closest("[data-delay]");
    if (svg && card) svg.dataset.delay = String(parseFloat(card.dataset.delay || "0") + 260);
  });

  /* ---------- table rows ---------- */
  function rowDelay(panel, i, step = 70, lead = 300) {
    const base = parseFloat((panel && panel.dataset.delay) || "0");
    return secs(base + lead + i * step);
  }

  const insiderBody = $('[data-rows="insider"]');
  const insiderPanel = insiderBody && insiderBody.closest("[data-reveal]");
  if (insiderBody) {
    insiderBody.innerHTML = INSIDER.map((r, i) => `
      <tr class="row-in" data-type="${r.type}" style="--delay:${rowDelay(insiderPanel, i)}">
        <td class="dash-muted">${esc(r.time)}</td>
        <td><span class="person">${mono(r.name)}<span class="person__name">${esc(r.name)}</span></span></td>
        <td class="c"><a class="ticker" href="${company(r.ticker)}">${esc(r.ticker)}</a></td>
        <td class="c">${txLabel(r.type)}</td>
        <td class="num">${esc(r.value)}</td>
      </tr>`).join("");
  }

  const watchBody = $('[data-rows="watch"]');
  const watchPanel = watchBody && watchBody.closest("[data-reveal]");
  if (watchBody) {
    watchBody.innerHTML = WATCH.map((r, i) => `
      <tr class="row-in is-link" data-href="${company(r.ticker)}" style="--delay:${rowDelay(watchPanel, i)}">
        <td><a class="sym dash-sym" href="${company(r.ticker)}" aria-label="${r.ticker}, view company">${logo(r.ticker, 26)}<span>${esc(r.ticker)}</span></a></td>
        <td class="dash-price">${esc(r.price)}</td>
        <td class="c">${chg(r.d)}</td>
        <td class="c">${chg(r.w)}</td>
        <td class="c">${chg(r.m)}</td>
        <td class="c dash-spark-cell">${spark(r.seed, { width: 90, height: 40, color: r.red ? "var(--red-chart)" : "var(--green-chart)", n: 20, stroke: 1.6, drift: 1.1, vol: 2.5 })}</td>
      </tr>`).join("");
  }

  const filingsBody = $('[data-rows="filings"]');
  const filingsPanel = filingsBody && filingsBody.closest("[data-reveal]");
  if (filingsBody) {
    filingsBody.innerHTML = FILINGS.map((r, i) => `
      <tr class="row-in is-link" data-href="filing.html" style="--delay:${rowDelay(filingsPanel, i, 60)}">
        <td><a class="sym dash-sym" href="filing.html" aria-label="${r.ticker} Form ${r.form}, filed ${r.date}">${logo(r.ticker, 25)}<span>${esc(r.ticker)}</span></a></td>
        <td class="c dash-muted">${esc(r.form)}</td>
        <td class="dash-muted">${esc(r.date)}</td>
      </tr>`).join("");
  }

  const politicalBody = $('[data-rows="political"]');
  const politicalPanel = politicalBody && politicalBody.closest("[data-reveal]");
  if (politicalBody) {
    politicalBody.innerHTML = POLITICAL.map((r, i) => `
      <tr class="row-in" style="--delay:${rowDelay(politicalPanel, i, 70, 260)}">
        <td><span class="person">${mono(r.name)}<span class="person__name">${esc(r.name)}</span></span></td>
        <td><a class="ticker" href="${company(r.ticker)}">${esc(r.ticker)}</a></td>
        <td>${txLabel(r.type)}</td>
        <td class="dash-muted">${esc(r.date)}</td>
      </tr>`).join("");
  }

  // Sparklines in rows draw together with their row's entrance.
  $$(".dash-spark-cell svg").forEach(svg => {
    const tr = svg.closest("tr");
    const d = tr ? parseFloat(tr.style.getPropertyValue("--delay")) * 1000 : 0;
    svg.dataset.delay = String(Math.round(d + 120));
  });

  /* ---------- panels that start below the fold reveal promptly when scrolled to ----------
     (the long on-load stagger only makes sense for what is visible at first paint) */
  (function rebaseOffscreen() {
    const vh = window.innerHeight || document.documentElement.clientHeight;
    $$(".dash-grid [data-reveal]").forEach(panel => {
      const r = panel.getBoundingClientRect();
      if (r.top < vh * 0.9) return;
      const base = Math.round((r.left / Math.max(1, window.innerWidth)) * 240);
      panel.dataset.delay = String(base);
      $$(".row-in", panel).forEach((tr, i) => tr.style.setProperty("--delay", secs(base + 220 + i * 60)));
      $$(".dash-spark-cell svg", panel).forEach(svg => {
        const tr = svg.closest("tr");
        svg.dataset.delay = String(Math.round(parseFloat(tr.style.getPropertyValue("--delay")) * 1000 + 120));
      });
    });
  })();

  /* ---------- whole-row links (watchlist, filings) ---------- */
  $$("tbody").forEach(body => {
    const go = (e, newTab) => {
      if (e.target.closest("a,button")) return;
      const tr = e.target.closest("tr[data-href]");
      if (!tr) return;
      if (String(window.getSelection && window.getSelection()).trim()) return;
      if (newTab) window.open(tr.dataset.href, "_blank", "noopener");
      else location.href = tr.dataset.href;
    };
    body.addEventListener("click", e => go(e, e.metaKey || e.ctrlKey));
    body.addEventListener("auxclick", e => { if (e.button === 1) go(e, true); });
  });

  /* ---------- horizontal scroll hint for tables on narrow screens ---------- */
  $$(".dash-body.table-scroll").forEach(el => {
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      el.classList.toggle("is-scrollable", max > 2);
      el.classList.toggle("at-start", el.scrollLeft <= 2);
      el.classList.toggle("at-end", el.scrollLeft >= max - 2);
    };
    el.addEventListener("scroll", update, { passive: true });
    if ("ResizeObserver" in window) new ResizeObserver(update).observe(el);
    else window.addEventListener("resize", update);
    update();
  });

  /* ---------- Buys / Sells filter with FLIP row motion ---------- */
  const filterGroup = $(".dash-insider [data-segmented]");
  const statusLive = $("[data-filter-status]");
  const tabpanel = $("#ia-panel");
  let filterToken = 0;

  function applyFilter(value) {
    if (!insiderBody) return;
    const token = ++filterToken;
    const rows = $$("tr", insiderBody);
    const want = r => value === "all" || (value === "buys" ? r.dataset.type === "buy" : r.dataset.type === "sell");
    const shown = rows.filter(want);
    if (statusLive) {
      const kind = value === "all" ? "transactions" : value === "buys" ? "buys" : "sells";
      statusLive.textContent = `Showing ${shown.length} ${kind}`;
    }
    rows.forEach(r => r.getAnimations && r.getAnimations().forEach(a => a.cancel()));

    if (reduce || !Element.prototype.animate) {
      rows.forEach(r => { r.hidden = !want(r); });
      return;
    }

    // Hold the scroll container's height while rows travel so moving rows are never clipped.
    if (tabpanel) {
      tabpanel.style.minHeight = tabpanel.offsetHeight + "px";
      clearTimeout(tabpanel._release);
      tabpanel._release = setTimeout(() => { if (token === filterToken) tabpanel.style.minHeight = ""; }, 1100);
    }
    const visibleBefore = rows.filter(r => !r.hidden);
    const leaving = visibleBefore.filter(r => !want(r));
    const firstTop = new Map(visibleBefore.map(r => [r, r.getBoundingClientRect().top]));

    const swap = () => {
      if (token !== filterToken) return;
      rows.forEach(r => { r.hidden = !want(r); });
      shown.forEach((r, i) => {
        const before = firstTop.get(r);
        if (before === undefined) {
          // entering row: rise in, staggered
          r.animate([{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }],
            { duration: 520, delay: 40 + i * 55, easing: "cubic-bezier(.16,1,.3,1)", fill: "backwards" });
        } else {
          const dy = before - r.getBoundingClientRect().top;
          if (Math.abs(dy) > 0.5) {
            r.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }],
              { duration: 620, easing: "cubic-bezier(.16,1,.3,1)" });
          }
        }
      });
    };

    if (leaving.length) {
      const anims = leaving.map(r => r.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateX(-14px)" }],
        { duration: 220, easing: "cubic-bezier(.65,0,.35,1)", fill: "forwards" }));
      Promise.all(anims.map(a => a.finished.catch(() => null))).then(() => {
        if (token !== filterToken) return;
        anims.forEach(a => a.cancel());
        swap();
      });
    } else {
      swap();
    }
  }

  if (filterGroup) {
    const tabs = $$("[role=tab]", filterGroup);
    filterGroup.addEventListener("segment-change", e => {
      const btn = e.detail && e.detail.button;
      tabs.forEach(t => t.setAttribute("tabindex", t === btn ? "0" : "-1"));
      if (tabpanel && btn) tabpanel.setAttribute("aria-labelledby", btn.id);
      applyFilter((e.detail && e.detail.value) || "all");
    });
    // Arrow-key navigation between the filter tabs (ARIA tabs pattern).
    filterGroup.addEventListener("keydown", e => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      let n = -1;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") n = (i + 1) % tabs.length;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === "Home") n = 0;
      else if (e.key === "End") n = tabs.length - 1;
      if (n < 0) return;
      e.preventDefault();
      tabs[n].focus();
      tabs[n].click();
    });
  }

  /* ---------- in-page header links glide to their panel ---------- */
  const here = location.pathname.split("/").pop() || "dashboard.html";
  function flash(target) {
    if (reduce || !target.animate) return;
    const el = target.classList.contains("panel") ? target : null;
    if (!el) return;
    el.animate([{ boxShadow: "0 0 0 0 rgba(18,20,23,0)" }, { boxShadow: "0 0 0 3px rgba(18,20,23,.12)" }, { boxShadow: "0 0 0 0 rgba(18,20,23,0)" }],
      { duration: 1400, delay: 450, easing: "ease-out" });
  }
  // Arriving with a hash (e.g. from "Political Trades" in the header on another page): the browser
  // aligns the target while its entrance transform is still applied, so settle it on layout position.
  function alignHash() {
    if (location.hash.length < 2) return;
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (!target || !target.closest(".dash")) return;
    let y = 0;
    for (let el = target; el; el = el.offsetParent) y += el.offsetTop;
    window.scrollTo(0, Math.max(0, y - 84));
  }
  window.addEventListener("load", () => requestAnimationFrame(alignHash), { once: true });

  document.addEventListener("click", e => {
    const a = e.target.closest("a[href*='#']");
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const url = new URL(a.getAttribute("href"), location.href);
    const page = url.pathname.split("/").pop() || "dashboard.html";
    if (page !== here || !url.hash || url.hash.length < 2) return;
    const target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
    if (!target) return;
    e.preventDefault();
    if (I.scrollTo) I.scrollTo(target);
    else target.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
    history.replaceState(null, "", url.hash);
    flash(target);
  });
})();
