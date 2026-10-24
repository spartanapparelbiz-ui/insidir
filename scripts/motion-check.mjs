/* Insidir site motion check: the page's content holds still, every halftone dot field answers the pointer and a
   click hard and settles back exactly, public pages fade blocks up once as they scroll in, and nothing on any page
   is orange.

   Opens every page in headless Chromium (the /v1 API mocked) and verifies, with a real mouse and wheel:

   At 1440px with a fine pointer (every scroll-reveal block shown at once with InsidirMotion.revealAll()):
     - the motion layer (window.InsidirMotion) and the dot engine (window.InsidirHalftone) are loaded, and every
       page has at least one mounted dot field drawn into a canvas (the footer strip at minimum);
     - up to 40 visible free-standing elements on the first screen are sampled (navigation links, buttons,
       chips, stand-alone links, arrows, index numbers, identity tiles .ins-media, logos: the selector list of
       the old "atoms", topped up with any visible link, button, tab or summary);
     - stillness under scroll: during eight 120px wheel steps the document position of those elements and of up
       to 40 more across the page (rect + scrollY; for elements in a fixed bar the viewport position, in a sticky
       box the position relative to that box) is sampled after every step, and each sample must equal the
       position before the scroll or the one after it has settled (held for 300ms), within 0.5px: nothing lags
       or trails (a layout shift that simply lands is not motion);
     - the dot fields take no scroll: every field canvas is pixel-identical (a word canvas within 0.05%) to its
       at-rest image in the middle and at the end of the wheel steps;
     - landing only: the hero wordmark does not scatter as the page scrolls: its canvas at scrollY 300 and back
       at 0 equals its at-rest image (within 0.05% of its pixels);
     - stillness under the pointer: the mouse sweeps across and next to the sampled elements and across the
       whole screen (sampled after every path, and again a moment later on some), presses and releases a few
       of them (their click events are cancelled, so nothing navigates or opens), and clicks on empty space;
       during all of it and once the pointer has left, every sampled element keeps its box (0.5px) and its
       computed transform, translate, scale and rotate, and up to six of its descendants (arrows, icons, tiles)
       keep their boxes; the page does not scroll; and nothing anywhere ever
       writes --hf-dx / --hf-dy / --hf-s (a MutationObserver watches every style attribute for the whole visit,
       and none is left inline at the end);
     - every plain dot field (data-halftone-field without data-mode="word": the person file's band, the heroes, the
       footer strip, the brief corner; every one shown, scrolled into view; any that cannot be put on screen is
       named in the result) answers: the pointer sweeps across it and its canvas changes (more than 0.05% of
       its pixels); the pointer leaves to the point on screen farthest from it (and out of the window when even
       that is within the field's reach), the field goes to sleep within 4s (InsidirHalftone's own .moving,
       watched by an in-page frame loop) and its canvas is then pixel-identical to its at-rest image; a click on
       it rings through it (within the ring's life, more than 0.05% of the pixels farther from the click than
       the press's reach change, so the press itself cannot pass for a ring) and it is asleep and
       pixel-identical again within 4s;
     - every word field (the landing wordmark, data-halftone-hero; the 404 numerals) answers hard: its canvas
       changes by more than 0.2% while the pointer moves over it, and within 4s of the pointer leaving it is
       asleep and back at its at-rest image (within 0.05%);
     - every plain dot field also goes to sleep within 4s once the pointer comes to rest on it, and within 4s of its
       ring ending while a press is held there, so a resting pointer never keeps a field repainting;
     - reduced motion turned on after load (page.emulateMedia): up to two dot canvases stay pixel-identical under a
       sweep and a click;
     - hover moves nothing: up to 4 links/buttons on the first screen and 2 halfway down are hovered one at a
       time; after 400ms each keeps its box and transform, and so do its children (arrows .v13-arrow and the
       rest) and the ::before/::after of each;
     - while the pointer rests on an element and just after a click, a screenshot has no orange pixels
       (clusters of r > 110, r − g > 35, g − b > 15, r − b > 70, captured with text glyphs transparent so
       subpixel text fringes can't count; real photographs in <img> ignored);
     - no page errors and no console errors.

   Scroll reveal, in a fresh visit WITHOUT revealAll (at 1440px and on a 390px phone):
     - public pages (neither body.app-body nor body.v6-app): every block marked data-hf-reveal, each child of a data-hf-reveal-group
       and each footer column that is below the fold when v13-motion.js first sees it waits (.hf-pending,
       opacity 0, held at most 16px off its place); scrolling down a viewport at a time, every block above 90%
       of the viewport is shown within 1.2s of reaching it (no .hf-pending; one that waited is back at opacity 1
       with its translate/transform offset at 0); the blocks fade up through .hf-revealing; at the bottom
       nothing is pending or mid-reveal; a page with no such block below the fold reports "n/a";
     - product pages (body.app-body or body.v6-app): nothing is ever held back: InsidirMotion.pending is 0 and no element has
       .hf-pending, at load, after scrolling to the bottom, or at any moment in between (watched by a
       MutationObserver from document start).

   With prefers-reduced-motion: nothing waits to be revealed (pending 0, no .hf-pending/.hf-revealing, at load
   or after scrolling), and the dot canvases (up to four per page, words and plain fields) do not change under
   the pointer or a press.

   Phones (390px, touch) load every page without horizontal overflow or script errors, with a mounted dot field.

   Usage: node scripts/motion-check.mjs [--pages index,dashboard,...] [--no-phone-reveal]
            [--inject-css "<css>"] [--inject-js "<js>"]
   --inject-css adds rules to the insidir-v13 layer of every page and --inject-js runs a script at
   document start in every visit; both exist only to prove that the check fails when motion breaks.
   Exits non-zero on any failure and prints every check it ran. */
import { createServer } from "node:http";
import { inflateSync } from "node:zlib";
import { serveStatic } from "../src/web.mjs";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf("--" + name); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback; };
const flag = name => args.includes("--" + name);
const INJECT_CSS = opt("inject-css", ""), INJECT_JS = opt("inject-js", "");
const ALL = [
  ["index", "/"], ["signin", "/signin.html"], ["signup", "/signup.html"], ["dashboard", "/dashboard.html"],
  ["research", "/research.html?ticker=AAPL"], ["explore", "/explore.html"], ["filings", "/filings.html"], ["filing", "/filing.html?accession=000032019326000001"],
  ["watchlist", "/watchlist.html"], ["portfolio", "/portfolio.html"], ["alerts", "/alerts.html"], ["people", "/people.html"],
  ["account", "/account.html"], ["billing", "/billing.html"], ["company", "/company.html?ticker=AAPL"], ["company-picker", "/company.html"],
  ["pricing", "/pricing.html"], ["company-info", "/company-info.html"], ["terms", "/terms.html"], ["privacy", "/privacy.html"], ["404", "/no-such-page"],
  ["forgot-password", "/forgot-password.html"], ["ops", "/ops.html"],
  ["platform", "/platform.html"], ["why-insidir", "/why-insidir.html"], ["data", "/data.html"], ["subscribe", "/subscribe.html"], ["account-deleted", "/account-deleted.html"],
  ["person", "/person.html?cik=1214156"], ["person-404", "/person.html?cik=999"],
  ["stories", "/stories.html"], ["story", "/stories/enterprise-products-insider-purchase.html"], ["creator-kit", "/creator-kit.html"], ["creators", "/creators.html"]
];
const wanted = opt("pages", "").split(",").filter(Boolean);
// Pages rebuilt on ui.css (the landing page, Today, Alerts, the ticker page) follow the new design system, not V13:
// scripts/visual-layout-check.mjs and scripts/a11y-check.mjs check them with real data.
const REBUILT = new Set(["index", "dashboard", "alerts", "company", "company-picker", "signin", "signup", "forgot-password", "filing"]);
const PAGES = (wanted.length ? ALL.filter(([k]) => wanted.includes(k)) : ALL).filter(([k]) => !REBUILT.has(k));
const passed = [], failed = [];
const check = (ok, label, detail) => { (ok ? passed : failed).push(ok ? label : label + (detail === undefined ? "" : " — " + JSON.stringify(detail))); return ok; };
const pct = v => (v * 100).toFixed(v && v < 0.001 ? 3 : 2) + "%";

const me = { user: { id: 1, email: "reader@example.com" }, access: { active: true, plan: "pro", status: "active", billingEnabled: true } };
const mock = url => url.pathname === "/v1/me" ? me : url.pathname === "/v1/billing/status" ? { billingEnabled: true, plan: "pro", subscriptionStatus: "active" } : url.pathname === "/v1/status" ? { engine: "online", filings: 0 } : { items: [] };
/* GET /v1/people/<cik>: Tim Cook's personnel file in the shape src/person-profile.mjs answers (personProfile()), long
   enough that its sections start below the fold; dates are relative to the run so the 30-day record has lines. Any
   other CIK answers 404 {error}, as the engine does. GET /v1/me/people is { items: [] } (the mock above): unfollowed. */
