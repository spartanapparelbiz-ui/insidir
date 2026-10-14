/* Insidir V13 palette audit: open every page in headless Chromium and report any computed
   colour that is not a blend of the three identity colours (#0c0c0b paper, #e9e4da ink,
   #e9762b warm) or one of the two direction colours over the paper (#2f996a up, #f94144 down),
   any orange glow (a shadow, filter, gradient or gradient-filled chart carrying the accent, or an
   orange pixel on the landing wordmark while the pointer pushes its dots), any serif or unexpected font family on visible text, horizontal overflow,
   uncaught browser errors, text whose WCAG contrast against its background falls below
   4.5:1 (3:1 for large text), raster images that are not retina-sharp (native pixels must be
   at least twice the rendered size), a landing hero whose halftone wordmark did not draw, a
   dotted wordmark on any other page, and a missing plain footer.

   Usage: node scripts/v13-palette-audit.mjs [--pages index,dashboard,...] [--widths 1440,390]
            [--json out.json] [--shots dir] [--no-fail] [--no-menus] [--tolerance 5]
   The /v1 API is mocked with small fixtures so every page renders its data states. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { serveStatic } from "../src/web.mjs";
import { chromium } from "playwright-core";

const args = process.argv.slice(2);
const flag = name => args.includes("--" + name);
const opt = (name, fallback) => { const i = args.indexOf("--" + name); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
const PALETTE = { bg: [12, 12, 11], ink: [233, 228, 218], warm: [233, 118, 43], up: [47, 153, 106], down: [249, 65, 68] };
const TOL = Number(opt("tolerance", 5));
const widths = opt("widths", "1440,390").split(",").map(Number);
const ALL_PAGES = [
  ["index", "/"], ["signin", "/signin.html"], ["signup", "/signup.html"], ["dashboard", "/dashboard.html"],
  ["research", "/research.html?ticker=AAPL"], ["explore", "/explore.html"], ["filings", "/filings.html"], ["filing", "/filing.html?accession=0000320193-26-000001"],
  ["watchlist", "/watchlist.html"], ["portfolio", "/portfolio.html"], ["alerts", "/alerts.html"], ["people", "/people.html"],
  ["account", "/account.html"], ["billing", "/billing.html"], ["company", "/company.html?ticker=AAPL"], ["company-picker", "/company.html"],
  ["pricing", "/pricing.html"], ["company-info", "/company-info.html"], ["terms", "/terms.html"], ["privacy", "/privacy.html"], ["404", "/no-such-page"],
  ["platform", "/platform.html"], ["why-insidir", "/why-insidir.html"], ["data", "/data.html"], ["subscribe", "/subscribe.html"], ["account-deleted", "/account-deleted.html"]
];
const wanted = opt("pages", "").split(",").filter(Boolean);
const pages = wanted.length ? ALL_PAGES.filter(([k]) => wanted.includes(k)) : ALL_PAGES;

/* ---------- API fixtures (mock only; production reads the real routes) ---------- */
const source = "https://www.sec.gov/Archives/edgar/data/320193/000032019326000077/aapl-report.htm";
const records = end => ["2021", "2022", "2023", "2024", "2025"].map((y, i) => ({ periodEnd: y + "-12-31", start: y + "-01-01", value: end(i), filedAt: (Number(y) + 1) + "-02-01", form: "10-K", sourceUrl: source }));
const ttmRow = (value, unit = "USD") => ({ value, unit, periodStart: "2025-07-01", periodEnd: "2026-06-30", basis: "ttm", sources: [source] });
const day = 86400000, start = Date.UTC(2025, 9, 14, 20);
const series = (n, stepMs, base) => Array.from({ length: n }, (_, i) => [start + i * stepMs, Math.round((base + i * .4 + Math.sin(i / 5) * 3) * 100) / 100]);
const filingItems = [
  { id: 1, accession: "0000320193-26-000001", ticker: "AAPL", issuer_name: "Apple Inc.", form_type: "4", published_at: "2026-09-14T20:00:00Z", source_url: source, is_amendment: false, created_at: "2026-09-14T21:00:00Z", reporting_owner: "COOK TIMOTHY D", transactions: [] },
  { id: 2, accession: "0001045810-26-000002", ticker: "NVDA", issuer_name: "NVIDIA CORP", form_type: "4", published_at: "2026-09-12T20:00:00Z", source_url: source, is_amendment: false, created_at: "2026-09-12T21:00:00Z", reporting_owner: "HUANG JEN HSUN", transactions: [] },
  { id: 3, accession: "0000789019-26-000003", ticker: "MSFT", issuer_name: "MICROSOFT CORP", form_type: "4/A", published_at: "2026-09-10T20:00:00Z", source_url: source, is_amendment: true, created_at: "2026-09-10T21:00:00Z", reporting_owner: "NADELLA SATYA", transactions: [] }
];
const transactionItems = [
  { id: 11, accession: "0000320193-26-000001", ticker: "AAPL", issuer_name: "Apple Inc.", owner_name: "COOK TIMOTHY D", owner_cik: "0001214156", transaction_date: "2026-09-12", transaction_code: "S", category: "reported_sale", shares: 12500, price: 26, estimated_value: 325000, published_at: "2026-09-14T20:00:00Z", source_url: source, filed_at: "2026-09-14" },
  { id: 12, accession: "0001045810-26-000002", ticker: "NVDA", issuer_name: "NVIDIA CORP", owner_name: "HUANG JEN HSUN", owner_cik: "0001049502", transaction_date: "2026-09-10", transaction_code: "P", category: "reported_purchase", shares: 1500, price: 28, estimated_value: 42000, published_at: "2026-09-12T20:00:00Z", source_url: source, filed_at: "2026-09-12" },
  { id: 13, accession: "0000789019-26-000003", ticker: "MSFT", issuer_name: "MICROSOFT CORP", owner_name: "NADELLA SATYA", owner_cik: "0001513142", transaction_date: "2026-09-08", transaction_code: "A", category: "reported_other", shares: 900, price: null, estimated_value: null, published_at: "2026-09-10T20:00:00Z", source_url: source, filed_at: "2026-09-10" }
];
const insiderPeople = transactionItems.map(t => ({ owner_name: t.owner_name, owner_cik: t.owner_cik, ticker: t.ticker, issuer_name: t.issuer_name, filings: 3, transactions: 3, last_transaction_date: t.transaction_date, created_at: t.published_at }));
function fixture(url, method) {
  const ticker = url.searchParams.get("ticker") || "AAPL";
  const company = ticker === "MSFT" ? "MICROSOFT CORP" : ticker === "NVDA" ? "NVIDIA CORP" : "Apple Inc.";
  const p = url.pathname;
  if (p === "/v1/intelligence") {
    const history = {};
    for (const [id, label, fn] of [["revenue", "Revenue", i => (i + 1) * 1e9], ["netIncome", "Net income", i => (i - 1) * 2e8], ["operatingIncome", "Operating income", i => (i + 1) * 4e8], ["operatingCashFlow", "Operating cash flow", i => (i + 1) * 3e8]]) history[id] = { label, unit: "USD", points: records(fn) };
    return { company: { ticker, name: company, cik: "0000320193" }, currency: "USD", profile: { exchange: "NASDAQ", headquarters: { label: "Cupertino, CA" }, industry: "Electronic Computers", fiscalYearEnd: "September 26" },
      facts: [{ id: "assets", label: "Reported total assets", value: 5e11, periodEnd: "2026-06-27", form: "10-Q", sourceUrl: source }], financialHistory: history,
      filings: [{ form: "10-K", headline: "Annual financial report", filedAt: "2026-02-01", reportDate: "2025-12-31", sourceUrl: source, accession: "0000320193-26-000001" }, { form: "10-Q", headline: "Quarterly financial report", filedAt: "2026-08-01", reportDate: "2026-06-30", sourceUrl: source, accession: "0000320193-26-000002" }, { form: "8-K", headline: "Company current report", filedAt: "2026-09-01", reportDate: "2026-08-31", sourceUrl: source, accession: "0000320193-26-000003", items: [{ code: "2.02", label: "Results of operations and financial condition" }] }],
      observations: [{ kind: "fact", label: "Revenue", value: 4.1e11, periodEnd: "2026-06-30", sourceUrl: source, text: "Reported revenue" }], findings: [], warnings: [], dataAsOf: new Date().toISOString(),
      ttm: { revenue: ttmRow(4.1e11), netIncome: ttmRow(1.1e11), operatingIncome: ttmRow(1.3e11), operatingCashFlow: ttmRow(1.2e11), eps: ttmRow(7.5, "USD/share") },
      balance: { asOf: "2026-06-27", currency: "USD", cashAndShortTermInvestments: 6e10, cash: 4e10, totalDebt: 9e10, sources: [source] },
      shares: { value: 1.5e10, asOf: "2026-07-17", method: "reported", sourceUrl: source }, transactions: transactionItems.filter(t => t.ticker === ticker) };
  }
  if (p === "/v1/market/chart") {
    const range = url.searchParams.get("range") || "1Y";
    const points = range === "1Y" ? series(250, day, 180) : range === "1D" ? series(78, 300000, 228) : series(60, day, 200);
    return { ticker, range, currency: "USD", exchange: "NasdaqGS", timezone: "America/New_York", price: points.at(-1)[1], previousClose: points.at(-1)[1] - 2, change: 2, changePercent: .9, marketTime: new Date(points.at(-1)[0]).toISOString(), marketState: "closed", rangeChange: 5, rangeChangePercent: 2, points, source: { name: "Yahoo Finance", url: "https://finance.yahoo.com/quote/" + ticker } };
  }
  if (p === "/v1/company/profile") return { ticker, matched: true, label: company, shortDescription: "American multinational technology company", founded: 1976, employees: { value: 164000, asOf: "2025-09-27" }, website: { url: "https://www.apple.com/", label: "apple.com" }, summary: { text: "Apple Inc. is an American multinational technology company. It designs consumer electronics. It also sells services.", url: "https://en.wikipedia.org/wiki/Apple_Inc.", license: "CC BY-SA 4.0" }, people: [], sources: [] };
  if (p === "/v1/company/insiders") return { company: { ticker, cik: "0000320193" }, activity: [
    { accession: "a1", form: "4", filedAt: "2026-09-14", transactionDate: "2026-09-12", owner: { name: "COOK TIMOTHY D", cik: "12345", role: "Chief Executive Officer · Director" }, kind: "sale", code: "S", codeLabel: "Open-market sale", netShares: -12500, value: 325000, sharesAfter: 3000000, transactions: [], sourceUrl: source },
    { accession: "a2", form: "4", filedAt: "2026-07-09", transactionDate: "2026-07-07", owner: { name: "OTHER PUBLIC FILER", cik: "67890", role: "Director" }, kind: "purchase", code: "P", codeLabel: "Open-market purchase", netShares: 1500, value: 42000, sharesAfter: 9000, transactions: [], sourceUrl: source }],
    people: [{ name: "COOK TIMOTHY D", cik: "12345", role: "Chief Executive Officer · Director", filings: 1, lastFiled: "2026-09-14", sharesAfter: 3000000 }] };
  if (p === "/v1/company/news") return { announcements: [{ title: "Results of operations and financial condition", form: "8-K", filedAt: "2026-09-01", url: source, earnings: true }], headlines: [], headlinesAvailable: true };
  if (p === "/v1/me/watchlist") return method === "POST" ? { saved: true } : { items: [{ ticker: "AAPL", created_at: "2026-09-01T00:00:00Z" }, { ticker: "NVDA", created_at: "2026-08-01T00:00:00Z" }] };
  if (p === "/v1/me") return { user: { email: "reader@example.com", id: 1, created_at: "2026-01-01T00:00:00Z" }, access: { active: true, plan: "pro", status: "active", billingEnabled: true, complimentary: false, currentPeriodEnd: "2026-11-14T00:00:00Z" } };
  if (p === "/v1/me/research-decisions") return method === "POST" ? { saved: true } : { items: [{ ticker: "AAPL", review_status: "researching", reviewStatus: "researching", notes: "Reading the latest 10-K before deciding.", created_at: "2026-09-02T00:00:00Z", updated_at: "2026-09-02T00:00:00Z" }] };
  if (p === "/v1/me/people") return { items: insiderPeople.slice(0, 1) };
  if (p === "/v1/me/alerts") return { items: [] };
  if (p === "/v1/me/manual-holdings") return { items: [{ id: 1, ticker: "AAPL", quantity: 12.5, created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z" }] };
  if (p === "/v1/me/brokerage/status") return { enabled: false, connected: false, provider: "snaptrade" };
  if (p === "/v1/me/brokerage/portfolio") return { accounts: [], holdings: [] };
  if (p === "/v1/billing/status") return { billingEnabled: true, plan: "pro", subscriptionStatus: "active", currentPeriodEnd: "2026-11-14T00:00:00Z" };
  if (p === "/v1/status") return { ok: true, filings: filingItems.length, transactions: transactionItems.length, latest_published_at: filingItems[0].published_at };
  if (p.startsWith("/v1/filings/")) return { ...filingItems[0], transactions: transactionItems.filter(t => t.ticker === "AAPL") };
  if (p === "/v1/filings") return { items: filingItems, total: filingItems.length };
  if (p === "/v1/transactions") return { items: transactionItems, total: transactionItems.length };
  if (p === "/v1/companies") return { items: filingItems.map(f => ({ ticker: f.ticker, issuer_name: f.issuer_name, name: f.issuer_name, last_filing_at: f.published_at, filings: 2 })), total: 3 };
  if (p === "/v1/insiders") return { items: insiderPeople, total: insiderPeople.length };
  if (p === "/v1/search") return { items: [{ ticker: "AAPL", name: "Apple Inc." }] };
  if (p === "/v1/purchases" || p === "/v1/sales") return { items: transactionItems };
  return null;
}

/* ---------- in-page scan ---------- */
const scan = ({ palette, tol }) => {
  const parse = s => { const m = /rgba?\(([^)]+)\)/.exec(s || ""); if (!m) return null; const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const bg = palette.bg, ink = palette.ink, warm = palette.warm;
  const u = [ink[0] - bg[0], ink[1] - bg[1], ink[2] - bg[2]], v = [warm[0] - bg[0], warm[1] - bg[1], warm[2] - bg[2]];
  // Least-squares coefficients for colour = bg + t·(ink−bg) + c·(warm−bg); the colour is in the
  // palette when the residual is small and both coefficients sit in [0, 1].
  const uu = u[0] * u[0] + u[1] * u[1] + u[2] * u[2], vv = v[0] * v[0] + v[1] * v[1] + v[2] * v[2], uv = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const det = uu * vv - uv * uv;
  // Market direction: green for purchases and rises, red for sales and falls, at any strength over the paper.
  const onDirection = c => [palette.up, palette.down].some(d => {
    const dv = [d[0] - bg[0], d[1] - bg[1], d[2] - bg[2]], w = [c.r - bg[0], c.g - bg[1], c.b - bg[2]];
    const t = (w[0] * dv[0] + w[1] * dv[1] + w[2] * dv[2]) / (dv[0] * dv[0] + dv[1] * dv[1] + dv[2] * dv[2]);
    return t >= -0.03 && t <= 1.03 && Math.hypot(w[0] - t * dv[0], w[1] - t * dv[1], w[2] - t * dv[2]) <= tol;
  });
  const inPalette = c => {
    if (!c || c.a <= 0.3) return true;
    if (onDirection(c)) return true;
    const w = [c.r - bg[0], c.g - bg[1], c.b - bg[2]];
    const wu = w[0] * u[0] + w[1] * u[1] + w[2] * u[2], wv = w[0] * v[0] + w[1] * v[1] + w[2] * v[2];
    const t = (wu * vv - wv * uv) / det, k = (wv * uu - wu * uv) / det;
    const fit = [bg[0] + t * u[0] + k * v[0], bg[1] + t * u[1] + k * v[1], bg[2] + t * u[2] + k * v[2]];
    const res = Math.hypot(c.r - fit[0], c.g - fit[1], c.b - fit[2]);
    return res <= tol && t >= -0.03 && t <= 1.03 && k >= -0.02 && k <= 1.03 && t + k <= 1.05;
  };
  const path = el => { const bits = []; let n = el; for (let i = 0; n && n.nodeType === 1 && i < 4; i++, n = n.parentElement) { let s = n.tagName.toLowerCase(); if (n.id) s += "#" + n.id; else if (n.classList.length) s += "." + [...n.classList].slice(0, 3).join("."); bits.unshift(s); } return bits.join(" > "); };
  const leaks = new Map(), fonts = new Map(), contrastMap = new Map();
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const over = (top, a, under) => ({ r: top.r * a + under.r * (1 - a), g: top.g * a + under.g * (1 - a), b: top.b * a + under.b * (1 - a), a: 1 });
  // Effective background: walk up to the first opaque background-color, compositing translucent
  // layers on the way. Elements over background images are skipped (judged by eye instead).
  const backdrop = el => {
    const layers = []; let n = el, base = { r: bg[0], g: bg[1], b: bg[2], a: 1 }, opacity = 1;
    while (n && n.nodeType === 1) {
      const cs = getComputedStyle(n);
      if (n !== el) opacity *= Number(cs.opacity) || 1;
      if (cs.backgroundImage && cs.backgroundImage !== "none" && /url\(/.test(cs.backgroundImage)) return null;
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { if (c.a >= 0.95) { base = c; break; } layers.push(c); }
      n = n.parentElement;
    }
    let col = base; for (const l of layers.reverse()) col = over(l, l.a, col);
    return { col, opacity };
  };
  const addContrast = (el, cs, ratioValue, need, text, back) => {
    const key = cs.color + " on " + back + " " + Math.round(ratioValue * 10) / 10;
    const e = contrastMap.get(key) || { color: cs.color, background: back, ratio: Math.round(ratioValue * 100) / 100, needed: need, count: 0, examples: [], sample: "" };
    e.count++; if (e.examples.length < 3) e.examples.push(path(el)); if (!e.sample) e.sample = text.slice(0, 40); contrastMap.set(key, e);
  };
  // Nothing glows: no shadow, filter, gradient or gradient-filled SVG may carry the warm accent.
  const warmOf = c => {
    if (!c || c.a <= 0.02) return 0;
    const w = [c.r - bg[0], c.g - bg[1], c.b - bg[2]];
    const wu = w[0] * u[0] + w[1] * u[1] + w[2] * u[2], wv = w[0] * v[0] + w[1] * v[1] + w[2] * v[2];
    return (wv * uu - wu * uv) / det;
  };
  const glows = new Map();
  const addGlow = (prop, value, el) => { const key = prop + " = " + value; const e = glows.get(key) || { prop, value: value.slice(0, 90), count: 0, examples: [] }; e.count++; if (e.examples.length < 3) e.examples.push(path(el)); glows.set(key, e); };
  const glowCheck = (cs, el, suffix) => {
    for (const prop of ["boxShadow", "textShadow", "filter", "backgroundImage"]) {
      const val = cs[prop];
      if (!val || val === "none" || (prop === "backgroundImage" && !/gradient\(/.test(val))) continue;
      if ((val.match(/rgba?\([^)]+\)/g) || []).some(m => warmOf(parse(m)) > 0.1)) addGlow(prop.replace(/[A-Z]/g, ch => "-" + ch.toLowerCase()) + suffix, val, el);
    }
  };
  const add = (prop, value, el) => { const key = prop + " = " + value; const e = leaks.get(key) || { prop, value, count: 0, examples: [] }; e.count++; if (e.examples.length < 3) e.examples.push(path(el)); leaks.set(key, e); };
  const SKIP = new Set(["CANVAS", "IMG", "VIDEO", "IFRAME", "SCRIPT", "STYLE", "NOSCRIPT", "LINK", "META", "HEAD", "TITLE", "BR", "WBR", "SOURCE", "PICTURE", "TEMPLATE"]);
  const allowedFonts = /^"?JetBrains Mono"?/i;
  for (const el of document.querySelectorAll("body *")) {
    if (SKIP.has(el.tagName)) continue;
    if (el.closest("canvas,[hidden],template")) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim());
    if (hasText) {
      const c = parse(cs.color); if (!inPalette(c)) add("color", cs.color, el);
      const bd = c ? backdrop(el) : null;
      if (bd && (Number(cs.opacity) || 1) * bd.opacity * c.a >= 0.35) {
        const eff = over(c, Math.min(1, c.a * (Number(cs.opacity) || 1) * bd.opacity), bd.col);
        const size = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight, 10) || 400;
        const need = size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5;
        const rv = ratio(eff, bd.col);
        if (rv < need) addContrast(el, cs, rv, need, [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.nodeValue.trim()).join(" "), `rgb(${Math.round(bd.col.r)}, ${Math.round(bd.col.g)}, ${Math.round(bd.col.b)})`);
      }
      const fam = cs.fontFamily; const first = fam.split(",")[0].trim();
      if (!allowedFonts.test(first)) { const e = fonts.get(fam) || { fontFamily: fam, count: 0, examples: [] }; e.count++; if (e.examples.length < 3) e.examples.push(path(el)); fonts.set(fam, e); }
      if (cs.textDecorationLine && cs.textDecorationLine !== "none") { const d = parse(cs.textDecorationColor); if (!inPalette(d)) add("text-decoration-color", cs.textDecorationColor, el); }
    }
    const bgc = parse(cs.backgroundColor); if (!inPalette(bgc)) add("background-color", cs.backgroundColor, el);
    for (const side of ["Top", "Right", "Bottom", "Left"]) {
      if (parseFloat(cs["border" + side + "Width"]) > 0 && cs["border" + side + "Style"] !== "none") { const bc = parse(cs["border" + side + "Color"]); if (!inPalette(bc)) add("border-" + side.toLowerCase() + "-color", cs["border" + side + "Color"], el); }
    }
    if (parseFloat(cs.outlineWidth) > 0 && cs.outlineStyle !== "none") { const oc = parse(cs.outlineColor); if (!inPalette(oc)) add("outline-color", cs.outlineColor, el); }
    if (cs.backgroundImage && cs.backgroundImage !== "none" && !/url\(/.test(cs.backgroundImage)) {
      for (const m of cs.backgroundImage.match(/rgba?\([^)]+\)/g) || []) { const gc = parse(m); if (!inPalette(gc)) { add("background-image", m, el); break; } }
    }
    if (cs.boxShadow && cs.boxShadow !== "none") { for (const m of cs.boxShadow.match(/rgba?\([^)]+\)/g) || []) { const sc = parse(m); if (sc && sc.a > 0.3 && !inPalette(sc)) { add("box-shadow", m, el); break; } } }
    glowCheck(cs, el, "");
    if (el instanceof SVGElement && /^url\(/.test(cs.fill || "")) {
      const id = (/url\("?#([^")]+)"?\)/.exec(cs.fill) || [])[1], grad = id && document.getElementById(id);
      if (grad && [...grad.querySelectorAll("stop")].some(st => { const sc = getComputedStyle(st); return Number(sc.stopOpacity) > 0.02 && warmOf(parse(sc.stopColor)) > 0.1; })) addGlow("svg-gradient-fill", "#" + id, el);
    }
    if (el instanceof SVGElement && /^(path|circle|rect|line|polyline|polygon|ellipse|text|use|g)$/i.test(el.tagName)) {
      for (const prop of ["fill", "stroke"]) { const val = cs[prop]; if (!val || val === "none" || /^url\(/.test(val)) continue; const pc = parse(val); if (pc && !inPalette(pc)) add("svg-" + prop, val, el); }
    }
  }
  for (const pe of ["::before", "::after"]) for (const el of document.querySelectorAll("body, body *")) {
    if (SKIP.has(el.tagName)) continue; const cs = getComputedStyle(el, pe); if (cs.content === "none" || cs.display === "none") continue;
    const c = parse(cs.backgroundColor); if (!inPalette(c)) add("background-color" + pe, cs.backgroundColor, el);
    const t = parse(cs.color); if (cs.content !== '""' && cs.content !== "normal" && !inPalette(t)) add("color" + pe, cs.color, el);
    glowCheck(cs, el, pe);
  }
  // Raster images must be retina-sharp: native pixels ≥ 2× the rendered CSS size (cover-adjusted).
  const blurry = [];
  for (const img of document.images) {
    const r = img.getBoundingClientRect(), cs = getComputedStyle(img);
    if (r.width < 2 || cs.display === "none" || cs.visibility === "hidden" || /\.svg(\?|$)/i.test(img.currentSrc) || !img.naturalWidth) continue;
    if (/^data:image\/svg/.test(img.currentSrc)) continue;
    const scale = cs.objectFit === "cover" ? Math.max(r.width / img.naturalWidth, r.height / img.naturalHeight) : Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
    if (scale * 2 > 1.0001) blurry.push({ src: img.currentSrc.split("/").pop().slice(0, 60), rendered: Math.round(r.width) + "x" + Math.round(r.height), natural: img.naturalWidth + "x" + img.naturalHeight, upscaleAt2x: +(scale * 2).toFixed(2), element: path(img) });
  }
  for (const el of document.querySelectorAll("body *")) {
    const bgi = getComputedStyle(el).backgroundImage;
    if (bgi && /url\(.*\.(jpe?g|png|webp)/i.test(bgi)) { const r = el.getBoundingClientRect(); if (r.width > 2) blurry.push({ src: bgi.slice(0, 80), rendered: Math.round(r.width) + "x" + Math.round(r.height), natural: "css background photo (use an <img> with a sharp source)", upscaleAt2x: null, element: path(el) }); }
  }
  const hal = document.querySelector("[data-halftone-hero],[data-halftone-footer]");
  const halCanvas = hal ? hal.querySelector("canvas") : null;
  const fr = halCanvas ? halCanvas.getBoundingClientRect() : null;
  return {
    leaks: [...leaks.values()].sort((a, b) => b.count - a.count),
    glows: [...glows.values()].sort((a, b) => b.count - a.count),
    fonts: [...fonts.values()].sort((a, b) => b.count - a.count),
    contrast: [...contrastMap.values()].sort((a, b) => b.count - a.count),
    blurry,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    bodyBackground: getComputedStyle(document.body).backgroundColor,
    bodyClass: document.body.className,
    halftone: hal ? { kind: hal.hasAttribute("data-halftone-hero") ? "hero" : "footer", width: fr ? Math.round(fr.width) : 0, height: fr ? Math.round(fr.height) : 0, mounted: !!hal.__halftone } : null,
    plainFooter: !!document.querySelector("footer.v13-footer--plain .hwf-top"),
    hasV13: !!document.querySelector('link[href*="v13-halftone.css"]') && !!document.querySelector('script[src*="v13-halftone.js"]'),
    title: document.title
  };
};

/* The dotted wordmark must stay ink while the pointer pushes its dots and after a click
   sends a ring through it: count orange pixels on the hero canvas at the worst moment. */
async function wordmarkGlow(page) {
  const box = await page.evaluate(() => { const c = document.querySelector("[data-halftone-hero] canvas"); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, bottom: Math.min(r.bottom, innerHeight) }; });
  if (!box || box.w < 10) return 0;
  const count = () => page.evaluate(() => { const c = document.querySelector("[data-halftone-hero] canvas"); const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let k = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i] - d[i + 2] > 60 && d[i + 1] < d[i] - 30) k++; return k; });
  const y = box.bottom - Math.min(60, (box.bottom - box.y) / 3);
  let worst = 0;
  for (let i = 0; i <= 24; i++) await page.mouse.move(box.x + 20 + i * (box.w - 40) / 24, y, { steps: 2 });
  worst = Math.max(worst, await count());
  await page.mouse.click(box.x + box.w / 2, y);
  await page.waitForTimeout(120);
  worst = Math.max(worst, await count());
  await page.mouse.move(0, 0);
  await page.waitForTimeout(200);
  return worst;
}

