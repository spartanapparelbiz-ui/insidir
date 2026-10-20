/* Signed-in product shell: header injection, nav indicator, search,
   user menu, and small rendering helpers shared by the app pages
   (sparklines, area charts, monogram avatars, brand logos, API calls).

   Paywall: every product page needs a session and an active subscription. The
   server redirects page requests; this file covers what happens while a page is
   open. Any same-origin /v1 response of 401 (session ended) sends the browser to
   signin.html?next=<this page>, and a 402 (no active subscription) to
   subscribe.html?next=<this page>, whether the request came from Insidir.api() or
   from a page script's own fetch(). Account pages (billing, account) stay put on
   402: they exist to fix the subscription. */
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const NS = "http://www.w3.org/2000/svg";

  /* ---------- paywall: 401 → sign in, 402 → subscribe ---------- */
  const GATED_PAGES = ["dashboard", "research", "explore", "company", "filings", "filing", "people", "person", "watchlist", "portfolio", "alerts", "intelligence"];
  const ACCOUNT_PAGES = ["billing", "account"];
  const OPEN_API = /^\/v1(\/?$|\/auth\/|\/billing\/|\/sources$)/;
  const pageKey = () => (/^\/([a-z]+)(?:\.html)?$/.exec(location.pathname) || [])[1] || "";
  /* next= is only ever a same-origin relative path to a known page (validated again on arrival). */
  const here = () => encodeURIComponent(pageKey() + ".html" + location.search);
  /* "This browser has signed in before" (never a credential: the session cookie is HttpOnly).
     auth.js asks /v1/me on the log in page only when it is set. */
  const HINT = "insidir:signed-in";
  const hint = on => { try { if (on) localStorage.setItem(HINT, "1"); else localStorage.removeItem(HINT); } catch (_) { /* storage unavailable */ } };
  let leaving = false;
  function gate(status) {
    const key = pageKey();
    if (leaving) return;
    if (status === 401) hint(false);
    if (status === 401 && (GATED_PAGES.includes(key) || ACCOUNT_PAGES.includes(key))) {
      leaving = true;
      location.assign("signin.html?next=" + here());
    } else if (status === 402 && GATED_PAGES.includes(key)) {
      leaving = true;
      location.assign("subscribe.html?next=" + here());
    }
  }
  function gatedRequest(input) {
    try {
      const url = new URL(typeof input === "string" ? input : (input && input.url) || String(input), location.href);
      return url.origin === location.origin && url.pathname.startsWith("/v1/") && !OPEN_API.test(url.pathname);
    } catch (_) { return false; }
  }
  if (typeof window.fetch === "function" && !window.fetch.__insidirGate) {
    const nativeFetch = window.fetch.bind(window);
    const gatedFetch = (input, init) => nativeFetch(input, init).then(res => {
      if ((res.status === 401 || res.status === 402) && gatedRequest(input)) gate(res.status);
      return res;
    });
    gatedFetch.__insidirGate = true;
    window.fetch = gatedFetch;
  }

  /* The product's sections, in order of use: what changed (Overview), what to look at (Intelligence), the records
     (Research, Companies, People, Filings), what you follow (Watchlist) and what you are told about (Alerts). */
  const NAV = [
    ["dashboard","Overview","dashboard.html"],
    ["intelligence","Intelligence","intelligence.html"],
    ["research","Research","research.html"],
    ["companies","Companies","explore.html"],
    ["insiders","People","people.html"],
    ["filings","Filings","filings.html"],
    ["watchlist","Watchlist","watchlist.html"],
    ["alerts","Alerts","alerts.html"]
  ];
  const NAV_ICONS = {dashboard:"layers",research:"search",intelligence:"activity",companies:"building",portfolio:"wallet",watchlist:"bookmark",filings:"file-text",insiders:"user-round",alerts:"clock"};
  const navIcon = key => '<span class="v2-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><use href="assets/icons/interface.svg#'+(NAV_ICONS[key]||"file-text")+'"></use></svg></span>';

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
  /* Neutral blends of paper and ink only (the V13 theme also paints every monogram on --hf-raise): no warm tints. */
  const TONES = ["#30302e", "#363633", "#3c3b38", "#434240", "#474643", "#4d4c48", "#53524e", "#595854"];
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
  async function api(path, { method = "GET", body, signal } = {}) {
    const res = await fetch(path, {
      method, credentials: "same-origin", signal,
      headers: body ? { "Content-Type": "application/json", Accept: "application/json" } : { Accept: "application/json" },
      body: body ? JSON.stringify(body) : undefined
    });
    let data = null;
    try { data = await res.json(); } catch (_) { /* non-JSON */ }
    // 401 and 402 have already sent the browser to signin.html / subscribe.html (see gate above).
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
      <button class="icon-btn app-menu-btn" type="button" data-hf-atom aria-label="Open navigation" aria-expanded="false" aria-controls="app-mobile-nav">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
      </button>
      <a class="logo" href="dashboard.html" aria-label="insidir. dashboard">insidir<span class="v13-dot" aria-hidden="true">.</span></a>
      <nav class="app-nav" aria-label="Product">
        ${NAV.map(([key, label, href]) => `<a href="${href}"${key === active ? ' aria-current="page"' : ""}>${navIcon(key)}${label}${newMark(key)}</a>`).join("")}
        <span class="app-nav__indicator" aria-hidden="true"></span>
      </nav>
      <form class="app-search" role="search" action="company.html">
        ${icons.search}
        <label class="sr-only" for="app-search-input">Search tickers, companies, or people</label>
        <input id="app-search-input" name="ticker" type="search" autocomplete="off" spellcheck="false" placeholder="Search companies, people, filings"
          role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="app-search-results">
        <kbd class="app-search__key" aria-hidden="true">Ctrl K</kbd>
        <div class="app-search__results" id="app-search-results" role="listbox" aria-label="Search suggestions" hidden></div>
      </form>
      <a class="icon-btn app-header__bell" href="alerts.html" aria-label="Alerts">${icons.bell}</a>
      <div class="user-menu">
        <button class="user-menu__btn" type="button" aria-expanded="false" aria-controls="user-menu-panel" aria-label="Account menu"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5.5 19.5c.5-4 3-6 6.5-6s6 2 6.5 6"/></svg></button>
        <div class="user-menu__panel" id="user-menu-panel">
          <div class="who"><strong>Account</strong><span data-account-email>Sign in to see your details</span></div>
          <a href="account.html">Account center</a>
          <a href="portfolio.html">Portfolio</a>
          <a href="billing.html">Plan &amp; billing</a>
          <a href="signin.html" data-account-signin hidden>Sign in</a>
          <a href="alerts.html">Alert settings</a>
          <a href="privacy.html">Privacy</a>
          <button type="button" data-signout>Sign out</button>
        </div>
      </div>
    </div>
    <nav class="app-mobile-nav" id="app-mobile-nav" aria-label="Product">
      ${NAV.map(([key, label, href]) => `<a href="${href}"${key === active ? ' aria-current="page"' : ""}>${navIcon(key)}${label}${newMark(key)}</a>`).join("")}
    </nav>`;

    api("/v1/me").then(data => {
      if (!data.user || !data.user.email) return;
      hint(true);
      const email = String(data.user.email);
      host.querySelector("[data-account-email]").textContent = email;
      const initial = email.trim().charAt(0).toUpperCase();
      const avatar = host.querySelector(".user-menu__btn");
      if (avatar && /[A-Z0-9]/.test(initial)) { avatar.innerHTML = `<span class="user-menu__initial" aria-hidden="true">${initial}</span>`; avatar.setAttribute("aria-label", "Account menu for " + email); }
    }).catch(error => {
      // Only a visitor the engine does not recognise is offered "Sign in" (a member never sees it flash).
      const signin = host.querySelector("[data-account-signin]");
      if (signin && error && error.status === 401) signin.hidden = false;
    });
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
    // Close the menu only when the page grows wide enough to show the navigation again (v29-app.css: 1200px). A plain
    // resize is not enough: iOS fires one whenever the address bar hides while scrolling.
    const wide = window.matchMedia("(min-width: 1200px)");
    (wide.addEventListener ? wide.addEventListener("change", e => { if (e.matches) setMenu(false); }) : wide.addListener(e => { if (e.matches) setMenu(false); }));

    const nav = host.querySelector(".app-nav"), ind = host.querySelector(".app-nav__indicator");
    const current = nav.querySelector('[aria-current="page"]');
    // The sliding indicator is hidden by the V13 theme (an underline marks the page instead): when it is not drawn,
    // nothing reads link positions on hover or resize.
    let drawn = null;
    const shown = () => drawn === null ? (drawn = getComputedStyle(ind).display !== "none") : drawn;
    const moveTo = a => {
      if (!shown()) return;
      if (!a) { ind.style.width = "0px"; return; }
      ind.style.width = a.offsetWidth + "px";
      ind.style.transform = `translateX(${a.offsetLeft}px)`;
    };
    requestAnimationFrame(() => { if (!shown()) return; ind.style.transition = "none"; moveTo(current); requestAnimationFrame(() => { ind.style.transition = ""; }); });
    nav.querySelectorAll("a").forEach(a => a.addEventListener("pointerenter", () => moveTo(a)));
    nav.addEventListener("pointerleave", () => moveTo(current));
    window.addEventListener("resize", () => { drawn = null; moveTo(current); }, { passive: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => moveTo(current));

    const form = host.querySelector(".app-search"), input = form.querySelector("input"), list = form.querySelector(".app-search__results");
    // The full hint where the field has room for all of it (13px mono: 7.8px a character); one word on phones, where the
    // field shares the bar with the logo and menu, and wherever the field is narrower than the hint, so it is never cut.
    const narrow = window.matchMedia ? window.matchMedia("(max-width: 759px)") : null;
    const HINT = "Search companies, people, filings";
    const placeholder = () => {
      const cs = getComputedStyle(input), room = input.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const want = (narrow && narrow.matches) || room < HINT.length * 7.8 + 2 ? "Search" : HINT;
      if (input.placeholder !== want) input.placeholder = want;
    };
    placeholder();
    if (narrow) (narrow.addEventListener ? narrow.addEventListener("change", placeholder) : narrow.addListener(placeholder));
    if (window.ResizeObserver) new ResizeObserver(placeholder).observe(input);
    const tickerPattern = /^[A-Z0-9][A-Z0-9.-]{0,14}$/;
    const escapeHTML = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    let suggestions = [], activeOption = -1, searchSeq = 0, searchTimer = 0;
    const closeList = () => { list.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); activeOption = -1; };
    const highlight = index => {
      activeOption = index;
      list.querySelectorAll("[role=option]").forEach((el, i) => el.setAttribute("aria-selected", String(i === index)));
      if (index >= 0) input.setAttribute("aria-activedescendant", "app-search-option-" + index); else input.removeAttribute("aria-activedescendant");
    };
    /* Each result carries its identity tile from entity-media.js (a company's logo, a person's headshot, or the issuer's
       logo standing in for one; initials only when neither exists), aria-hidden inside the option, so no link is nested.
       Pages without the helper (account, billing) keep the text badge. */
    const tileFor = s => {
      const media = window.InsidirMedia;
      if (!media) return "";
      try { return s.kind === "person" ? media.portrait(s.name, s.ticker || "", "sm", { cik: s.cik, issuerCik: s.issuerCik }) : media.logo(s.ticker, "sm", { name: s.label }); } catch { return ""; }
    };
    const renderList = q => {
      if (!suggestions.length) {
        list.innerHTML = `<p class="app-search__empty">No matching imported companies or reporting people. Press Enter to search the people directory.</p>`;
      } else {
        list.innerHTML = suggestions.map((s, i) => {
          const tile = tileFor(s);
          const lead = tile || `<span class="app-search__badge app-search__badge--${s.kind}">${escapeHTML(s.kind === "person" ? "Person" : s.ticker)}</span>`;
          const meta = tile && s.kind === "company" ? s.ticker + " · " + (s.meta || "Company") : s.meta || "";
          return `<a id="app-search-option-${i}" role="option" aria-selected="false" href="${escapeHTML(s.href)}" class="app-search__option${tile ? " app-search__option--tile" : ""}">${lead}
          <span class="app-search__label">${escapeHTML(s.label)}</span><span class="app-search__meta">${escapeHTML(meta)}</span></a>`;
        }).join("");
        try { window.InsidirMedia?.hydrate?.(list); } catch { /* a tile that cannot resolve keeps its initials */ }
      }
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
    };
    // Each keystroke cancels the requests of the one before it, so only the latest query costs the server anything.
    let searchAbort = null;
    const lookup = async q => {
      const seq = ++searchSeq;
      if (searchAbort) searchAbort.abort();
      const ctrl = searchAbort = "AbortController" in window ? new AbortController() : null;
      const signal = ctrl ? ctrl.signal : undefined;
      const [companies, people] = await Promise.allSettled([
        api("/v1/search?q=" + encodeURIComponent(q), { signal }),
        q.length >= 3 ? api("/v1/insiders?q=" + encodeURIComponent(q), { signal }) : Promise.resolve({ items: [] })
      ]);
      if (seq !== searchSeq || input.value.trim() !== q) return;
      form.removeAttribute("aria-busy");
      if (companies.status === "rejected" && people.status === "rejected") { suggestions=[]; list.innerHTML = '<p class="app-search__empty">Search services are unavailable. Try again shortly.</p>'; list.hidden=false; input.setAttribute("aria-expanded","true"); return; }
      if (companies.status === "rejected" && companies.reason && companies.reason.status === 402) {
        suggestions = [];
        list.innerHTML = '<p class="app-search__empty">Search needs an active subscription. <a href="subscribe.html">Subscribe</a></p>';
        list.hidden = false;
        input.setAttribute("aria-expanded", "true");
        return;
      }
      suggestions = [
        ...(companies.status === "fulfilled" ? companies.value.items || [] : []).slice(0, 7).map(c => ({ kind: "company", ticker: c.ticker, label: c.name, meta: "Company", href: "company.html?ticker=" + encodeURIComponent(c.ticker) })),
        ...(people.status === "fulfilled" ? people.value.items || [] : []).slice(0, 3).map(p => {
          const cik = /^\d{1,12}$/.test(String(p.owner_cik || "")) && /[1-9]/.test(String(p.owner_cik)) ? String(p.owner_cik) : "";
          const issuerCik = /^\d{1,12}$/.test(String(p.issuer_cik || "")) ? String(p.issuer_cik) : "";
          // A person opens their own file (person.html?cik=, the owner CIK without leading zeros); with no CIK, the directory search.
          return { kind: "person", name: p.owner_name, cik, issuerCik, ticker: p.ticker || "", label: window.InsidirMedia?.displayName ? window.InsidirMedia.displayName(p.owner_name) : p.owner_name, meta: p.ticker ? "Insider · " + p.ticker : "Insider",
            href: cik ? "person.html?cik=" + cik.replace(/^0+/, "") : "people.html?q=" + encodeURIComponent(String(p.owner_name || "").slice(0, 80)) + "#v10-directory" };
        })
      ];
      renderList(q);
    };
    input.addEventListener("input", () => {
      input.setCustomValidity("");
      const q = input.value.trim();
      clearTimeout(searchTimer);
      if (!q) { suggestions = []; form.removeAttribute("aria-busy"); if (searchAbort) searchAbort.abort(); closeList(); return; }
      // Feedback on the keystroke itself; the request waits for a 140ms pause in typing.
      form.setAttribute("aria-busy", "true");
      searchTimer = setTimeout(() => lookup(q).catch(() => {}), 140);
    });
    input.addEventListener("keydown", e => {
      if (list.hidden || !suggestions.length) { if (e.key === "Escape") { closeList(); input.blur(); } return; }
      if (e.key === "ArrowDown") { e.preventDefault(); highlight((activeOption + 1) % suggestions.length); }
      else if (e.key === "ArrowUp") { e.preventDefault(); highlight(activeOption <= 0 ? suggestions.length - 1 : activeOption - 1); }
      else if (e.key === "Escape") { closeList(); }
    });
    input.addEventListener("focus", () => { if (input.value.trim() && suggestions.length) renderList(input.value.trim()); });
    list.addEventListener("pointermove", e => { const opt = e.target.closest("[role=option]"); if (opt) highlight([...list.children].indexOf(opt)); });
    document.addEventListener("click", e => { if (!form.contains(e.target)) closeList(); });
    form.addEventListener("submit", e => {
      e.preventDefault();
      const q = input.value.trim();
      if (!q) return;
      const chosen = suggestions[activeOption >= 0 ? activeOption : -1];
      if (chosen) { location.href = chosen.href; return; }
      const upper = q.toUpperCase();
      const exact = suggestions.find(s => s.kind === "company" && s.ticker === upper);
      if (exact) { location.href = exact.href; return; }
      if (suggestions[0]) { location.href = suggestions[0].href; return; }
      location.href = "people.html?q=" + encodeURIComponent(q.slice(0,80)) + "#v10-directory";
    });
    document.addEventListener("keydown", e => {
      const typing = /input|textarea|select/i.test(document.activeElement.tagName) || document.activeElement.isContentEditable;
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) { e.preventDefault(); input.focus(); input.select(); return; }
      if (e.key === "/" && !typing) { e.preventDefault(); input.focus(); }
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
      hint(false);
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

  /* What's new: a small "New" mark on the Intelligence link until the member has opened Intelligence (or until the
     notice expires). It sits inside the header's own height, so the page never moves to make room for it. */
  const WHATS_NEW = Object.freeze({ key: "insidir:new:intelligence-2026-10", nav: "intelligence", until: Date.parse("2026-10-27T00:00:00Z") });
  function newMark(key) {
    if (key !== WHATS_NEW.nav || Date.now() >= WHATS_NEW.until) return "";
    if (document.querySelector('[data-app-header][data-active="' + WHATS_NEW.nav + '"]')) { try { localStorage.setItem(WHATS_NEW.key, "1"); } catch {} return ""; }
    try { if (localStorage.getItem(WHATS_NEW.key) === "1") return ""; } catch {}
    return '<span class="app-nav__new" aria-hidden="true" title="New: briefings, research questions and 13F holdings"></span><span class="sr-only"> (new)</span>';
  }
  function init() {
    renderHeader();
    segmented(document);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.Insidir = Object.assign(window.Insidir || {}, { icons, logo, monogram, series, sparkline, areaChart, api, segmented, reduceMotion: reduce });
})();