function personFile() {
  const DAY = 86400000, now = Date.now(), cik = "0001214156", name = "COOK TIMOTHY D";
  const tradeDay = ago => new Date(now - ago * DAY).toISOString().slice(0, 10) + "T00:00:00.000Z";
  const filedAt = ago => new Date(now - ago * DAY).toISOString().slice(0, 10) + "T22:30:00.000Z";
  const AAPL = ["AAPL", "0000320193", "Apple Inc."], NKE = ["NKE", "0000320187", "NIKE, Inc."];
  // [accession, issuer, filed days ago, lines: [code, A/D, shares, price, traded days ago]]
  const FILED = [["0000320193-26-000063", AAPL, 4, [["S", "D", "18000", "227.4", 6], ["S", "D", "4116.5", "229.8812", 6]]], ["0000320187-26-000070", NKE, 12, [["P", "A", "10000", "72.415", 14]]],
    ["0000320193-26-000058", AAPL, 40, [["M", "A", "196410", null, 42], ["F", "D", "100348", "223.19", 42]]], ["0000320187-26-000044", NKE, 90, [["A", "A", "3107", null, 92]]]];
  const tx = [], filings = [];
  for (const [accession, [ticker, issuer_cik, issuer_name], ago, lines] of FILED) {
    const published_at = filedAt(ago), source_url = "https://www.sec.gov/Archives/edgar/data/" + Number(issuer_cik) + "/" + accession.replace(/-/g, "") + "/xslF345X05/wk-form4.xml";
    for (const [code, ad, shares, price, traded] of lines) tx.push({ id: String(tx.length + 1), accession, ticker, issuer_cik, issuer_name, owner_cik: cik, owner_name: name, transaction_date: tradeDay(traded),
      transaction_code: code, acquired_disposed: ad, category: code === "P" ? "reported_purchase" : code === "S" ? "reported_sale" : "other", derivative: false, shares, price_per_share: price,
      estimated_value: price === null ? null : (Number(shares) * Number(price)).toFixed(2), direct_ownership: "D", security_title: "Common Stock", source_url, created_at: published_at, published_at, is_amendment: false, superseded: false });
    filings.push({ accession, form_type: "4", ticker, issuer_cik, issuer_name, published_at, source_url, lines: lines.length });
  }
  const sum = list => Math.round(list.reduce((a, v) => a + Number(v || 0), 0) * 100) / 100;
  const totals = rows => { const days = rows.map(x => x.transaction_date).sort(), part = cat => { const r = rows.filter(x => x.category === cat); return { count: r.length, shares: sum(r.map(x => x.shares)), value: sum(r.map(x => x.estimated_value)) }; };
    return { transactions: rows.length, superseded: 0, filings: new Set(rows.map(x => x.accession)).size, purchases: part("reported_purchase"), sales: part("reported_sale"), other: { count: rows.filter(x => x.category === "other").length },
      first_transaction_date: days[0] || null, last_transaction_date: days.at(-1) || null, last_published_at: rows.map(x => x.published_at).sort().at(-1) || null }; };
  const companies = [AAPL, NKE].map(([ticker, issuer_cik, issuer_name]) => { const t = totals(tx.filter(x => x.issuer_cik === issuer_cik));
    return { ticker, issuer_cik, issuer_name, roles: ticker === "AAPL" ? ["Chief Executive Officer", "Director"] : ["Director"], first_transaction_date: t.first_transaction_date, last_transaction_date: t.last_transaction_date,
      last_published_at: t.last_published_at, transactions: t.transactions, purchases_value: t.purchases.value, sales_value: t.sales.value }; });
  return { person: { cik, name, filed_names: [name] }, companies, totals: { all: totals(tx), d30: totals(tx.filter(x => Date.parse(x.published_at) >= now - 30 * DAY)) },
    transactions: [...tx].sort((a, b) => b.transaction_date.localeCompare(a.transaction_date) || Number(b.id) - Number(a.id)), filings, other_issuers: [],
    edgar_url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=" + cik + "&type=4&dateb=&owner=include&count=40", source: "SEC Form 4", disclaimer: "Public SEC records. Not a recommendation or a prediction." };
}
// [status, body] for a mocked /v1 request.
const respond = url => /^\/v1\/people\/[^/]+$/.test(url.pathname)
  ? (decodeURIComponent(url.pathname.slice(11)).replace(/^0+/, "") === "1214156" ? [200, personFile()] : [404, { error: "Reporting person not found in imported SEC records" }])
  : [200, mock(url)];

const server = createServer((req, res) => { serveStatic(req, res).then(f => { if (!f) { res.writeHead(404); res.end("not found"); } }).catch(e => { res.writeHead(500); res.end(String(e)); }); });
await new Promise(ok => server.listen(0, "127.0.0.1", ok));
const base = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-lcd-text", "--font-render-hinting=none"] });

/* ---------- what is sampled ---------- */
/* The free-standing elements the old motion layer used to move ("atoms"): if any of them moves again, it is
   one of these. Any other visible link, button, tab or summary tops the sample up. */
const ATOMS = [
  "[data-hf-atom]",
  // brand and navigation
  ".v6-logo", ".v13-logo", ".app-header .logo", ".v6-nav__links a", ".v6-signin", ".app-nav a", ".user-menu__btn", ".app-header__bell",
  // buttons and chips
  ".v9-btn", ".btn", ".auth-btn", ".cx-btn", ".rd-toggle", ".rd-filters button", ".v10-follow-btn", ".v3-account__button", ".cl-more", ".hwf-up",
  // links that stand alone, arrows and markers
  ".rd-link", ".v13-link", ".mk-link", ".pw-link", ".auth-switch a", ".rd-shortcuts__name b", ".rd-row > b", ".mk-index a span:last-child",
  ".v12-secondary-link", ".cl-result__head > a", ".cl-finish a", ".research-text-link", ".portfolio-small-link", ".v3-account__links a",
  ".cx-link", ".cx-arrow", ".cx-crumbs a", ".v10-jump", ".v10-known__grid b", ".v10-people-topline a", ".v10-follows__head > a", ".v10-person-card__actions > a", ".alert-src",
  // index numbers and step markers
  ".rd-index", ".mk-num", ".lp-step__num", ".lp-tool__num", ".lp-tool__icon", ".lp-rule__num", ".lp-folio", ".auth-index li > span", ".pw-list li > span",
  // identity tiles outside tables
  ".ins-media", ".cx-logo",
  // footer
  ".hwf-col a"
].join(",");
const GENERIC = "a[href],button,[role=button],[role=tab],summary,.ins-media";
const HOVERABLE = "a[href],button,[role=button],[role=tab],summary,.v9-btn,.btn";
// Where a click or a press could do something: an "empty" point is outside all of these.
const CONTROL = "a,button,input,select,textarea,label,summary,details,[role=button],[role=tab],[role=row],[role=link],[role=menuitem],[role=option],[tabindex],[onclick],[contenteditable],tr,dialog";
const FIELDS = "[data-halftone-hero],[data-halftone-footer],[data-halftone-field]";
const REVEAL_SEL = "[data-hf-reveal],[data-hf-reveal-group]>*,footer .hwf-top>*";

/* ---------- init scripts ---------- */
/* Page-side helpers (window.__mc): sampling elements, measuring boxes and transforms, snapshots of dot-field
   canvases, empty points, and a click blocker for presses. */
const MC_LIB = ({ ATOMS, GENERIC, HOVERABLE, CONTROL, FIELDS }) => {
  const mc = window.__mc = { sets: {}, base: {}, snaps: {}, blocking: false };
  // While pressing controls, their click is cancelled before any page listener sees it: nothing navigates or opens.
  addEventListener("click", e => { if (mc.blocking) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  const name = mc.name = el => { const bits = []; for (let n = el, i = 0; n && n.nodeType === 1 && i < 3; i++, n = n.parentElement) bits.unshift(n.tagName.toLowerCase() + (n.id ? "#" + n.id : n.classList.length ? "." + [...n.classList].filter(c => !/^hf-/.test(c)).slice(0, 2).join(".") : "")); return bits.join(" > "); };
  const shown = el => {
    if (!el.isConnected || el.closest("[hidden],.skip-link,canvas,noscript,template")) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && parseFloat(cs.opacity) > 0;
  };
  const inView = r => r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  const spread = (list, n) => n <= 0 ? [] : list.length <= n ? list : Array.from({ length: n }, (_, i) => list[Math.floor(i * list.length / n)]);
  // The centre of an element, if the pointer there would really be on it.
  mc.hit = el => {
    const r = el.getBoundingClientRect();
    const x = Math.min(innerWidth - 2, Math.max(1, r.left + r.width / 2)), y = Math.min(innerHeight - 2, Math.max(1, r.top + r.height / 2));
    const h = document.elementFromPoint(x, y);
    return h && el.contains(h) ? { x, y } : null;
  };
  mc.pick = (key, { view, max }) => {
    const ok = el => shown(el) && (!view || inView(el.getBoundingClientRect()));
    const atoms = [...document.querySelectorAll(ATOMS)].filter(ok), seen = new Set(atoms);
    const a = spread(atoms, Math.min(atoms.length, Math.ceil(max * 0.7)));
    const generic = [...document.querySelectorAll(GENERIC)].filter(el => !seen.has(el) && ok(el));
    const list = mc.sets[key] = a.concat(spread(generic, max - a.length));
    return { n: list.length, atoms: a.length, names: list.slice(0, 3).map(name) };
  };
  mc.join = (key, ...keys) => { const s = new Set(); for (const k of keys) for (const el of mc.sets[k] || []) s.add(el); mc.sets[key] = [...s]; return s.size; };
  // Computed transform, translate, scale and rotate as numbers: [a, b, c, d, e, f, tx, ty, sx, sy, rotate].
  const vec = mc.vec = (el, pseudo) => {
    const cs = getComputedStyle(el, pseudo || null);
    let m;
    try { m = cs.transform && cs.transform !== "none" ? new DOMMatrixReadOnly(cs.transform) : new DOMMatrixReadOnly(); } catch { m = new DOMMatrixReadOnly(); }
    const tr = !cs.translate || cs.translate === "none" ? [0, 0] : cs.translate.split(/\s+/).map(parseFloat);
    const sc = !cs.scale || cs.scale === "none" ? [1, 1] : cs.scale.split(/\s+/).map(parseFloat);
    const ro = !cs.rotate || cs.rotate === "none" ? 0 : parseFloat(cs.rotate.split(/\s+/).pop());
    return [m.a, m.b, m.c, m.d, m.e, m.f, tr[0] || 0, tr[1] || 0, sc[0], sc.length > 1 ? sc[1] : sc[0], ro || 0];
  };
  const TOL = [0.005, 0.005, 0.005, 0.005, 0.5, 0.5, 0.5, 0.5, 0.005, 0.005, 0.5];
  const vdiff = (a, b) => a.some((x, i) => !(Math.abs(x - b[i]) <= TOL[i]));
  const fmt = v => "[" + v.map(x => +x.toFixed(3)).join(",") + "]";
  mc.box = el => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; };
  // How far an element is held off its place: its translate plus its transform's translation.
  mc.off = el => { const v = vec(el); return Math.hypot(v[4] + v[6], v[5] + v[7]); };
  const boxDiff = (a, b) => Math.max(...a.map((v, j) => Math.abs(v - b[j])));
  mc.state = key => mc.sets[key].map(el => el.isConnected ? { b: mc.box(el), v: vec(el) } : null);
  // The baseline also keeps the box of up to six laid-out descendants of each element (an arrow, an icon, a tile).
  const kidsOf = el => [...el.querySelectorAll("*")].filter(k => { const r = k.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).slice(0, 6);
  mc.baseline = key => {
    mc.base[key] = { s: mc.state(key), y: scrollY, x: scrollX, kids: mc.sets[key].map(el => el.isConnected ? kidsOf(el).map(k => [k, mc.box(k)]) : []) };
    return mc.base[key].s.length;
  };
  // A compact signature of the set's boxes, to wait for a still layout.
  mc.sig = key => mc.sets[key].map(el => el.isConnected ? mc.box(el).map(v => v.toFixed(1)).join(",") : "-").join(";") + "|" + scrollY;
  // Sampled elements whose box moved by more than 0.5px or whose transform changed since the baseline.
  mc.moved = key => {
    const base = mc.base[key], now = mc.state(key), out = [];
    if (Math.abs(scrollY - base.y) > 0.5 || Math.abs(scrollX - base.x) > 0.5) out.push("the page scrolled from " + base.y + " to " + scrollY);
    now.forEach((s, i) => {
      const b = base.s[i];
      if (!s || !b) return;
      const d = boxDiff(s.b, b.b);
      if (d > 0.5) out.push(name(mc.sets[key][i]) + " moved " + d.toFixed(1) + "px");
      else if (vdiff(s.v, b.v)) out.push(name(mc.sets[key][i]) + " transform " + fmt(b.v) + " -> " + fmt(s.v));
      else for (const [k, kb] of base.kids[i]) {
        if (!k.isConnected) continue;
        const kbox = mc.box(k);
        if (kbox[2] === 0 && kbox[3] === 0) continue;
        const dk = boxDiff(kbox, kb);
        if (dk > 0.5) { out.push(name(k) + " (inside " + name(mc.sets[key][i]) + ") moved " + dk.toFixed(1) + "px"); break; }
      }
    });
    return out;
  };

  /* Scroll: where each element sits on the page. In a fixed bar its viewport position; in a sticky box its
     position relative to that box (an element that is itself sticky is not judged). */
  mc.prepScroll = key => {
    mc.anchors = mc.sets[key].map(el => {
      for (let n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
        const p = getComputedStyle(n).position;
        if (p === "fixed" || p === "sticky") return n === el && p === "sticky" ? "skip" : { n, p };
      }
      return null;
    });
    mc.scrollSamples = [];
    mc.scrollFrom = mc.docPos(key);
    return mc.anchors.filter(a => a && a !== "skip").length;
  };
  mc.docPos = key => mc.sets[key].map((el, i) => {
    const a = mc.anchors[i];
    if (a === "skip" || !el.isConnected) return null;
    const r = el.getBoundingClientRect();
    if (!a) return [r.left + scrollX, r.top + scrollY, r.width, r.height];
    if (a.p === "fixed") return [r.left, r.top, r.width, r.height];
    const b = a.n.getBoundingClientRect();
    return [r.left - b.left, r.top - b.top, r.width, r.height];
  });
  mc.scrollSample = key => { mc.scrollSamples.push({ y: scrollY, p: mc.docPos(key) }); };
  // Every sample must match where the element was before the scroll or where it is once the scroll settled.
  mc.scrollEnd = key => {
    const to = mc.docPos(key), from = mc.scrollFrom, out = [];
    for (const s of mc.scrollSamples) s.p.forEach((p, i) => {
      if (!p || !from[i] || !to[i]) return;
      const d = Math.min(boxDiff(p, from[i]), boxDiff(p, to[i]));
      if (d > 0.5 && out.length < 8) out.push(name(mc.sets[key][i]) + " off by " + d.toFixed(1) + "px at scrollY " + Math.round(s.y));
    });
    return out;
  };

  /* Dot fields. */
  mc.fields = () => {
    mc.roots = [...document.querySelectorAll(FIELDS)];
    return mc.roots.map((r, i) => {
      const h = r.__halftone, c = r.querySelector(":scope > canvas"), b = r.getBoundingClientRect();
      return { i, name: name(r), mounted: !!h, word: !!h && h.options.mode === "word", hero: r.hasAttribute("data-halftone-hero"),
        footer: r.classList.contains("hwf-field"), interactive: !!(h && h.options.interactive), w: c ? c.width : 0, h: c ? c.height : 0,
        shown: b.width > 0 && b.height > 0 && !r.closest("[hidden]") && getComputedStyle(r).visibility !== "hidden" };
    });
  };
  mc.snap = (i, key) => {
    const c = mc.roots[i] && mc.roots[i].querySelector(":scope > canvas");
    if (!c || !c.width || !c.height) return 0;
    mc.snaps[key] = { w: c.width, h: c.height, d: c.getContext("2d").getImageData(0, 0, c.width, c.height).data };
    return c.width * c.height;
  };
  // Share of pixels that differ between two snapshots by more than `thr` (sum over the four channels).
  mc.diff = (a, b, thr) => {
    const A = mc.snaps[a], B = mc.snaps[b];
    if (!A || !B) return -1;
    if (A.w !== B.w || A.h !== B.h) return 1;
    let n = 0;
    const x = A.d, y = B.d;
    for (let i = 0; i < x.length; i += 4) if (Math.abs(x[i] - y[i]) + Math.abs(x[i + 1] - y[i + 1]) + Math.abs(x[i + 2] - y[i + 2]) + Math.abs(x[i + 3] - y[i + 3]) > thr) n++;
    return n / (x.length / 4);
  };
  // Like diff, over the pixels farther than minD (CSS px) from the viewport point (x, y) only.
  mc.diffFar = (a, b, thr, i, x, y, minD) => {
    const A = mc.snaps[a], B = mc.snaps[b];
    if (!A || !B) return -1;
    if (A.w !== B.w || A.h !== B.h) return 1;
    const c = mc.roots[i].querySelector(":scope > canvas"), r = c.getBoundingClientRect(), s = c.width / r.width;
    const ox = (x - r.left) * s, oy = (y - r.top) * s, m2 = (minD * s) * (minD * s);
    let n = 0, tot = 0;
    for (let py = 0; py < A.h; py++) for (let px = 0; px < A.w; px++) {
      const dx = px - ox, dy = py - oy;
      if (dx * dx + dy * dy <= m2) continue;
      tot++;
      const k = (py * A.w + px) * 4;
      if (Math.abs(A.d[k] - B.d[k]) + Math.abs(A.d[k + 1] - B.d[k + 1]) + Math.abs(A.d[k + 2] - B.d[k + 2]) + Math.abs(A.d[k + 3] - B.d[k + 3]) > thr) n++;
    }
    return tot ? n / tot : -2;
  };
  mc.drop = prefix => { for (const k of Object.keys(mc.snaps)) if (k.startsWith(prefix)) delete mc.snaps[k]; };
  // The part of field i on screen (scrolled into view first when asked), a point on it where a click lands on no
  // control, and the point on screen farthest from it (on no control) for the pointer to leave to: every field
  // follows the pointer across the whole page, so leaving means going out of its reach.
  mc.fieldBox = (i, scroll) => {
    const root = mc.roots[i];
    if (scroll) {
      const r = root.getBoundingClientRect();
      window.scrollTo({ top: Math.max(0, r.top + scrollY - Math.max(80, (innerHeight - r.height) / 2)), left: 0, behavior: "instant" });
    }
    const r = root.getBoundingClientRect();
    const box = { left: Math.max(2, r.left), top: Math.max(2, r.top), right: Math.min(innerWidth - 2, r.right), bottom: Math.min(innerHeight - 2, r.bottom) };
    if (box.right - box.left < 8 || box.bottom - box.top < 8) return null;
    let click = null;
    for (let y = box.top + 4; y < box.bottom - 2 && !click; y += 9) for (let x = box.left + 6; x < box.right - 4; x += 17) {
      const el = document.elementFromPoint(x, y);
      if (el && !el.closest(CONTROL)) { click = { x, y }; break; }
    }
    let out = null, far = -1;
    for (let y = 6; y < innerHeight - 4; y += 13) for (let x = 6; x < innerWidth - 4; x += 41) {
      const dx = Math.max(0, r.left - x, x - r.right), dy = Math.max(0, r.top - y, y - r.bottom), d = Math.hypot(dx, dy);
      if (d <= far) continue;
      const el = document.elementFromPoint(x, y);
      if (el && !el.closest(CONTROL)) { out = { x, y }; far = d; }
    }
    // A field nearly as big as the screen has no point on screen out of its reach: the pointer leaves the window.
    const h = root.__halftone, reach = h ? h.options.radius * window.InsidirHalftone.PHYSICS.pressReach + 8 : 0;
    return Object.assign(box, { click, out, far: Math.round(far), clear: far > reach, scrollY });
  };

  // A point on empty page: nothing clickable under it (and, first, no dot field either).
  mc.empty = () => {
    for (const skip of [CONTROL + ",canvas," + FIELDS, CONTROL]) {
      for (let y = 140; y < innerHeight - 20; y += 23) for (let x = 30; x < innerWidth - 30; x += 37) {
        const e = document.elementFromPoint(x, y);
        if (e && e !== document.documentElement && !e.closest(skip)) return { x, y };
      }
    }
    return null;
  };

  /* Hover: an element, its children, and the ::before/::after of each. */
  mc.hoverPick = n => {
    const list = [...document.querySelectorAll(HOVERABLE)].filter(el => shown(el) && inView(el.getBoundingClientRect()) && mc.hit(el));
    // Half of them with something inside (an arrow, an icon, a tile), which is what a hover used to nudge.
    const rich = list.filter(el => el.querySelector("*")), plain = list.filter(el => !el.querySelector("*"));
    const a = spread(rich, Math.min(rich.length, Math.max(n - plain.length, Math.ceil(n / 2))));
    mc.sets.hover = a.concat(spread(plain, n - a.length));
    return mc.sets.hover.map(el => Object.assign(mc.hit(el), { name: name(el) }));
  };
  const hoverState = el => {
    const all = [el, ...[...el.querySelectorAll("*")].slice(0, 24)];
    return { all, boxes: all.map(mc.box), vecs: all.map(n => [vec(n), vec(n, "::before"), vec(n, "::after")]) };
  };
  mc.hoverBase = () => { mc.hb = mc.sets.hover.map(hoverState); return mc.hb.length; };
  mc.hoverCheck = i => {
    const b = mc.hb[i], s = hoverState(mc.sets.hover[i]), out = [];
    if (s.all.length !== b.all.length) return [];
    s.boxes.forEach((box, j) => {
      const who = j ? name(s.all[j]) + " (inside " + name(s.all[0]) + ")" : name(s.all[0]);
      const d = boxDiff(box, b.boxes[j]);
      if (d > 0.5) out.push(who + " moved " + d.toFixed(1) + "px");
      ["", "::before", "::after"].forEach((p, k) => { if (vdiff(s.vecs[j][k], b.vecs[j][k])) out.push(who + p + " transform " + fmt(b.vecs[j][k]) + " -> " + fmt(s.vecs[j][k])); });
    });
    return out;
  };
  // Presses: buttons, tabs and chips first, then links.
  mc.pressPick = (key, n) => {
    const els = mc.sets[key].filter(el => el.isConnected && mc.hit(el) && !el.matches("input,select,textarea"));
    const btn = els.filter(el => el.matches("button,[role=button],[role=tab],.btn,.v9-btn") || el.closest("button"));
    return spread(btn.concat(els.filter(el => !btn.includes(el))), n).map(el => Object.assign(mc.hit(el), { name: name(el) }));
  };
};
// The pointer checks measure elements in place, so every scroll-reveal block is shown at once (and any transition of
// its own that a block let go from .hf-pending starts from the hidden state is finished).
const REVEAL_ALL = () => {
  const go = () => {
    const M = window.InsidirMotion;
    if (!M) return;
    const held = new Set(document.querySelectorAll(".hf-pending,.hf-revealing"));
    M.revealAll();
    if (held.size) for (const a of document.getAnimations()) if (a instanceof CSSTransition && a.effect && held.has(a.effect.target)) { try { a.finish(); } catch {} }
  };
  addEventListener("DOMContentLoaded", () => setTimeout(go, 0));
  addEventListener("load", go);
};
/* For the whole visit, from document start: every --hf-dx / --hf-dy / --hf-s written into a style attribute (the old
   pointer/scroll offsets; nothing may write one now), every element that is given .hf-pending, and every one that
   goes through .hf-revealing. */
const WATCH = () => {
  const w = window.__hfWrites = { n: 0, at: [] }, ever = window.__hfEverPending = new Set(), rose = window.__hfRose = new Set();
  const rx = /--hf-(dx|dy|s)\s*:\s*([^;]*)/g;
  const name = el => (el.tagName || "").toLowerCase() + (el.classList && el.classList.length ? "." + [...el.classList].filter(c => !/^hf-/.test(c)).slice(0, 2).join(".") : "");
  const note = el => { if (el.classList.contains("hf-pending")) ever.add(el); if (el.classList.contains("hf-revealing")) rose.add(el); };
  new MutationObserver(ms => {
    for (const m of ms) {
      const el = m.target;
      if (el.nodeType !== 1) continue;
      if (m.type === "attributes" && m.attributeName === "class") { note(el); continue; }
      if (m.type === "attributes") {
        const style = el.getAttribute("style") || "";
        for (const x of style.matchAll(rx)) if (x[2].trim()) { w.n++; if (w.at.length < 6) w.at.push(name(el) + " --hf-" + x[1] + ": " + x[2].trim()); }
        continue;
      }
      for (const n of m.addedNodes) if (n.nodeType === 1) { note(n); for (const d of n.querySelectorAll(".hf-pending,.hf-revealing")) note(d); }
    }
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "class"] });
};
/* What v13-motion.js should hold back: the same rule it applies (a block marked for reveal that is rendered and
   below 92% of the viewport the first time it is scanned while shown, and that the page can scroll into view), applied right
   after each of its scans: once it has started (InsidirMotion is assigned after start() ran or was scheduled), and
   after each of its 120ms refreshes, which follow the same mutations. Blocks seen on screen first and pushed down
   later by content loading above them are rightly never hidden, so they are not expected to wait. */
const REVEAL_ORACLE = () => {
  const SEL = "[data-hf-reveal],[data-hf-reveal-group]>*,footer .hwf-top>*";
  const seen = new WeakSet(), expect = window.__hfExpect = new Set();
  const scan = () => {
    const limit = innerHeight * 0.92, maxY = Math.max(0, document.documentElement.scrollHeight - innerHeight);
    for (const el of document.querySelectorAll(SEL)) {
      if (seen.has(el)) continue;
      if (el.matches(".hf-no-reveal,[data-hf-still]")) { seen.add(el); continue; }
      // Hidden or not laid out yet: considered again on a later scan, once shown (as the core does).
      if (el.closest("[hidden]")) continue;
      const r = el.getBoundingClientRect();
      if (r.height === 0 && r.width === 0) continue;
      seen.add(el);
      if (r.top < limit) continue;
      if (r.top + scrollY - maxY > innerHeight * 0.88) continue;
      expect.add(el);
    }
  };
  const after = () => {
    scan();
    let t = 0;
    new MutationObserver(ms => { if (ms.some(m => m.type === "childList" || m.attributeName === "hidden")) { clearTimeout(t); t = setTimeout(scan, 120); } })
      .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  };
  let motion;
  Object.defineProperty(window, "InsidirMotion", { configurable: true, enumerable: true, get: () => motion,
    set: v => { motion = v; if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", after); else after(); } });
};

async function open(path, { width = 1440, reducedMotion = "no-preference", touch = false, reveal = true, oracle = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, reducedMotion, isMobile: touch, hasTouch: touch, deviceScaleFactor: 1 });
  await context.addInitScript(MC_LIB, { ATOMS, GENERIC, HOVERABLE, CONTROL, FIELDS });
  if (reveal) await context.addInitScript(REVEAL_ALL);
  if (oracle) await context.addInitScript(REVEAL_ORACLE);
  await context.addInitScript(WATCH);
  // Self-test hooks: prove the check fails when motion breaks (see the header).
  if (INJECT_JS) await context.addInitScript({ content: INJECT_JS });
  if (INJECT_CSS) await context.addInitScript(css => addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = "@layer insidir-v13{" + css + "}"; document.head.appendChild(s); }), INJECT_CSS);
  await context.route("**/v1/**", r => { const [status, body] = respond(new URL(r.request().url())); return r.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) }); });
  await context.route(/wikimedia/, r => r.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="250" height="320"/>' }));
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource|404/.test(m.text())) errors.push(m.text()); });
  await page.goto(base + path, { waitUntil: "networkidle", timeout: 30000 }).catch(() => page.goto(base + path, { waitUntil: "domcontentloaded" }));
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(300);
  return { context, page, errors };
}
const scrollTo = (page, y) => page.evaluate(y => window.scrollTo({ top: y, left: 0, behavior: "instant" }), y);
// Poll until `read` gives the same answer twice in a row, `gap` ms apart (or `ms` have passed).
async function steady(page, read, { gap = 150, ms = 2500 } = {}) {
  const t0 = Date.now();
  let a = await read();
  for (;;) {
    await page.waitForTimeout(gap);
    const b = await read();
    if (b === a || Date.now() - t0 > ms) return b === a;
    a = b;
  }
}
const settle = (page, key) => steady(page, () => page.evaluate(key => window.__mc.sig(key), key));
// Snapshot field i under `key` once two snapshots `gap` ms apart agree (a word may still be settling).
async function restSnap(page, i, key, thr = 0, gap = 200) {
  // The field asleep first (every dot home), then two snapshots `gap` ms apart that agree.
  await page.evaluate(i => new Promise(res => { const r = window.__mc.roots[i], h = r && r.__halftone, t0 = performance.now(); const f = () => { if (!h || !h.moving || performance.now() - t0 > 3000) res(); else requestAnimationFrame(f); }; requestAnimationFrame(f); }), i);
  const t0 = Date.now();
  await page.evaluate(([i, key]) => window.__mc.snap(i, key), [i, key]);
  for (;;) {
    await page.waitForTimeout(gap);
    await page.evaluate(([i, key]) => window.__mc.snap(i, key + "~"), [i, key]);
    const d = await page.evaluate(([key, thr]) => window.__mc.diff(key, key + "~", thr), [key, thr]);
    await page.evaluate(([i, key]) => window.__mc.snap(i, key), [i, key]);
    if (d === 0 || Date.now() - t0 > 3000) return d === 0;
  }
}
const snapDiff = (page, i, key, rest, thr) => page.evaluate(([i, key, rest, thr]) => window.__mc.snap(i, key) ? window.__mc.diff(rest, key, thr) : -1, [i, key, rest, thr]);
// A word canvas counts as changed when more than 0.05% of its pixels differ by more than 60 (four channels summed).
const WORD_THR = 60, WORD_TOL = 0.0005;