/* ---------- run ---------- */
const server = createServer((req, res) => { serveStatic(req, res).then(found => { if (!found) { res.writeHead(404); res.end("not found"); } }).catch(e => { res.writeHead(500); res.end(String(e)); }); });
await new Promise(ok => server.listen(0, "127.0.0.1", ok));
const base = "http://127.0.0.1:" + server.address().port;
const shots = opt("shots", "");
if (shots) await mkdir(shots, { recursive: true });
const report = { tolerance: TOL, pages: [] };
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN || "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: 1, isMobile: width < 600, hasTouch: width < 600 });
    // Tools that measure the page see every scroll-reveal block in place (v13-motion.js holds blocks below the fold back until they scroll in).
    await context.addInitScript(() => addEventListener("DOMContentLoaded", () => setTimeout(() => window.InsidirMotion && window.InsidirMotion.revealAll(), 0)));
    await context.route("**/v1/**", async route => {
      const url = new URL(route.request().url());
      const body = fixture(url, route.request().method());
      if (body !== null) await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      else await route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"not mocked"}' });
    });
    await context.route(/upload\.wikimedia\.org|thumb\.wikimedia\.org/, route => route.fulfill({ status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#777"/></svg>' }));
    for (const [key, path] of pages) {
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", e => errors.push(String(e)));
      page.on("console", m => { if (m.type() === "error" && !/favicon|404|Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
      const entry = { page: key, path, width, errors };
      try {
        await page.goto(base + path, { waitUntil: "networkidle", timeout: 30000 }).catch(() => page.goto(base + path, { waitUntil: "domcontentloaded", timeout: 30000 }));
        await page.evaluate(() => document.fonts && document.fonts.ready);
        await page.waitForTimeout(900);
        await page.evaluate(async () => { window.scrollTo(0, document.body.scrollHeight); await new Promise(r => setTimeout(r, 250)); window.scrollTo(0, 0); });
        await page.waitForTimeout(250);
        Object.assign(entry, await page.evaluate(scan, { palette: PALETTE, tol: TOL }));
        if (key === "index") entry.canvasGlow = await wordmarkGlow(page);
        if (shots) await page.screenshot({ path: join(shots, `${key}-${width}.png`), fullPage: true });
        if (!flag("no-menus")) {
          const toggles = ["#v6-menu-button", ".app-menu-btn", ".user-menu__btn", ".site-nav__menu"];
          const opened = [];
          for (const sel of toggles) { const el = page.locator(sel).first(); if (await el.count() && await el.isVisible()) { await el.click({ force: true }).catch(() => {}); opened.push(sel); } }
          if (opened.length) {
            await page.waitForTimeout(350);
            const withMenus = await page.evaluate(scan, { palette: PALETTE, tol: TOL });
            entry.menuState = { opened, leaks: withMenus.leaks.filter(l => !entry.leaks.some(x => x.prop === l.prop && x.value === l.value)), glows: withMenus.glows.filter(g => !entry.glows.some(x => x.prop === g.prop && x.value === g.value)), overflow: withMenus.overflow };
            if (shots) await page.screenshot({ path: join(shots, `${key}-${width}-menus.png`), fullPage: false });
          }
        }
      } catch (e) { entry.failure = String(e && e.message || e); }
      report.pages.push(entry);
      await page.close();
    }
    await context.close();
  }
} finally { await browser?.close(); await new Promise(ok => server.close(ok)); }

/* ---------- summary ---------- */
let total = 0;
for (const p of report.pages) {
  const menuLeaks = p.menuState ? p.menuState.leaks.length : 0;
  const n = (p.leaks ? p.leaks.length : 0) + menuLeaks, lc = p.contrast ? p.contrast.length : 0, bl = p.blurry ? p.blurry.length : 0;
  total += bl;
  // The dotted wordmark belongs to the landing page's first screen only; every page needs the plain footer.
  const halftoneNote = p.failure ? "" : p.page === "index"
    ? (p.halftone && p.halftone.kind === "hero" && p.halftone.mounted && p.halftone.width > 0 ? "" : ", HALFTONE HERO MISSING")
    : (p.halftone ? ", UNEXPECTED HALFTONE WORDMARK (landing hero only)" : "");
  const footerNote = p.failure || p.plainFooter ? "" : ", PLAIN FOOTER MISSING";
  const glowCount = (p.glows ? p.glows.length : 0) + (p.menuState && p.menuState.glows ? p.menuState.glows.length : 0) + (p.canvasGlow > 0 ? 1 : 0);
  total += glowCount;
  total += n + lc + (p.fonts ? p.fonts.length : 0) + p.errors.length + (p.failure ? 1 : 0) + (p.overflow > 4 ? 1 : 0) + (halftoneNote ? 1 : 0) + (footerNote ? 1 : 0) + (p.hasV13 === false ? 1 : 0);
  const status = p.failure ? "FAILED " + p.failure : `${n} off-palette value${n === 1 ? "" : "s"}, ${lc} low-contrast, ${bl} blurry image(s), ${p.fonts ? p.fonts.length : 0} font issue(s), overflow ${p.overflow}px, ${p.errors.length} error(s)` + (p.hasV13 ? "" : ", v13 assets missing") + halftoneNote + footerNote;
  console.log(`[${p.width}px] ${p.page.padEnd(14)} ${status}`);
  if (glowCount) console.log(`    ${glowCount} ORANGE GLOW(S): nothing on the site may glow`);
  for (const g of [...(p.glows || []), ...(p.menuState && p.menuState.glows || [])]) console.log(`    glow ${g.prop.padEnd(22)} ${g.value.slice(0, 70)} ×${g.count}  e.g. ${g.examples[0]}`);
  if (p.canvasGlow > 0) console.log(`    glow halftone wordmark: ${p.canvasGlow} orange pixels while the pointer pushes the dots`);
  for (const l of (p.leaks || []).slice(0, 12)) console.log(`    ${l.prop.padEnd(24)} ${l.value.padEnd(26)} ×${l.count}  e.g. ${l.examples[0]}`);
  if (p.leaks && p.leaks.length > 12) console.log(`    … ${p.leaks.length - 12} more (see --json)`);
  for (const l of (p.menuState ? p.menuState.leaks : []).slice(0, 6)) console.log(`    [menu open] ${l.prop.padEnd(12)} ${l.value.padEnd(26)} ×${l.count}  e.g. ${l.examples[0]}`);
  for (const c of (p.contrast || []).slice(0, 10)) console.log(`    contrast ${c.ratio}:1 (needs ${c.needed}) ${c.color} on ${c.background} ×${c.count}  "${c.sample}"  e.g. ${c.examples[0]}`);
  if (p.contrast && p.contrast.length > 10) console.log(`    … ${p.contrast.length - 10} more low-contrast (see --json)`);
  for (const b of p.blurry || []) console.log(`    BLURRY ${b.src} rendered ${b.rendered} natural ${b.natural} upscale@2x ${b.upscaleAt2x}  e.g. ${b.element}`);
  for (const f of p.fonts || []) console.log(`    font ${f.fontFamily.slice(0, 60)} ×${f.count}  e.g. ${f.examples[0]}`);
  for (const e of p.errors) console.log(`    error ${e.slice(0, 160)}`);
}
console.log(`\n${total === 0 ? "CLEAN" : total + " finding(s)"} across ${report.pages.length} page renders (tolerance ${TOL}).`);
if (opt("json", "")) await writeFile(opt("json", ""), JSON.stringify(report, null, 1));
if (total > 0 && !flag("no-fail")) process.exitCode = 1;
