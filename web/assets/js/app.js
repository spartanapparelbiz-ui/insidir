/* Signed-in product shell: header injection, nav indicator, search,
   user menu, and small rendering helpers shared by the app pages
   (sparklines, area charts, monogram avatars, brand logos, API calls). */
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const NS = "http://www.w3.org/2000/svg";

  const NAV = [
    ["dashboard", "Dashboard", "dashboard.html"],
    ["research", "Research", "research.html"],
    ["companies", "Companies", "company.html?ticker=AAPL"],
    ["insiders", "Insider Trades", "dashboard.html#insider-activity"],
    ["alerts", "Alerts", "alerts.html"]
  ];

  const icons = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
    arrow: '<svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>'
  };

  /* ---------- brand logos ---------- */
  const LOGOS = { AAPL: "apple", NVDA: "nvidia", MSFT: "microsoft", TSLA: "tesla", META: "meta", GOOGL: "google", ABNB: "airbnb" };
  function logo(ticker, size = 22) {
    const name = LOGOS[ticker];
    if (!name) return `<span class="ticker-logo ticker-logo--text" style="width:${size}px;height:${size}px">${ticker.slice(0, 1)}</span>`;
    return `<img class="ticker-logo" src="assets/icons/${name}.svg" width="${size}" height="${size}" alt="" loading="lazy">`;
  }

  /* ---------- monogram avatars ---------- */
  const TONES = ["#6f5b44", "#4d5a66", "#5d6b57", "#7a5148", "#56506e", "#6a6250", "#45606a", "#7d6a3f"];
  function monogram(name, cls = "") {
    const parts = String(name).trim().split(/\s+/);
    const initials = ((parts[0] || "")[0] || "") + ((parts.length > 1 ? parts[parts.length - 1] : "")[0] || "");
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return `<span class="monogram ${cls}" style="--mg:${TONES[h % TONES.length]}" aria-hidden="true">${initials.toUpperCase()}</span>`;
  }

  /* ---------- deterministic market-like series ---------- */
  function series(seed, n = 60, { start = 100, drift = 0.6, vol = 1.6, trend = 1 } = {}) {
    let s = 0;
    for (const ch of String(seed)) s = (s * 131 + ch.charCodeAt(0)) >>> 0;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const out = [start];
    for (let i = 1; i < n; i++) {
      const shock = (rnd() - 0.5) * 2 * vol + (rnd() - 0.5) * vol;
      out.push(Math.max(1, out[i - 1] + drift * trend + shock));
    }
    return out;
  }

  /* ---------- sparkline svg ---------- */
  let gid = 0;
  function sparkline(values, { width = 120, height = 36, color, fill = true, stroke = 1.6 } = {}) {
    const up = values[values.length - 1] >= values[0];
    const c = color || (up ? "var(--green-chart)" : "var(--red-chart)");
    const min = Math.min(...values), max = Math.max(...values);
    const pad = stroke + 1;
    const x = i => (i / (values.length - 1)) * (width - pad * 2) + pad;
    const y = v => height - pad - ((v - min) / (max - min || 1)) * (height - pad * 2);
    const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("");
    const id = "spk" + (++gid);
    const area = fill ? `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c}" stop-opacity=".22"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient></defs>
      <path class="area" d="${d}L${x(values.length - 1).toFixed(1)} ${height}L${x(0).toFixed(1)} ${height}Z" fill="url(#${id})"/>` : "";
    return `<svg class="sparkline" data-draw viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" preserveAspectRatio="none" aria-hidden="true">${area}
      <path class="line" d="${d}" fill="none" stroke="${c}" stroke-width="${stroke}" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
  }

  /* ---------- interactive area chart ---------- */
  function areaChart(host, values, { labels = [], ticks = [], color = "var(--green-chart)", format = v => v.toFixed(2) } = {}) {
    host.innerHTML = "";
    const W = host.clientWidth || 640, H = host.clientHeight || 300;
    const padL = 8, padR = 46, padT = 14, padB = 30;
    const min = Math.min(...values, ...(ticks.length ? [Math.min(...ticks)] : []));
    const max = Math.max(...values, ...(ticks.length ? [Math.max(...ticks)] : []));
    const x = i => padL + (i / (values.length - 1)) * (W - padL - padR);
    const y = v => padT + (1 - (v - min) / (max - min || 1)) * (H - padT - padB);
    const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("");
    const id = "area" + (++gid);
    const grid = ticks.map(t => `<line x1="${padL}" x2="${W - padR}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${W - padR + 12}" y="${y(t) + 4}" class="axis">${t}</text>`).join("");
    const vgrid = labels.map((l, i) => {
      const xi = padL + (i / (labels.length - 1 || 1)) * (W - padL - padR);
      return `<line x1="${xi}" x2="${xi}" y1="${padT}" y2="${H - padB}" class="grid grid--v"/><text x="${xi}" y="${H - 8}" text-anchor="middle" class="axis">${l}</text>`;
    }).join("");
    host.insertAdjacentHTML("beforeend", `<svg class="area-chart" data-draw viewBox="0 0 ${W} ${H}" width="100%" height="100%" role="img" aria-label="Price chart">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".28"/><stop offset="1" stop-color="${color}" stop-opacity=".02"/></linearGradient></defs>
      ${vgrid}${grid}
      <path class="area" d="${d}L${x(values.length - 1)} ${H - padB}L${x(0)} ${H - padB}Z" fill="url(#${id})"/>
      <path class="line" d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
      <g class="crosshair" opacity="0"><line class="crosshair__line" y1="${padT}" y2="${H - padB}"/><circle r="5" class="crosshair__dot"/></g>
    </svg><div class="chart-tip" hidden></div>`);
    const svg = host.querySelector("svg"), cross = svg.querySelector(".crosshair"), tip = host.querySelector(".chart-tip");
    const line = cross.querySelector("line"), dot = cross.querySelector("circle");
    svg.addEventListener("pointermove", e => {
      const r = svg.getBoundingClientRect();
      const px = (e.clientX - r.left) * (W / r.width);
      const i = Math.round(((px - padL) / (W - padL - padR)) * (values.length - 1));
      if (i < 0 || i >= values.length) return;
      const cx = x(i), cy = y(values[i]);
      line.setAttribute("x1", cx); line.setAttribute("x2", cx);
      dot.setAttribute("cx", cx); dot.setAttribute("cy", cy);
      cross.setAttribute("opacity", "1");
      tip.hidden = false;
      tip.textContent = format(values[i], i);
      tip.style.left = (cx / W) * 100 + "%";
      tip.style.top = (cy / H) * 100 + "%";
    });
    svg.addEventListener("pointerleave", () => { cross.setAttribute("opacity", "0"); tip.hidden = true; });
    if (window.Insidir && window.Insidir.observe) window.Insidir.observe(host);
    return svg;
  }

  /* ---------- API (same-origin engine, optional) ---------- */
  async function api(path, { method = "GET", body } = {}) {
    const res = await fetch(path, {
      method, credentials: "same-origin",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    let data = null;
    try { data = await res.json(); } catch (_) { /* non-JSON */ }
    if (!res.ok) throw Object.assign(new Error((data && data.error) || `Request failed (${res.status})`), { status: res.status });
    return data;
  }

  /* ---------- header ---------- */
  function renderHeader() {
    const host = document.querySelector("[data-app-header]");
    if (!host) return;
    const active = host.dataset.active || "";
    host.classList.add("app-header");
    host.innerHTML = `<div class="app-header__inner">
      <button class="icon-btn app-menu-btn" type="button" aria-label="Open navigation" aria-expanded="false" aria-controls="app-mobile-nav">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
      </button>
      <a class="logo" href="dashboard.html" aria-label="insidir. dashboard">insidir.</a>
      <nav class="app-nav" aria-label="Product">
        ${NAV.map(([key, label, href]) => `<a href="${href}"${key === active ? ' aria-current="page"' : ""}>${label}</a>`).join("")}
        <span class="app-nav__indicator" aria-hidden="true"></span>
      </nav>
      <form class="app-search" role="search" action="company.html">
        ${icons.search}
        <label class="sr-only" for="app-search-input">Search companies, insiders, or filings</label>
        <input id="app-search-input" name="ticker" type="search" autocomplete="off" placeholder="Search companies, insiders, or filings..." >
      </form>
      <a class="icon-btn" href="alerts.html" aria-label="Alerts">${icons.bell}</a>
      <div class="user-menu">
        <button class="user-menu__btn" type="button" aria-expanded="false" aria-controls="user-menu-panel" aria-label="Account menu">${monogram("Account", "monogram--lg")}</button>
        <div class="user-menu__panel" id="user-menu-panel">
          <div class="who"><strong>Account</strong><span data-account-email>Sign in to see your details</span></div>
          <a href="billing.html">Plan &amp; billing</a>
          <a href="signin.html" data-account-signin>Sign in</a>
          <a href="alerts.html">Alert settings</a>
          <a href="privacy.html">Privacy</a>
          <button type="button" data-signout>Sign out</button>
        </div>
      </div>
    </div>
    <nav class="app-mobile-nav" id="app-mobile-nav" aria-label="Product">
      ${NAV.map(([key, label, href]) => `<a href="${href}"${key === active ? ' aria-current="page"' : ""}>${label}</a>`).join("")}
    </nav>`;

    api("/v1/me").then(data => {
      if (!data.user || !data.user.email) return;
      const email = String(data.user.email);
      host.querySelector("[data-account-email]").textContent = email;
      const signin = host.querySelector("[data-account-signin]");
      if (signin) signin.hidden = true;
    }).catch(() => {});
    const menuBtn = host.querySelector(".app-menu-btn"), menu = host.querySelector(".app-mobile-nav");
    const setMenu = open => {
      menu.classList.toggle("is-open", open);
      menuBtn.setAttribute("aria-expanded", String(open));
      menuBtn.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    };
    menuBtn.addEventListener("click", e => { e.stopPropagation(); setMenu(!menu.classList.contains("is-open")); });
    menu.querySelectorAll("a").forEach(a => a.addEventListener("click", () => setMenu(false)));
    document.addEventListener("click", e => { if (!menu.contains(e.target)) setMenu(false); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && menu.classList.contains("is-open")) { setMenu(false); menuBtn.focus(); } });
    window.addEventListener("resize", () => { if (innerWidth > 860) setMenu(false); });

    const nav = host.querySelector(".app-nav"), ind = host.querySelector(".app-nav__indicator");
    const current = nav.querySelector('[aria-current="page"]');
    const moveTo = a => {
      if (!a) { ind.style.width = "0px"; return; }
      ind.style.width = a.offsetWidth + "px";
      ind.style.transform = `translateX(${a.offsetLeft}px)`;
    };
    requestAnimationFrame(() => { ind.style.transition = "none"; moveTo(current); requestAnimationFrame(() => { ind.style.transition = ""; }); });
    nav.querySelectorAll("a").forEach(a => a.addEventListener("pointerenter", () => moveTo(a)));
    nav.addEventListener("pointerleave", () => moveTo(current));
    window.addEventListener("resize", () => moveTo(current));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => moveTo(current));

    const form = host.querySelector(".app-search"), input = form.querySelector("input");
    form.addEventListener("submit", e => {
      const q = input.value.trim().toUpperCase();
      if (!q) { e.preventDefault(); return; }
      if (!/^[A-Z.]{1,6}$/.test(q)) { e.preventDefault(); location.href = "filing.html?q=" + encodeURIComponent(input.value.trim()); }
    });
    document.addEventListener("keydown", e => {
      if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); input.focus(); }
    });

    const btn = host.querySelector(".user-menu__btn"), panel = host.querySelector(".user-menu__panel");
    const setOpen = open => { panel.classList.toggle("is-open", open); btn.setAttribute("aria-expanded", String(open)); };
    btn.addEventListener("click", e => { e.stopPropagation(); setOpen(!panel.classList.contains("is-open")); });
    document.addEventListener("click", e => { if (!panel.contains(e.target)) setOpen(false); });
    // Disclosure menu: Escape returns focus to the button; tabbing away closes it.
    document.addEventListener("keydown", e => {
      if (e.key !== "Escape" || !panel.classList.contains("is-open")) return;
      const inside = panel.contains(document.activeElement);
      setOpen(false);
      if (inside) btn.focus();
    });
    host.querySelector(".user-menu").addEventListener("focusout", e => {
      if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setOpen(false);
    });
    host.querySelector("[data-signout]").addEventListener("click", async () => {
      try { await api("/v1/auth/logout", { method: "POST" }); } catch (_) { /* engine not attached */ }
      location.href = "signin.html";
    });
  }

  /* ---------- segmented controls / tabs with sliding thumb ---------- */
  function segmented(scope = document) {
    scope.querySelectorAll("[data-segmented]").forEach(group => {
      if (group.dataset.segBound) return;
      group.dataset.segBound = "1";
      const thumb = document.createElement("span");
      thumb.className = "seg-thumb";
      thumb.setAttribute("aria-hidden", "true");
      group.appendChild(thumb);
      const buttons = [...group.querySelectorAll("[role=tab],button")].filter(b => b !== thumb);
      const place = b => {
        if (!b.offsetWidth) return; // hidden (e.g. inactive tab panel); re-placed when it becomes visible
        thumb.style.width = b.offsetWidth + "px";
        thumb.style.height = b.offsetHeight + "px";
        thumb.style.transform = `translate(${b.offsetLeft}px,${b.offsetTop}px)`;
      };
      const select = b => {
        buttons.forEach(x => { const on = x === b; x.setAttribute("aria-selected", String(on)); x.classList.toggle("is-active", on); });
        place(b);
        group.dispatchEvent(new CustomEvent("segment-change", { detail: { value: b.dataset.value, button: b }, bubbles: true }));
      };
      buttons.forEach(b => b.addEventListener("click", () => select(b)));
      const initial = buttons.find(b => b.getAttribute("aria-selected") === "true" || b.classList.contains("is-active")) || buttons[0];
      requestAnimationFrame(() => { thumb.style.transition = "none"; place(initial); requestAnimationFrame(() => { thumb.style.transition = ""; }); });
      window.addEventListener("resize", () => { const cur = buttons.find(x => x.classList.contains("is-active")) || initial; place(cur); });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { const cur = buttons.find(x => x.classList.contains("is-active")) || initial; place(cur); });
      initial.classList.add("is-active");
      initial.setAttribute("aria-selected", "true");
      if ("ResizeObserver" in window) {
        new ResizeObserver(() => { const cur = buttons.find(x => x.classList.contains("is-active")) || initial; place(cur); }).observe(group);
      }
    });
  }

  function init() {
    renderHeader();
    segmented(document);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.Insidir = Object.assign(window.Insidir || {}, { icons, logo, monogram, series, sparkline, areaChart, api, segmented, reduceMotion: reduce });
})();