/* ---------- orange pixels (same rule as scripts/v13-palette-audit.mjs) ---------- */
/* Screenshots for the pixel pass show no text: every glyph (HTML and SVG text) is made transparent for the
   moment of the capture. Text colour is checked exactly from computed styles (palette scan, forced states);
   glyph edges can carry subpixel (LCD) colour fringes on some machines (GitHub's runners), which would read
   as orange. Everything else (dot fields, canvases, fills, borders, icons, images) is captured as painted.
   The rule sits in the insidir-v13 layer with id-level specificity (:is() takes its heaviest argument), so it
   outranks the site's own !important rules. */
async function textlessShot(page) {
  await page.evaluate(() => new Promise(done => {
    document.documentElement.setAttribute("data-hf-pixel-pass", "");
    const s = document.createElement("style"); s.id = "hf-pixel-pass-style";
    s.textContent = "@layer insidir-v13{:is(#hf-px#hf-px#hf-px,[data-hf-pixel-pass]) *,:is(#hf-px#hf-px#hf-px,[data-hf-pixel-pass]) *::before,:is(#hf-px#hf-px#hf-px,[data-hf-pixel-pass]) *::after,:is(#hf-px#hf-px#hf-px,[data-hf-pixel-pass]) *::marker{-webkit-text-fill-color:transparent!important;text-shadow:none!important;caret-color:transparent!important;transition:none!important}" +
      ":is(#hf-px#hf-px#hf-px,[data-hf-pixel-pass]) svg :is(text,tspan){fill:transparent!important;stroke:transparent!important}}";
    document.head.appendChild(s);
    requestAnimationFrame(() => requestAnimationFrame(done));
  }));
  try { return await page.screenshot({ type: "png" }); }
  finally { await page.evaluate(() => { document.documentElement.removeAttribute("data-hf-pixel-pass"); document.getElementById("hf-pixel-pass-style")?.remove(); }); }
}
function decodePNG(buf) {
  let pos = 8, width = 0, height = 0, depth = 0, type = 0, interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), kind = buf.toString("latin1", pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
    if (kind === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    else if (kind === "IDAT") idat.push(data);
    else if (kind === "IEND") break;
    pos += 12 + len;
  }
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[type];
  if (depth !== 8 || interlace || !ch) throw new Error(`unsupported PNG (depth ${depth}, colour type ${type}, interlace ${interlace})`);
  const raw = inflateSync(Buffer.concat(idat)), stride = width * ch, out = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, row = y * stride, up = row - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[row + x - ch] : 0, b = y ? out[up + x] : 0, c = x >= ch && y ? out[up + x - ch] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[row + x] = v & 255;
    }
  }
  return { width, height, ch, data: out };
}
function orangeClusters({ width, height, ch, data }, minPx = 3) {
  const C = 16, cw = Math.ceil(width / C), cells = new Map();
  if (ch < 3) return [];
  // Single pixels count, so a 1px orange hairline is caught; text is kept out of the capture (textlessShot).
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * ch, r = data[i], g = data[i + 1], b = data[i + 2];
    if (!(r > 110 && r - g > 35 && g - b > 15 && r - b > 70)) continue;
    const k = Math.floor(y / C) * cw + Math.floor(x / C);
    let c = cells.get(k);
    if (!c) cells.set(k, c = { n: 0, pts: [] });
    c.n++; if (c.n % 7 === 1 && c.pts.length < 3) c.pts.push([x, y]);
  }
  const out = [], done = new Set();
  for (const start of cells.keys()) {
    if (done.has(start)) continue;
    done.add(start);
    const stack = [start], g = { n: 0, pts: [] };
    while (stack.length) {
      const k = stack.pop(), c = cells.get(k), cx = k % cw, cy = Math.floor(k / cw);
      g.n += c.n; if (g.pts.length < 8) g.pts.push(...c.pts.slice(0, 8 - g.pts.length));
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy, nk = ny * cw + nx;
        if (nx >= 0 && nx < cw && ny >= 0 && cells.has(nk) && !done.has(nk)) { done.add(nk); stack.push(nk); }
      }
    }
    if (g.n >= minPx) out.push(g);
  }
  return out;
}
// Orange clusters on a viewport screenshot, each named by the element under it; photographs (<img>) are ignored.
async function orangeShot(page) {
  const clusters = orangeClusters(decodePNG(await textlessShot(page)));
  if (!clusters.length) return [];
  const names = await page.evaluate(list => {
    const MEDIA = "img,picture,video";
    const path = el => { const bits = []; for (let n = el, i = 0; n && n.nodeType === 1 && i < 3; i++, n = n.parentElement) bits.unshift(n.tagName.toLowerCase() + (n.id ? "#" + n.id : n.classList.length ? "." + [...n.classList].slice(0, 2).join(".") : "")); return bits.join(" > "); };
    const onMedia = (el, x, y) => !!el && (!!el.closest(MEDIA) || [...el.querySelectorAll(MEDIA)].some(m => { const r = m.getBoundingClientRect(); return x >= r.left && x < r.right && y >= r.top && y < r.bottom; }));
    return list.map(pts => { let named = null, media = 0; for (const [x, y] of pts) { const el = document.elementFromPoint(x + 0.5, y + 0.5); if (onMedia(el, x + 0.5, y + 0.5)) media++; else if (!named) named = el; } return media === pts.length ? null : (named ? path(named) : "(no element)"); });
  }, clusters.map(c => c.pts));
  return clusters.map((c, i) => names[i] && c.n + "px under " + names[i]).filter(Boolean);
}

/* ---------- (b) scroll: nothing lags, the dot fields take no scroll, the wordmark does not scatter ---------- */
async function scrollStill(page, key, fields) {
  const room = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  const n = await page.evaluate(() => window.__mc.join("page", "view", "across"));
  const anchored = await page.evaluate(() => window.__mc.prepScroll("page"));
  // Every field drawn at rest first (the pointer has not moved on this page yet).
  const shown = fields.filter(f => f.mounted && f.shown && f.w > 0 && f.h > 0);
  for (const f of shown) await restSnap(page, f.i, "s" + f.i, f.word ? WORD_THR : 0, f.word ? 200 : 80);
  const fieldBad = [], relaid = new Set();
  const resized = (a, b) => page.evaluate(([a, b]) => { const A = window.__mc.snaps[a], B = window.__mc.snaps[b]; return !!(A && B && (A.w !== B.w || A.h !== B.h)); }, [a, b]);
  const fieldsAgree = async when => {
    for (const f of shown) {
      const d = await snapDiff(page, f.i, "s" + f.i + "~now", "s" + f.i, f.word ? WORD_THR : 0);
      // A canvas drawn again at a new size was re-laid out (content above it finished loading and the page changed
      // width or the strip changed size): a layout change, not motion. Its new at-rest image becomes the reference,
      // so a field that also trails the scroll still fails at the next comparison.
      if (d === 1 && await resized("s" + f.i, "s" + f.i + "~now")) {
        await restSnap(page, f.i, "s" + f.i, f.word ? WORD_THR : 0, f.word ? 200 : 80);
        relaid.add(f.name);
        continue;
      }
      if (f.word ? d > WORD_TOL : d !== 0) fieldBad.push(f.name + " " + pct(d) + " changed " + when);
    }
  };
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(60);
    await page.evaluate(() => window.__mc.scrollSample("page"));
    if (i === 2) await fieldsAgree("mid-scroll");
  }
  // Let the wheel's scroll, and anything that might still be making its way back, come to rest before taking the
  // "after" position: the page and every sampled position unchanged over 300ms.
  await steady(page, () => page.evaluate(() => scrollY), { gap: 120, ms: 1500 });
  await steady(page, () => page.evaluate(() => JSON.stringify(window.__mc.docPos("page"))), { gap: 300, ms: 3000 });
  const scrolled = await page.evaluate(() => scrollY);
  await fieldsAgree("after the wheel");
  // A field re-laid out during the wheel is compared once more, still scrolled, against its new at-rest image.
  if (relaid.size) { await page.waitForTimeout(400); await fieldsAgree("after the wheel, once re-laid out"); }
  const lag = await page.evaluate(() => window.__mc.scrollEnd("page"));
  if (room <= 40) check(true, `${key}: nothing lags a wheel scroll: n/a (the page cannot scroll)`);
  else check(lag.length === 0 && scrolled > 0, `${key}: nothing lags a wheel scroll (8 x 120px, ${n} elements, ${anchored} in fixed/sticky bars; within 0.5px; page scrolled ${scrolled}px)`, { lag: lag.slice(0, 4), scrolled });
  check(fieldBad.length === 0, `${key}: the dot fields take no scroll (${shown.length} canvas(es) unchanged mid-scroll and after${relaid.size ? "; " + relaid.size + " re-laid out at a new size while the page loaded" : ""})`, fieldBad.slice(0, 4));

  // The landing wordmark: still itself at scrollY 300 and back at the top (no scatter).
  const hero = fields.find(f => f.hero && f.mounted);
  if (hero) {
    await scrollTo(page, 0);
    await restSnap(page, hero.i, "hero-rest", WORD_THR);
    await scrollTo(page, 300);
    await page.waitForTimeout(400);
    const down = await snapDiff(page, hero.i, "hero-300", "hero-rest", WORD_THR);
    await scrollTo(page, 0);
    await page.waitForTimeout(400);
    const back = await snapDiff(page, hero.i, "hero-0", "hero-rest", WORD_THR);
    check(down >= 0 && down <= WORD_TOL && back >= 0 && back <= WORD_TOL, `${key}: the hero wordmark does not scatter on scroll (scrollY 300: ${pct(down)} of its canvas differs; back at 0: ${pct(back)})`, { down, back });
  }
  await page.evaluate(() => window.__mc.drop("s"));
}

/* ---------- (c) every dot field answers the pointer and a click, hard, and settles back exactly ---------- */
// The pointer leaves a field's reach: to the point on screen farthest from it, and out of the window when even that is
// within reach (a pointerout with no relatedTarget, as the browser sends when the pointer leaves the page).
async function leave(page, box, steps = 1) {
  await page.mouse.move(box.out ? box.out.x : 2, box.out ? box.out.y : 2, { steps });
  if (!box.clear) await page.evaluate(() => document.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, relatedTarget: null })));
}
// A field is back at rest when its canvas equals its at-rest image (a word within 0.05% of its pixels, a plain field
// pixel for pixel: every dot snaps exactly home); it has 2.5s from the moment the pointer leaves its reach.
const SETTLE_MS = 4000;
// Waits on the engine's own sleep (an in-page frame loop, so the wait does not slow the frames it is timing), then
// compares one snapshot with the at-rest image.
async function backAtRest(page, f, rest, thr, tol) {
  const took = await sleeps(page, f.i, SETTLE_MS);
  const left = await snapDiff(page, f.i, rest + "-now", rest, thr);
  return { left, took, ok: took >= 0 && left >= 0 && left <= tol };
}
// How long field i keeps drawing once nothing moves (the pointer resting on it, or gone): -1 if still awake at `limit`.
// A resting pointer gets SLEEP_MS; a held press also sent a ring, so it gets the ring's life on top.
const SLEEP_MS = 4000;
const sleeps = (page, i, limit) => page.evaluate(([i, limit]) => new Promise(res => {
  const h = window.__mc.roots[i].__halftone, t0 = performance.now();
  const tick = () => { if (!h.moving) res(Math.round(performance.now() - t0)); else if (performance.now() - t0 > limit) res(-1); else requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}), [i, limit]);
async function wordFields(page, key, fields) {
  for (const f of fields.filter(f => f.word && f.mounted && f.shown && f.w > 0)) {
    const box = await page.evaluate(i => window.__mc.fieldBox(i, true), f.i);
    if (!check(!!box, `${key}: the word canvas ${f.name} is on screen to test`)) continue;
    await leave(page, box);
    await restSnap(page, f.i, "w-rest", WORD_THR);
    // Across the word, low (where the letters sit) and through the middle.
    let moved = 0;
    for (const fy of [0.82, 0.6, 0.9]) {
      const y = box.top + (box.bottom - box.top) * fy;
      await page.mouse.move(box.left + (box.right - box.left) * 0.15, y);
      await page.mouse.move(box.left + (box.right - box.left) * 0.85, y, { steps: 12 });
      moved = Math.max(moved, await snapDiff(page, f.i, "w-on", "w-rest", WORD_THR));
    }
    // The pointer leaves: back at rest.
    await leave(page, box, 2);
    const r = await backAtRest(page, f, "w-rest", WORD_THR, WORD_TOL);
    check(moved > 0.002, `${key}: ${f.hero ? "the hero wordmark" : "the word field " + f.name} answers the pointer hard (${pct(moved)} of its canvas changed while the pointer moved over it)`, { moved });
    check(r.ok, `${key}: ${f.hero ? "the hero wordmark" : "the word field " + f.name} is back at rest within ${SETTLE_MS / 1000}s of the pointer leaving (${r.took}ms; ${pct(r.left)} still differs)`, r);
    await page.evaluate(() => window.__mc.drop("w-"));
  }
}
async function plainFields(page, key, fields) {
  const plain = fields.filter(f => !f.word && f.mounted && f.shown && f.w > 0 && f.h > 0);
  const bad = [], seen = [], skipped = [];
  const P = await page.evaluate(() => window.InsidirHalftone.PHYSICS);
  for (const f of plain) {
    const box = await page.evaluate(i => window.__mc.fieldBox(i, true), f.i);
    if (!box || !box.out) { skipped.push(f.name); continue; }
    await leave(page, box);
    await restSnap(page, f.i, "p-rest", 0, 100);
    let swept = 0, rang = -1;
    for (const fy of [0.3, 0.75]) {
      const y = box.top + (box.bottom - box.top) * fy;
      await page.mouse.move(box.left + 4, y);
      await page.mouse.move(box.right - 4, y, { steps: 6 });
      swept = Math.max(swept, await snapDiff(page, f.i, "p-on", "p-rest", 0));
    }
    // The pointer comes to rest on the field, then holds a press there: each time the dots it holds settle round its
    // hole and the field stops drawing, instead of repainting every frame while one dot creeps.
    let restMs = -2, heldMs = -2;
    if (box.click) {
      await page.mouse.move(box.click.x, box.click.y, { steps: 3 });
      restMs = await sleeps(page, f.i, SLEEP_MS);
      await page.mouse.down();
      heldMs = await sleeps(page, f.i, P.ringLife + SLEEP_MS);
      await page.mouse.up();
    }
    // Out of reach and settled.
    await leave(page, box, 2);
    const r1 = await backAtRest(page, f, "p-rest", 0, 0);
    // A click on the field rings through it: only pixels beyond the press's reach of the click count, so the press
    // and the pointer's own jump to the click point cannot pass for a ring.
    let far = -1;
    if (box.click) {
      far = await page.evaluate(([i, P]) => window.__mc.roots[i].__halftone.options.radius * P.pressReach + 12, [f.i, P]);
      await page.mouse.click(box.click.x, box.click.y);
      for (let t = 0; t < P.ringLife; t += 100) {
        rang = Math.max(rang, await page.evaluate(([i, x, y, d]) => window.__mc.snap(i, "p-ring") ? window.__mc.diffFar("p-rest", "p-ring", 0, i, x, y, d) : -1, [f.i, box.click.x, box.click.y, far]));
        if (rang > 0.0005) break;
        await page.waitForTimeout(100);
      }
      await leave(page, box);
    }
    const r2 = await backAtRest(page, f, "p-rest", 0, 0);
    seen.push(f.name + " " + pct(swept) + " swept" + (rang >= 0 ? ", " + pct(rang) + " rung beyond " + Math.round(far) + "px" : rang === -2 ? ", nothing beyond the press's reach to ring" : "") + ", " + Math.max(r1.took, r2.took) + "ms to rest" + (restMs >= 0 ? ", asleep " + restMs + "ms under a resting pointer and " + heldMs + "ms under a held press" : ""));
    if (restMs === -1) bad.push(f.name + " still drawing " + SLEEP_MS + "ms after the pointer came to rest on it");
    if (heldMs === -1) bad.push(f.name + " still drawing " + (P.ringLife + SLEEP_MS) + "ms into a held press (its ring lasts " + P.ringLife + "ms)");
    if (!(swept > 0.0005)) bad.push(f.name + " hardly answered the pointer (" + pct(swept) + " changed)");
    if (box.click && !(rang > 0.0005)) bad.push(f.name + " did not ring on a click (" + pct(rang) + " of the pixels beyond " + Math.round(far) + "px of it changed)");
    if (!r1.ok) bad.push(f.name + " not back at rest " + SETTLE_MS + "ms after the pointer left (" + (r1.took < 0 ? "still drawing" : pct(r1.left) + " differs") + ")");
    if (!r2.ok) bad.push(f.name + " not back at rest " + SETTLE_MS + "ms after a click (" + (r2.took < 0 ? "still drawing" : pct(r2.left) + " differs") + ")");
    await page.evaluate(() => window.__mc.drop("p-"));
  }
  const tested = plain.length - skipped.length;
  check(bad.length === 0 && tested > 0, `${key}: every dot field answers the pointer and a click and settles back exactly (${tested} field(s)${skipped.length ? ", " + skipped.length + " not on screen to test: " + skipped.join(", ") : ""}: ${seen.join("; ")})`, bad.length ? bad.slice(0, 4) : { tested, skipped });
}

/* ---------- (a) nothing moves under the pointer, a press or a click ---------- */
async function pointerStill(page, key) {
  await scrollTo(page, 0);
  await settle(page, "view");
  const n = await page.evaluate(() => window.__mc.baseline("view"));
  const during = [];
  let samples = 0;
  const sample = async tag => { const m = await page.evaluate(() => window.__mc.moved("view")); samples++; if (m.length) during.push(tag + ": " + m.slice(0, 3).join("; ")); };
  const { W, H, paths } = await page.evaluate(() => {
    const els = window.__mc.sets.view.filter(el => el.isConnected);
    const step = Math.max(1, Math.floor(els.length / 8));
    const paths = [];
    for (let i = 0; i < els.length && paths.length < 8; i += step) {
      const r = els[i].getBoundingClientRect(), y = Math.min(innerHeight - 3, Math.max(3, r.top + r.height / 2));
      // Across the element, and alongside it (just below), so the pointer passes over and near it.
      paths.push({ name: window.__mc.name(els[i]), x0: Math.max(2, r.left - 40), x1: Math.min(innerWidth - 2, r.right + 40), y, y2: Math.min(innerHeight - 3, r.bottom + 14) });
    }
    return { W: innerWidth, H: innerHeight, paths };
  });
  for (const [k, p] of paths.entries()) {
    await page.mouse.move(p.x0, p.y);
    await page.mouse.move(p.x1, p.y, { steps: 4 });
    await sample("across " + p.name);
    await page.mouse.move(p.x0, p.y2, { steps: 4 });
    await sample("beside " + p.name);
    if (k % 3 === 0) { await page.waitForTimeout(120); await sample("resting near " + p.name); }
  }
  for (const fy of [0.15, 0.45, 0.75]) {
    await page.mouse.move(6, H * fy);
    await page.mouse.move(W / 2, H * fy + 20, { steps: 8 });
    await sample("sweeping the screen at " + Math.round(H * fy) + "px");
    await page.mouse.move(W - 6, H * fy, { steps: 8 });
    await sample("sweeping the screen at " + Math.round(H * fy) + "px");
  }
  await page.mouse.move(6, 6);
  await page.mouse.move(W - 6, H - 6, { steps: 12 });
  await sample("diagonal sweep");
  check(during.length === 0, `${key}: nothing moves while the pointer sweeps over and near ${n} sampled elements (${samples} samples, 0.5px, transforms equal)`, during.slice(0, 4));

  // Press and release a few (their clicks cancelled: nothing navigates or opens).
  const presses = await page.evaluate(() => window.__mc.pressPick("view", 4));
  const pressed = [];
  await page.evaluate(() => { window.__mc.blocking = true; });
  try {
    for (const p of presses) {
      await page.mouse.move(p.x, p.y, { steps: 3 });
      await page.mouse.down();
      await page.waitForTimeout(140);
      const m1 = await page.evaluate(() => window.__mc.moved("view"));
      await page.mouse.up();
      await page.waitForTimeout(80);
      const m2 = await page.evaluate(() => window.__mc.moved("view"));
      if (m1.length) pressed.push("pressing " + p.name + ": " + m1.slice(0, 3).join("; "));
      if (m2.length) pressed.push("releasing " + p.name + ": " + m2.slice(0, 3).join("; "));
    }
  } finally { await page.evaluate(() => { window.__mc.blocking = false; }); }
  check(pressed.length === 0, `${key}: nothing moves while an element is pressed and released (${presses.length} press(es))`, pressed.slice(0, 4));

  // A click on empty space.
  const spot = await page.evaluate(() => window.__mc.empty());
  if (spot) {
    await page.mouse.click(spot.x, spot.y);
    await page.waitForTimeout(60);
    const m1 = await page.evaluate(() => window.__mc.moved("view"));
    await page.waitForTimeout(40);
    const clicked = await orangeShot(page);
    check(clicked.length === 0, key + ": no orange pixels right after a click", clicked.slice(0, 4));
    await page.waitForTimeout(350);
    const m2 = await page.evaluate(() => window.__mc.moved("view"));
    check(m1.length === 0 && m2.length === 0, `${key}: nothing moves after a click on empty space (at ${spot.x},${spot.y})`, m1.concat(m2).slice(0, 4));
  }

  // The pointer leaves: everything is exactly where it was.
  const park = await page.evaluate(() => window.__mc.empty());
  await page.mouse.move(park ? park.x : 2, park ? park.y : 2, { steps: 3 });
  await page.waitForTimeout(350);
  const after = await page.evaluate(() => window.__mc.moved("view"));
  check(after.length === 0, `${key}: once the pointer has gone, every sampled element keeps its box and its transform/translate/scale/rotate`, after.slice(0, 4));
}

/* ---------- (e) hover moves nothing ---------- */
/* ---------- reduced motion turned on after the page loaded: the dots go home and stop answering ---------- */
async function reducedLater(page, key) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const fields = await page.evaluate(() => window.__mc.fields());
  const changed = [];
  let n = 0;
  for (const f of fields.filter(f => f.mounted && f.shown && f.w > 0 && f.h > 0).slice(0, 2)) {
    const box = await page.evaluate(i => window.__mc.fieldBox(i, true), f.i);
    if (!box) continue;
    n++;
    await leave(page, box);
    await restSnap(page, f.i, "rl-rest", 0, 100);
    for (const fy of [0.35, 0.8]) {
      const y = box.top + (box.bottom - box.top) * fy;
      await page.mouse.move(box.left + 4, y);
      await page.mouse.move(box.right - 4, y, { steps: 6 });
    }
    if (box.click) { await page.mouse.click(box.click.x, box.click.y); await page.waitForTimeout(150); }
    const d = await snapDiff(page, f.i, "rl-now", "rl-rest", 0);
    if (d !== 0) changed.push(f.name + " " + pct(d) + " changed");
    await page.evaluate(() => window.__mc.drop("rl-"));
  }
  await page.emulateMedia({ reducedMotion: "no-preference" });
  check(n > 0 && changed.length === 0, `${key}: reduced motion turned on after load stills the dots at once (${n} field(s) unchanged under a sweep and a click)`, changed.length ? changed : { n });
}

async function hoverStill(page, key) {
  const bad = [];
  let total = 0, shot = null;
  for (const where of ["top", "middle"]) {
    if (where === "middle") {
      const room = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
      if (room < 300) break;
      await scrollTo(page, Math.round(room / 2));
    } else await scrollTo(page, 0);
    const list = await page.evaluate(n => window.__mc.hoverPick(n), where === "top" ? 4 : 2);
    if (!list.length) continue;
    await settle(page, "hover");
    const park = await page.evaluate(() => window.__mc.empty());
    await page.mouse.move(park ? park.x : 2, park ? park.y : 2, { steps: 2 });
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__mc.hoverBase());
    for (const [i, p] of list.entries()) {
      await page.mouse.move(p.x, p.y, { steps: 2 });
      await page.waitForTimeout(400);
      const d = await page.evaluate(i => window.__mc.hoverCheck(i), i);
      if (d.length) bad.push("hovering " + p.name + ": " + d.slice(0, 3).join("; "));
      total++;
      if (!shot) { shot = await orangeShot(page); check(shot.length === 0, `${key}: no orange pixels while the pointer rests on an element (${p.name})`, shot.slice(0, 4)); }
    }
  }
  check(bad.length === 0 && total > 0, `${key}: hovering ${total} link(s)/button(s) moves nothing (after 400ms each keeps its box and transform, and so do its children and their ::before/::after)`, bad.length ? bad.slice(0, 4) : { total });
}

/* ---------- (d) scroll reveal ---------- */
async function revealCheck(page, label) {
  const product = await page.evaluate(() => ["app-body", "v6-app"].some(c => document.body.classList.contains(c)));
  const state = () => page.evaluate(() => ({
    pending: window.InsidirMotion ? window.InsidirMotion.pending : -1,
    classed: [...document.querySelectorAll(".hf-pending,.hf-revealing")].map(el => el.tagName.toLowerCase() + "." + [...el.classList].slice(0, 3).join(".")).slice(0, 4),
    ever: [...(window.__hfEverPending || [])].map(el => el.tagName.toLowerCase() + "." + [...el.classList].filter(c => !/^hf-/.test(c)).slice(0, 2).join(".")).slice(0, 4)
  }));
  if (product) {
    // A product page holds nothing back: at load, all the way down, and at any moment in between.
    const load = await state();
    for (let i = 0; i < 40; i++) {
      const done = await page.evaluate(() => { const max = document.documentElement.scrollHeight - innerHeight; window.scrollTo({ top: Math.min(max, scrollY + Math.round(innerHeight * 0.85)), behavior: "instant" }); return scrollY >= max - 1; });
      await page.waitForTimeout(90);
      if (done) break;
    }
    await page.waitForTimeout(250);
    const end = await state();
    check(load.pending === 0 && !load.classed.length && end.pending === 0 && !end.classed.length && !end.ever.length,
      `${label}: product page holds nothing back (InsidirMotion.pending 0, no .hf-pending at load, after scrolling to the bottom, or at any moment)`, { load, end });
    return;
  }
  const at = await page.evaluate(SEL => {
    const off = window.__mc.off;
    const path = el => { const bits = []; for (let n = el, i = 0; n && n.nodeType === 1 && i < 3; i++, n = n.parentElement) bits.unshift(n.tagName.toLowerCase() + (n.id ? "#" + n.id : n.classList.length ? "." + [...n.classList].filter(c => !/^hf-/.test(c)).slice(0, 2).join(".") : "")); return bits.join(" > "); };
    const vh = innerHeight, expected = [...(window.__hfExpect || [])].filter(el => el.isConnected);
    const below = expected.filter(el => el.getBoundingClientRect().top >= vh * 0.93);
    const waiting = [...document.querySelectorAll(".hf-pending")];
    const offsets = waiting.map(off);
    return {
      tagged: document.querySelectorAll("[data-hf-reveal],[data-hf-reveal-group]>*").length, blocks: document.querySelectorAll(SEL).length,
      expected: expected.length, below: below.length,
      notPending: below.filter(el => !el.classList.contains("hf-pending")).map(path).slice(0, 4),
      visible: waiting.filter(el => parseFloat(getComputedStyle(el).opacity) >= 0.05).map(el => path(el) + " opacity " + getComputedStyle(el).opacity).slice(0, 4),
      maxOffset: offsets.length ? Math.max(...offsets) : 0,
      far: waiting.filter((el, i) => offsets[i] > 16).map((el, i) => path(el) + " " + offsets[i].toFixed(1) + "px").slice(0, 4),
      pending: window.InsidirMotion ? window.InsidirMotion.pending : -1
    };
  }, REVEAL_SEL);
  if (!at.expected) { check(true, `${label}: scroll reveal n/a (no block below the fold; ${at.tagged} tagged, ${at.blocks} with the footer)`); return; }
  check(at.notPending.length === 0 && at.visible.length === 0 && at.pending >= at.below, `${label}: ${at.below} block(s) below the fold wait (.hf-pending, opacity 0; ${at.tagged} tagged)`, at);
  check(at.maxOffset <= 16, `${label}: a waiting block is held at most 16px off its place (${at.maxOffset.toFixed(1)}px)`, at.far);
  // Down the page a viewport at a time: whatever is above 90% of the viewport is shown within 1.2s of reaching it.
  const late = [];
  let steps = 0, y = 0;
  for (;;) {
    const { h, vh } = await page.evaluate(() => ({ h: document.documentElement.scrollHeight, vh: innerHeight }));
    y = Math.min(Math.max(0, h - vh), y + Math.round(vh * 0.85));
    steps++;
    await scrollTo(page, y);
    const t0 = Date.now();
    let left;
    for (;;) {
      await page.waitForTimeout(100);
      left = await page.evaluate(SEL => {
        const off = window.__mc.off;
        const ever = window.__hfEverPending || new Set();
        return [...document.querySelectorAll(SEL)].filter(el => {
          if (el.closest("[hidden]")) return false;
          const r = el.getBoundingClientRect();
          if ((r.width === 0 && r.height === 0) || r.top >= innerHeight * 0.9) return false;
          if (el.classList.contains("hf-pending")) return true;
          // A block that waited is shown in full: opaque and back in its place.
          return ever.has(el) && (parseFloat(getComputedStyle(el).opacity) < 0.99 || off(el) > 0.5);
        }).map(el => el.tagName.toLowerCase() + "." + [...el.classList].filter(c => !/^hf-/.test(c)).slice(0, 2).join(".") +
          (el.classList.contains("hf-pending") ? " still pending" : " opacity " + getComputedStyle(el).opacity + ", " + off(el).toFixed(1) + "px off"));
      }, REVEAL_SEL);
      if (!left.length || Date.now() - t0 > 1200) break;
    }
    if (left.length) late.push(...left.map(l => l + " at scrollY " + y));
    if (y >= h - vh || steps > 80) break;
  }
  check(late.length === 0, `${label}: every block is shown within 1.2s of scrolling to it (opacity 1, no offset; ${steps} step(s))`, late.slice(0, 4));
  // At the bottom nothing is left waiting or mid-reveal.
  const t1 = Date.now();
  let end;
  for (;;) {
    end = await state();
    if ((end.pending === 0 && !end.classed.length) || Date.now() - t1 > 2500) break;
    await page.waitForTimeout(150);
  }
  check(end.pending === 0 && end.classed.length === 0, `${label}: at the bottom nothing is pending or mid-reveal`, end);
  const rose = await page.evaluate(() => window.__hfRose ? window.__hfRose.size : 0);
  check(rose >= 1, `${label}: blocks fade up into place (.hf-revealing, ${rose} revealed)`, rose);
}

try {
  for (const [key, path] of PAGES) {
    /* ---------- fine pointer, every block revealed at once ---------- */
    {
      const { context, page, errors } = await open(path);
      const s = await page.evaluate(() => ({
        motion: !!window.InsidirMotion && typeof window.InsidirMotion.revealAll === "function", engine: !!(window.InsidirHalftone && window.InsidirHalftone.mount),
        fields: window.__mc.fields(), footer: !!document.querySelector("footer.v13-footer--plain > .hwf-field")
      }));
      check(s.motion && s.engine, key + ": the motion layer (InsidirMotion) and the dot engine (InsidirHalftone) are loaded", { motion: s.motion, engine: s.engine });
      const drawn = s.fields.filter(f => f.mounted && f.w > 0 && f.h > 0);
      check(drawn.length >= 1 && s.fields.filter(f => f.shown).every(f => f.mounted && f.w > 0 && f.h > 0),
        `${key}: ${drawn.length} dot field(s) mounted and drawn${s.footer ? " (the footer strip included)" : ""}`, s.fields.map(f => ({ name: f.name, mounted: f.mounted, w: f.w, h: f.h })));
      if (key === "index") check(s.fields.some(f => f.hero && f.mounted), key + ": the hero wordmark is mounted");

      // The sample: the first screen, and elements across the whole page for the scroll (picked again once the
      // layout is still).
      await page.evaluate(() => window.__mc.pick("view", { view: true, max: 40 }));
      await settle(page, "view");
      const picked = await page.evaluate(() => ({ view: window.__mc.pick("view", { view: true, max: 40 }), across: window.__mc.pick("across", { view: false, max: 40 }) }));
      check(picked.view.n >= 3, `${key}: ${picked.view.n} elements sampled on the first screen (${picked.view.atoms} from the old atom list)`, picked.view);

      // Scroll first, before the pointer has ever moved over the page.
      await scrollStill(page, key, s.fields);
      await wordFields(page, key, s.fields);
      await plainFields(page, key, s.fields);
      await pointerStill(page, key);
      await hoverStill(page, key);
      await reducedLater(page, key);

      const w = await page.evaluate(() => ({ n: window.__hfWrites.n, at: window.__hfWrites.at,
        inline: [...document.querySelectorAll("[style]")].filter(el => /--hf-(dx|dy|s)\s*:/.test(el.getAttribute("style"))).map(el => el.tagName.toLowerCase() + "." + [...el.classList].slice(0, 2).join(".")).slice(0, 4) }));
      check(w.n === 0 && w.inline.length === 0, `${key}: nothing writes --hf-dx/--hf-dy/--hf-s during the visit (${w.n} write(s); none left inline)`, w);
      check(errors.length === 0, key + ": no script errors", errors);
      await context.close();
    }
    /* ---------- scroll reveal, as a reader meets it (no revealAll) ---------- */
    {
      const { context, page, errors } = await open(path, { reveal: false, oracle: true });
      await revealCheck(page, key + " 1440px");
      check(errors.length === 0, key + ": no script errors while revealing", errors);
      await context.close();
    }
    /* ---------- reduced motion: nothing waits, and the dots hold still ---------- */
    {
      const { context, page, errors } = await open(path, { reducedMotion: "reduce", reveal: false });
      const r0 = await page.evaluate(() => ({ pending: window.InsidirMotion ? window.InsidirMotion.pending : -1, classed: document.querySelectorAll(".hf-pending,.hf-revealing").length }));
      const fields = await page.evaluate(() => window.__mc.fields());
      const changed = [];
      let words = 0;
      for (const f of fields.filter(f => f.mounted && f.shown && f.w > 0 && f.h > 0).slice(0, 4)) {
        const box = await page.evaluate(i => window.__mc.fieldBox(i, true), f.i);
        if (!box) continue;
        words++;
        await page.mouse.move(box.out ? box.out.x : 2, box.out ? box.out.y : 2);
        await restSnap(page, f.i, "r-rest", 0);
        for (const fy of [0.85, 0.6]) {
          const yy = box.top + (box.bottom - box.top) * fy;
          await page.mouse.move(box.left + (box.right - box.left) * 0.15, yy);
          await page.mouse.move(box.left + (box.right - box.left) * 0.85, yy, { steps: 10 });
        }
        const d1 = await snapDiff(page, f.i, "r-on", "r-rest", 0);
        if (box.click) { await page.mouse.click(box.click.x, box.click.y); await page.waitForTimeout(150); }
        const d2 = await snapDiff(page, f.i, "r-click", "r-rest", 0);
        if (d1 !== 0 || d2 !== 0) changed.push(f.name + ": " + pct(d1) + " under the pointer, " + pct(d2) + " after a press");
        await page.evaluate(() => window.__mc.drop("r-"));
      }
      check(words > 0 && changed.length === 0, `${key}: reduced motion: every dot canvas holds still under the pointer and a press (${words})`, changed.length ? changed : { words });
      for (const f of [0.5, 1]) { await page.evaluate(f => window.scrollTo({ top: (document.documentElement.scrollHeight - innerHeight) * f, behavior: "instant" }), f); await page.waitForTimeout(250); }
      const r1 = await page.evaluate(() => ({ pending: window.InsidirMotion ? window.InsidirMotion.pending : -1, classed: document.querySelectorAll(".hf-pending,.hf-revealing").length }));
      check(r0.pending === 0 && r0.classed === 0 && r1.pending === 0 && r1.classed === 0, key + ": reduced motion: nothing waits to be revealed, at load or after scrolling", { load: r0, scrolled: r1 });
      check(errors.length === 0, key + ": no script errors with reduced motion", errors);
      await context.close();
    }
    /* ---------- phone ---------- */
    {
      const phoneReveal = !flag("no-phone-reveal");
      const { context, page, errors } = await open(path, { width: 390, touch: true, reveal: !phoneReveal, oracle: phoneReveal });
      const m = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, fields: [...document.querySelectorAll("[data-halftone-field],[data-halftone-hero]")].filter(f => f.__halftone).length }));
      check(m.overflow <= 1 && m.fields >= 1, key + ": 390px touch: no overflow, " + m.fields + " field(s)", m);
      if (phoneReveal) await revealCheck(page, key + " 390px");
      check(errors.length === 0, key + ": 390px: no script errors", errors);
      await context.close();
    }
  }
} finally { await browser.close(); server.close(); }

for (const p of passed) console.log("  ok   " + p);
for (const f of failed) console.log("  FAIL " + f);
console.log(`\nMotion check: ${passed.length} passed, ${failed.length} failed.`);
if (failed.length) process.exitCode = 1;
