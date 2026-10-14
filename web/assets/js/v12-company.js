/* Insidir company report (V12): one page design for every SEC-listed company.
 * Prices come from the delayed market-data endpoint; fundamentals, filings and insider
 * activity from SEC EDGAR/XBRL; profile facts from Wikidata and Wikipedia. Calculated
 * figures (market cap, enterprise value, P/E) show their inputs on hover. Nothing is invented:
 * when a source has no value the page says so. */
(() => {
"use strict";
const $ = id => document.getElementById(id);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const finite = v => typeof v === "number" && Number.isFinite(v);
const RANGES = ["1D", "1W", "1M", "3M", "1Y", "5Y"];
const TABS = ["overview", "financials", "filings", "insiders", "people", "news"];
const EXT = '<svg class="cx-ext" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';
// Brand casing the SEC and Wikidata names don't carry.
const BRAND_NAMES = Object.freeze({ NVDA: "NVIDIA" });
const POPULAR = [["NVDA", "NVIDIA"], ["AAPL", "Apple"], ["MSFT", "Microsoft"], ["GOOGL", "Alphabet"], ["AMZN", "Amazon"], ["META", "Meta Platforms"],
  ["TSLA", "Tesla"], ["AVGO", "Broadcom"], ["JPM", "JPMorgan Chase"], ["LLY", "Eli Lilly"], ["V", "Visa"], ["WMT", "Walmart"],
  ["XOM", "Exxon Mobil"], ["KO", "Coca-Cola"], ["NFLX", "Netflix"], ["COST", "Costco"]];

const state = { seq: 0, ticker: "", range: "1Y", intel: null, intelError: null, profile: null, profileDone: false, insiders: null, insidersError: null,
  news: null, newsLoading: false, market: {}, marketError: null, watch: null, photos: null, annualMetric: "revenue", filingFilter: "all", insiderFilter: "all", hover: null };

/* ---------- formatting ---------- */
const symbolFor = currency => currency && currency !== "USD" ? currency + " " : "$";
function money(n, currency = "USD", { precise = false } = {}) {
  if (!finite(n)) return "—";
  const sign = n < 0 ? "−" : "", a = Math.abs(n), s = symbolFor(currency);
  if (precise) return sign + s + a.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const units = [[1e12, "T", 2], [1e9, "B", 1], [1e6, "M", 1], [1e3, "K", 0]];
  for (const [size, suffix, digits] of units) if (a >= size) return sign + s + (a / size).toFixed(digits) + suffix;
  return sign + s + a.toLocaleString("en-US", { maximumFractionDigits: 0 });
}
const integer = n => finite(n) ? Math.round(n).toLocaleString("en-US") : "—";
const signed = n => !finite(n) ? "—" : (n > 0 ? "+" : n < 0 ? "−" : "") + Math.round(Math.abs(n)).toLocaleString("en-US");
const compactShares = n => {
  if (!finite(n)) return "—";
  const a = Math.abs(n);
  return a >= 1e9 ? (a / 1e9).toFixed(2) + "B" : a >= 1e6 ? (a / 1e6).toFixed(1) + "M" : a >= 1e3 ? (a / 1e3).toFixed(1) + "K" : String(Math.round(a));
};
const UTC = { timeZone: "UTC" };
function day(iso) {
  if (!iso) return "—";
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + "T00:00:00Z" : iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", ...UTC });
}
function ago(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 60) return Math.max(1, mins) + "m ago";
  if (mins < 1440) return Math.round(mins / 60) + "h ago";
  if (mins < 10080) return Math.round(mins / 1440) + "d ago";
  return day(iso);
}
const safeUrl = (url, hosts) => {
  try {
    const u = new URL(String(url));
    if (!/^https?:$/.test(u.protocol) || u.username || u.password) return "";
    if (hosts && !hosts.some(h => u.hostname === h || u.hostname.endsWith("." + h))) return "";
    return u.href;
  } catch { return ""; }
};
const secUrl = url => safeUrl(url, ["sec.gov"]);
const titleCase = s => String(s || "").toLowerCase().replace(/(^|[\s\-'(/&.])([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace(/\bMc([a-z])/g, (m, c) => "Mc" + c.toUpperCase());
const ENTITY = /\b(INC|LLC|L\.?L\.?C|LP|L\.P|LTD|CORP|CORPORATION|CO|COMPANY|TRUST|FUND|FUNDS|CAPITAL|PARTNERS|HOLDINGS|GROUP|FOUNDATION|BANK|ASSOCIATES|MANAGEMENT|ADVISORS|INVESTMENTS|N\.?V|S\.?A|PLC|AG|SE|LIMITED|VENTURES|ESTATE)\b|&/i;
/* SEC owner names are "LAST FIRST MIDDLE"; show "First Middle Last". */
function displayName(raw, { short = false } = {}) {
  const name = String(raw || "").replace(/\s+/g, " ").trim();
  if (!name) return "Reporting person";
  if (ENTITY.test(name)) return /[a-z]/.test(name) ? name : titleCase(name);
  const parts = name.replace(/,/g, " ").split(" ").filter(Boolean);
  if (parts.length < 2) return /[a-z]/.test(name) ? name : titleCase(name);
  const suffix = /^(JR|SR|II|III|IV|V)\.?$/i.test(parts.at(-1)) ? parts.pop() : "";
  // A surname particle ("ten Bosch", "VAN DYKE", "de la Rosa") stays with the surname.
  let n = 1;
  while (n < parts.length - 1 && /^(van|von|de|der|den|ten|ter|da|di|del|della|la|le|du|dos|das|st\.?)$/i.test(parts[n - 1])) n++;
  const last = parts.slice(0, n).join(" "), rest = parts.slice(n);
  // Particles keep the filer's case: "ten Bosch" stays lower case, "VAN DYKE" becomes "Van Dyke".
  const fix = t => t.split(" ").map(w => /^[a-z]+$/.test(w) ? w : fix1(w)).join(" ");
  const fix1 = t => /^[A-Za-z]\.?$/.test(t) ? t.charAt(0).toUpperCase() + "." : /[a-z]/.test(t) && /[A-Z]/.test(t) ? t : titleCase(t);
  const given = short && rest.length > 1 ? rest.filter((t, i) => i === 0 || !/^[A-Za-z]\.?$/.test(t)) : rest;
  return [...given.map(fix), fix(last), suffix ? (/^(II|III|IV|V)$/i.test(suffix) ? suffix.toUpperCase() : titleCase(suffix.replace(/\.$/, "")) + ".") : ""].filter(Boolean).join(" ");
}
const ROLE_SHORT = [[/chief executive officer/gi, "CEO"], [/chief financial officer/gi, "CFO"], [/chief operating officer/gi, "COO"],
  [/chief technology officer/gi, "CTO"], [/chief accounting officer/gi, "CAO"], [/chief legal officer/gi, "CLO"], [/chief marketing officer/gi, "CMO"],
  [/executive vice president/gi, "EVP"], [/senior vice president/gi, "SVP"], [/vice president/gi, "VP"], [/\band\b/gi, "&"]];
function shortRole(role) {
  if (!role) return "Reporting owner";
  const first = role.split(" · ")[0];
  let out = first;
  for (const [re, short] of ROLE_SHORT) out = out.replace(re, short);
  return out.replace(/\s+/g, " ").trim();
}
const initials = name => {
  const parts = String(name || "").replace(/[^A-Za-z\s-]/g, " ").split(/[\s-]+/).filter(Boolean);
  return ((parts[0] || "")[0] || "") + ((parts.length > 1 ? parts.at(-1) : "")[0] || "") || "•";
};

/* ---------- people matching (SEC owner ↔ Wikidata person) ---------- */
const nameTokens = n => String(n || "").toUpperCase().replace(/[^A-Z\s-]/g, " ").replace(/-/g, " ").split(/\s+/).filter(t => t && !["JR", "SR", "II", "III", "IV", "MR", "MS", "DR"].includes(t));
function matchesPerson(secName, person) {
  const sec = nameTokens(secName);
  if (sec.length < 2) return false;
  return [person.name, ...(person.aliases || [])].some(candidate => {
    const wiki = nameTokens(candidate);
    if (wiki.length < 2) return false;
    const last = wiki.at(-1), first = wiki[0];
    if (!sec.includes(last)) return false;
    return sec.some(t => t !== last && t.length >= 3 && first.length >= 3 && (t.startsWith(first) || first.startsWith(t)));
  });
}
/* Original Commons uploads can be several megabytes; avatars use the 120px thumbnail. */
const commonsThumb = src => {
  const m = /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/([^/]+\.(?:jpe?g|png))$/i.exec(String(src || ""));
  return m ? `https://upload.wikimedia.org/wikipedia/commons/thumb/${m[1]}/${m[2]}/${m[3]}/120px-${m[3]}` : src;
};
const photoKey = (cik, name) => cik ? "cik:" + String(cik).replace(/^0+/, "") : "name:" + String(name || "").toUpperCase().replace(/[^A-Z0-9 ]+/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
/* Photos come only from the server's verified map (Commons, company site, SEC proxy), which uses
 * the strict name matcher plus a proven tie to this company, or from the small curated set;
 * everyone else keeps initials. The name on Commons or the company's page reads better than the
 * SEC filing order, so it is shown when the source gives one. */
function personInfo(secName, short = false, ownerCik = null) {
  const key = photoKey(ownerCik, secName);
  const verified = state.photos?.photos?.[key];
  const curated = window.InsidirMedia?.photo?.(secName, state.ticker);
  const photo = verified?.src ? { src: verified.src, source: verified.sourceUrl, credit: verified.credit }
    : curated ? { src: commonsThumb(curated.src), source: curated.source, credit: curated.credit + " · " + curated.license } : null;
  const readable = n => typeof n === "string" && /[a-z]/.test(n) && n.length <= 60 ? n : null;
  const natural = readable(state.photos?.names?.[key]) || (verified?.source !== "sec-proxy" ? readable(verified?.personName) : null);
  return { name: natural && (!short || natural.length <= 28) ? natural : displayName(secName, { short }), photo };
}
function avatar(name, photo, size = "") {
  const cls = "cx-avatar" + (size ? " cx-avatar--" + size : "");
  const fallback = esc(initials(name).toUpperCase());
  const src = photo?.src && (/^\/v1\/media\/[a-f0-9]{64}\.(webp|png|jpeg)$/.test(photo.src) ? photo.src : safeUrl(photo.src, ["wikimedia.org"]));
  if (src) {
    const credit = photo.credit ? `Photo: ${photo.credit}` : "";
    return `<span class="${cls}" data-initials="${fallback}"${credit ? ` title="${esc(credit)}"` : ""}><img src="${esc(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.parentNode.textContent=this.parentNode.dataset.initials"></span>`;
  }
  return `<span class="${cls}" aria-hidden="true">${fallback}</span>`;
}

/* ---------- network ---------- */
async function getJSON(url, options = {}) {
  const response = await fetch(url, { credentials: "same-origin", headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) }, ...options });
  let data = null;
  try { data = await response.json(); } catch { /* not JSON */ }
  if (!response.ok) throw Object.assign(new Error(data?.error || "Request failed (" + response.status + ")"), { status: response.status });
  return data;
}
const setStatus = (message, error = false) => { const el = $("cx-status"); el.textContent = message || ""; el.classList.toggle("is-error", Boolean(error)); };
const statusNotes = new Map();
function note(key, message) {
  if (message) statusNotes.set(key, message); else statusNotes.delete(key);
  setStatus([...statusNotes.values()].join(" "), statusNotes.size > 0);
}

/* ---------- derived facts ---------- */
// Every range response carries the same session quote (price, previous close, daily change).
const quote = () => state.market[state.range] || Object.values(state.market)[0] || null;
const ttm = id => state.intel?.ttm?.[id] || null;
const annual = id => (state.intel?.financialHistory?.[id]?.points || []).filter(p => finite(p.value));
const currency = () => state.intel?.currency || "USD";
const foreignIssuer = () => (state.intel?.filings || []).some(f => /^(20-F|40-F)/.test(f.form));
function keyFacts() {
  const q = quote(), intel = state.intel, price = q?.price;
  const sameCurrency = currency() === "USD" && (!q || q.currency === "USD");
  const shares = intel?.shares;
  const facts = {};
  if (finite(price) && shares && finite(shares.value) && sameCurrency && !foreignIssuer()) {
    const cap = price * shares.value;
    facts.marketCap = { value: cap, title: `${money(price, "USD", { precise: true })} × ${compactShares(shares.value)} shares ${shares.method === "implied" ? "implied by TTM net income ÷ diluted EPS" : "outstanding"} (SEC, ${day(shares.asOf)})` };
    const b = intel.balance;
    if (b && finite(b.cashAndShortTermInvestments)) {
      const debt = finite(b.totalDebt) ? b.totalDebt : 0;
      facts.ev = { value: cap + debt - b.cashAndShortTermInvestments, title: `Market cap + debt ${money(debt)} − cash & short-term investments ${money(b.cashAndShortTermInvestments)} (balance sheet ${day(b.asOf)})${finite(b.totalDebt) ? "" : "; no debt reported"}` };
    }
  }
  const eps = ttm("eps");
  if (finite(price) && eps && finite(eps.value) && sameCurrency) {
    facts.pe = eps.value > 0 ? { value: price / eps.value, title: `${money(price, "USD", { precise: true })} ÷ diluted EPS ${money(eps.value, "USD", { precise: true })} (${eps.basis === "ttm" ? "TTM" : "fiscal year"} ended ${day(eps.periodEnd)})` }
      : { value: null, label: "NM", title: "Not meaningful: trailing diluted EPS is zero or negative" };
  }
  return facts;
}

/* ---------- identity ---------- */
/* Sentence split that keeps "Apple Inc. is…" and initials ("J. P. Morgan") intact. */
function sentences(text) {
  const src = String(text || "").trim(), out = [], re = /[.!?]["”')\]]?\s+(?=[A-Z“"(])/g;
  let start = 0, m;
  while ((m = re.exec(src))) {
    const word = /(\S+)$/.exec(src.slice(start, m.index))?.[1] || "";
    if (/^(Inc|Corp|Co|Ltd|Mr|Mrs|Ms|Dr|St|Jr|Sr|No|vs|Bros|U\.S|e\.g|i\.e|[A-Z])$/i.test(word.replace(/\.$/, ""))) continue;
    out.push(src.slice(start, m.index + 1).trim());
    start = m.index + m[0].length;
  }
  if (start < src.length) out.push(src.slice(start).trim());
  return out.filter(Boolean);
}
function secDescription() {
  const p = state.intel?.profile, name = state.intel?.company?.name || state.ticker;
  if (!p) return "";
  const bits = [];
  bits.push(`${name} files with the SEC${p.industry ? " under " + p.industry.replace(/^Services-/, "").toLowerCase() : ""}${p.filerCategory ? " as a " + p.filerCategory.toLowerCase() : ""}.`);
  if (p.headquarters?.label) bits.push(`Headquartered in ${p.headquarters.label}${p.stateOfIncorporation ? ", incorporated in " + p.stateOfIncorporation : ""}.`);
  if (p.fiscalYearEnd) bits.push(`Fiscal year ends ${p.fiscalYearEnd}.`);
  return bits.join(" ");
}
const LEGAL = /(?:,|\s)+(?:inc|incorporated|corp|corporation|co|ltd|limited|plc|n\.?v|s\.?a|ag|se|l\.?p)\.?$/i;
function stripLegal(name) {
  let s = String(name || "").replace(/\s*\/[A-Z]{2,3}\/?$/, "").trim();
  for (let i = 0; i < 3; i++) s = s.replace(LEGAL, "").replace(/\s*&$/, "").trim();
  return s;
}
/* Display name: brand casing for curated marks, the SEC's mixed-case name, then Wikidata's label. */
function companyName() {
  const local = BRAND_NAMES[state.ticker];
  if (local) return local;
  const sec = state.intel?.company?.name, label = state.profile?.label;
  if (sec && /[a-z]/.test(sec)) return stripLegal(sec);
  if (label) return stripLegal(label);
  if (sec) return stripLegal(sec).split(" ").map(w => w.length <= 3 && !/[AEIOU]/.test(w) ? w : titleCase(w)).join(" ");
  return state.ticker;
}
function renderIdentity() {
  const name = companyName();
  $("cx-name").textContent = name;
  $("cx-ticker").textContent = state.ticker;
  $("cx-crumb-ticker").textContent = state.ticker;
  $("cx-quote-symbol").textContent = state.ticker;
  const exchange = state.intel?.profile?.exchange || (quote()?.exchange ? quote().exchange.replace(/^Nasdaq\w*$/i, "NASDAQ").replace(/^NYSE.*$/i, "NYSE") : "");
  $("cx-exchange").textContent = exchange;
  $("cx-exchange").hidden = $("cx-exchange").previousElementSibling.hidden = !exchange;
  const summary = state.profile?.summary;
  const desc = $("cx-description");
  if (summary?.text) {
    const s = sentences(summary.text);
    let lead = s.slice(0, 2).join(" ");
    if (lead.length > 240) lead = s[0];
    desc.innerHTML = esc(lead) + `<small>Source: <a href="${esc(safeUrl(summary.url, ["wikipedia.org"]))}" target="_blank" rel="noopener noreferrer">Wikipedia</a> (CC BY-SA 4.0)</small>`;
  } else if (state.intel || state.profileDone) {
    desc.textContent = secDescription() || "Official SEC filings, financial statements and insider activity for " + name + ".";
  }
  if (state.intel || state.profile) document.title = `${name} (${state.ticker})${finite(quote()?.price) ? " " + money(quote().price, quote().currency, { precise: true }) : ""} — insidir.`;
  renderAbout();
}
/* Logos come from /v1/company/logo (server-resolved, same origin) and are prepared by
 * brand-mark.js for this dark page: baked-in boxes removed, dark marks lifted. No tile, no
 * stand-in letter: without a real logo the slot is hidden. */
function renderLogo() {
  const host = $("cx-logo"), brand = host.closest(".cx-brand");
  const src = "/v1/company/logo?ticker=" + encodeURIComponent(state.ticker);
  host.setAttribute("aria-label", companyName() + " logo");
  if (host.dataset.src === src) return;
  host.dataset.src = src;
  const seq = state.seq;
  const prepare = window.InsidirBrand?.prepare;
  (prepare ? prepare(src, { prepared: true }) : Promise.resolve(null)).then(mark => {
    if (seq !== state.seq || host.dataset.src !== src) return;
    brand.classList.toggle("is-wide-logo", Boolean(mark && mark.ratio > 1.8));
    if (!mark) { host.hidden = true; host.replaceChildren(); return; }
    const img = new Image();
    img.alt = "";
    img.src = mark.url;
    host.className = "cx-logo";
    host.hidden = false;
    host.replaceChildren(img);
  });
}

/* ---------- key facts ---------- */
function factRow(label, valueHtml, title = "") {
  return `<div><dt>${esc(label)}</dt><dd${title ? ` title="${esc(title)}"` : ""}>${valueHtml}</dd></div>`;
}
const na = (text = "—") => `<span class="cx-na">${esc(text)}</span>`;
function renderFacts() {
  const f = keyFacts(), intel = state.intel, prof = state.profile, cur = currency();
  const waitingQuote = !state.marketError && !quote();
  const pending = !intel && !state.intelError;
  const skel = '<span class="cx-skel cx-skel--value"></span>';
  const priceDependent = (fact, unavailable) => fact ? (fact.label ? na(fact.label) : money(fact.value)) : (waitingQuote || pending) ? skel : na(unavailable);
  const rev = ttm("revenue"), ni = ttm("netIncome");
  const ttmTitle = m => m ? `${m.basis === "ttm" ? "Trailing twelve months" : "Fiscal year"} ended ${day(m.periodEnd)} · SEC XBRL` : "";
  const secSite = safeUrl(intel?.profile?.website);
  const site = prof?.website || (secSite ? { url: secSite, label: new URL(secSite).hostname.replace(/^www\./, "") } : null);
  const siteUrl = site && safeUrl(site.url);
  // SEC business address first; Wikidata's headquarters only when SEC has none.
  const hq = intel?.profile?.headquarters?.label || (intel || state.intelError ? prof?.headquarters : null);
  const profilePending = !state.profileDone;
  $("cx-facts").innerHTML = [
    factRow("Market cap", priceDependent(f.marketCap, "—"), f.marketCap?.title || (foreignIssuer() ? "Not calculated for foreign issuers whose listed shares may be ADRs" : "")),
    factRow("Enterprise value", priceDependent(f.ev, "—"), f.ev?.title),
    factRow("P/E ratio", f.pe ? (f.pe.label ? na(f.pe.label) : f.pe.value.toFixed(1)) : (waitingQuote || pending) ? skel : na(), f.pe?.title),
    factRow("Revenue (TTM)", rev ? money(rev.value, cur) : pending ? skel : na(), ttmTitle(rev)),
    factRow("Net income (TTM)", ni ? money(ni.value, cur) : pending ? skel : na(), ttmTitle(ni)),
    factRow("Employees", prof?.employees ? integer(prof.employees.value) : profilePending ? skel : na(), prof?.employees ? "Wikidata" + (prof.employees.asOf ? ", as of " + day(prof.employees.asOf) : "") : ""),
    factRow("Headquarters", hq ? esc(hq) : (pending || profilePending) ? skel : na(), intel?.profile?.headquarters ? "SEC EDGAR business address" : hq ? "Wikidata" : ""),
    factRow("Founded", prof?.founded ? String(prof.founded) : profilePending ? skel : na(), prof?.founded ? "Wikidata" : ""),
    factRow("Website", siteUrl ? `<a href="${esc(siteUrl)}" target="_blank" rel="noopener noreferrer">${esc(site.label)}${EXT}</a>` : (pending || profilePending) ? skel : na(), "")
  ].join("");
}

/* ---------- price chart ---------- */
function niceStep(span, target = 4) {
  const raw = span / target, mag = 10 ** Math.floor(Math.log10(raw)), r = raw / mag;
  return (r >= 7.5 ? 10 : r >= 3.5 ? 5 : r >= 2.25 ? 2.5 : r >= 1.5 ? 2 : 1) * mag;
}
function labelFor(t, range, tz) {
  const d = new Date(t), o = { timeZone: tz };
  if (range === "1D") return d.toLocaleTimeString("en-US", { ...o, hour: "numeric" });
  if (range === "1W" || range === "1M") return d.toLocaleDateString("en-US", { ...o, month: "short", day: "numeric" });
  if (range === "5Y") return d.toLocaleDateString("en-US", { ...o, year: "numeric" });
  return d.toLocaleDateString("en-US", { ...o, month: "short", year: "numeric" });
}
function bucketKey(t, range, tz) {
  const d = new Date(t);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(d).map(x => [x.type, x.value]));
  if (range === "1D") return p.hour;
  if (range === "1W") return p.year + p.month + p.day;
  if (range === "1M") return p.year + p.month + p.day;
  if (range === "5Y") return p.year;
  return p.year + p.month;
}
function xTicks(points, range, tz, maxLabels) {
  const marks = [];
  let prev = null;
  points.forEach(([t], i) => { const k = bucketKey(t, range, tz); if (k !== prev) { if (prev !== null) marks.push(i); prev = k; } });
  if (range === "1D") { const even = marks.filter(i => Number(bucketKey(points[i][0], range, tz)) % 2 === 0); if (even.length >= 2) marks.splice(0, marks.length, ...even); }
  const step = Math.max(1, Math.ceil(marks.length / maxLabels));
  return marks.filter((_, i) => i % step === (marks.length > step ? (marks.length - 1) % step : 0));
}
function drawChart() {
  const host = $("cx-chart"), data = state.market[state.range];
  host.querySelector(".cx-chart__tip")?.remove();
  if (!data) {
    host.innerHTML = state.marketError ? `<div class="cx-chart__empty">${esc(state.marketError)}</div>` : '<div class="cx-chart__loading"></div>';
    return;
  }
  const pts = data.points || [];
  if (pts.length < 2) { host.innerHTML = '<div class="cx-chart__empty">No price history was published for this range.</div>'; return; }
  const W = Math.max(280, host.clientWidth), H = Math.max(200, host.clientHeight);
  const padL = 4, padR = 54, padT = 10, padB = 30, w = W - padL - padR, h = H - padT - padB;
  const closes = pts.map(p => p[1]);
  const base = state.range === "1D" && finite(data.previousClose) ? data.previousClose : null;
  let lo = Math.min(...closes, base ?? Infinity), hi = Math.max(...closes, base ?? -Infinity);
  if (hi === lo) { hi += 1; lo -= 1; }
  const step = niceStep(hi - lo);
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  if ((hi - lo) / step > 6) { lo = Math.floor(lo / (step * 2)) * step * 2; hi = Math.ceil(hi / (step * 2)) * step * 2; }
  const tickStep = (hi - lo) / step > 6 ? step * 2 : step, ticks = [];
  for (let k = 0, n = Math.round((hi - lo) / tickStep); k <= n; k++) ticks.push(lo + k * tickStep);
  const x = i => padL + (i / (pts.length - 1)) * w;
  const y = v => padT + (1 - (v - lo) / (hi - lo)) * h;
  const up = (data.rangeChange ?? (closes.at(-1) - closes[0])) >= 0;
  const color = up ? "#22c56a" : "#ff5f5f";
  const line = pts.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p[1]).toFixed(1)).join("");
  const area = line + `L${x(pts.length - 1).toFixed(1)} ${padT + h}L${x(0).toFixed(1)} ${padT + h}Z`;
  const tz = data.timezone || "America/New_York";
  const decimals = Number.isInteger(+tickStep.toFixed(6)) ? 0 : Number.isInteger(+(tickStep * 10).toFixed(6)) ? 1 : 2;
  const yLabels = ticks.map(v => `<line class="grid" x1="${padL}" x2="${padL + w}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="axis" x="${padL + w + 12}" y="${(y(v) + 4).toFixed(1)}">${v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</text>`).join("");
  let lastRight = -Infinity;
  const xLabels = xTicks(pts, state.range, tz, W < 520 ? 3 : 6).map(i => {
    const text = labelFor(pts[i][0], state.range, tz), width = text.length * 7.2;
    const anchor = x(i) - width / 2 < 0 ? "start" : x(i) + width / 2 > W ? "end" : "middle";
    const left = anchor === "start" ? x(i) : anchor === "end" ? x(i) - width : x(i) - width / 2;
    if (left < lastRight + 10) return ""; // would collide with the previous label
    lastRight = left + width;
    return `<line class="tick" x1="${x(i).toFixed(1)}" x2="${x(i).toFixed(1)}" y1="${padT + h}" y2="${padT + h + 5}"/><text class="axis axis--x" x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="${anchor}">${esc(text)}</text>`;
  }).join("");
  const gid = "cx-fill-" + state.range;
  const first = pts[0][0], last = pts.at(-1)[0];
  host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" tabindex="0" aria-label="${esc(state.ticker + " price, " + state.range + ": " + money(closes[0], data.currency, { precise: true }) + " on " + new Date(first).toLocaleDateString("en-US", { timeZone: tz }) + " to " + money(closes.at(-1), data.currency, { precise: true }) + " on " + new Date(last).toLocaleDateString("en-US", { timeZone: tz }))}. Use arrow keys to inspect prices.">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".42"/><stop offset=".7" stop-color="${color}" stop-opacity=".1"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    ${yLabels}${xLabels}
    ${base != null ? `<line class="baseline" x1="${padL}" x2="${padL + w}" y1="${y(base).toFixed(1)}" y2="${y(base).toFixed(1)}"><title>Previous close ${money(base, data.currency, { precise: true })}</title></line>` : ""}
    <path d="${area}" fill="url(#${gid})"/>
    <path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <g class="cx-hover" opacity="0"><line class="cross" y1="${padT}" y2="${padT + h}"/><circle class="dot" r="5" fill="${color}"/></g>
  </svg>`;
  const svg = host.querySelector("svg"), hover = svg.querySelector(".cx-hover"), cross = hover.querySelector("line"), dot = hover.querySelector("circle");
  const tip = document.createElement("div");
  tip.className = "cx-chart__tip"; tip.hidden = true;
  host.appendChild(tip);
  const show = i => {
    i = Math.max(0, Math.min(pts.length - 1, i));
    state.hover = i;
    const cx = x(i), cy = y(pts[i][1]);
    cross.setAttribute("x1", cx); cross.setAttribute("x2", cx);
    dot.setAttribute("cx", cx); dot.setAttribute("cy", cy);
    hover.setAttribute("opacity", "1");
    const when = new Date(pts[i][0]);
    const label = state.range === "1D" || state.range === "1W" || state.range === "1M"
      ? when.toLocaleString("en-US", { timeZone: tz, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      : when.toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric", year: "numeric" });
    tip.innerHTML = `${esc(money(pts[i][1], data.currency, { precise: true }))}<span>${esc(label)}</span>`;
    tip.hidden = false;
    tip.style.left = Math.min(Math.max(cx / W * host.clientWidth, 60), host.clientWidth - 60) + "px";
  };
  const hide = () => { hover.setAttribute("opacity", "0"); tip.hidden = true; state.hover = null; };
  svg.addEventListener("pointermove", e => { const r = svg.getBoundingClientRect(); show(Math.round(((e.clientX - r.left) * (W / r.width) - padL) / w * (pts.length - 1))); });
  svg.addEventListener("pointerleave", hide);
  svg.addEventListener("blur", hide);
  svg.addEventListener("keydown", e => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const cur = state.hover ?? pts.length - 1;
    show(e.key === "Home" ? 0 : e.key === "End" ? pts.length - 1 : cur + (e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 10 : 1));
  });
}
function renderQuote() {
  const q = quote(), series = state.market[state.range];
  for (const b of document.querySelectorAll("[data-range]")) { const on = b.dataset.range === state.range; b.classList.toggle("is-active", on); b.setAttribute("aria-pressed", String(on)); }
  if (!q) {
    if (state.marketError) { $("cx-price").textContent = "—"; $("cx-change").textContent = ""; $("cx-quote-meta").textContent = state.marketError; }
    drawChart();
    return;
  }
  $("cx-price").textContent = money(q.price, q.currency, { precise: true });
  const change = $("cx-change");
  if (finite(q.change) && finite(q.changePercent)) {
    change.textContent = `${q.change >= 0 ? "+" : "−"}${Math.abs(q.change).toFixed(2)} (${q.changePercent >= 0 ? "+" : "−"}${Math.abs(q.changePercent).toFixed(2)}%)`;
    change.className = "cx-change " + (q.change >= 0 ? "is-up" : "is-down");
  } else { change.textContent = ""; }
  const when = q.marketTime ? new Date(q.marketTime).toLocaleString("en-US", { timeZone: q.timezone || "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }) : "";
  const rangePart = series && finite(series.rangeChangePercent) && state.range !== "1D"
    ? ` · <span class="${series.rangeChangePercent >= 0 ? "is-up" : "is-down"}">${series.rangeChangePercent >= 0 ? "+" : "−"}${Math.abs(series.rangeChangePercent).toFixed(2)}%</span> past ${esc({ "1W": "week", "1M": "month", "3M": "3 months", "1Y": "year", "5Y": "5 years" }[state.range])}` : "";
  $("cx-quote-meta").innerHTML = esc((q.marketState === "open" ? "Delayed" : "At close") + (when ? " · " + when : "")) + rangePart;
  const src = series?.source || q.source;
  $("cx-chart-source").innerHTML = `Delayed price data from <a href="${esc(safeUrl(src?.url, ["yahoo.com"]) || "https://finance.yahoo.com")}" target="_blank" rel="noopener noreferrer">${esc(src?.name || "Yahoo Finance")}</a>. Not a trading quote.`;
  drawChart();
}
async function loadMarket(range, seq = state.seq) {
  if (state.market[range]) { state.range = range; renderQuote(); return; }
  state.range = range;
  renderQuote();
  try {
    const data = await getJSON(`/v1/market/chart?ticker=${encodeURIComponent(state.ticker)}&range=${encodeURIComponent(range)}`);
    if (seq !== state.seq) return;
    state.market[range] = data;
    state.marketError = null;
    note("market", "");
  } catch (e) {
    if (seq !== state.seq) return;
    state.marketError = e.status === 404 ? "No market price is available for this ticker." : "Market data is temporarily unavailable.";
    if (e.status !== 404) note("market", "Price chart: " + e.message);
  }
  if (seq !== state.seq || state.range !== range) return;
  renderQuote(); renderFacts(); renderIdentity();
}

/* ---------- overview ---------- */
function spark(points) {
  const xs = points.slice(-8);
  if (!xs.length) return '<span class="cx-spark" aria-hidden="true"></span>';
  const max = Math.max(...xs.map(p => Math.abs(p.value)), 1);
  return `<span class="cx-spark" aria-hidden="true">${xs.map(p => `<i class="${p.value < 0 ? "neg" : ""}" style="height:${Math.max(10, Math.abs(p.value) / max * 100).toFixed(0)}%"></i>`).join("")}</span>`;
}
function renderOverviewFinancials() {
  const host = $("cx-fin-rows");
  if (!state.intel) { if (state.intelError) host.innerHTML = `<p class="cx-empty">${esc(state.intelError)}</p>`; return; }
  const rows = [["revenue", "Revenue"], ["netIncome", "Net income"], ["operatingIncome", "Operating income"], ["operatingCashFlow", "Operating cash flow"]];
  const cur = currency();
  const lead = ttm("revenue") || ttm("netIncome");
  $("cx-fin-period").textContent = lead ? `${lead.basis === "ttm" ? "TTM" : "Fiscal year"}, ended ${day(lead.periodEnd)}${cur !== "USD" ? " · " + cur : ""}` : "Latest reported period";
  const html = rows.map(([id, label]) => {
    const value = ttm(id)?.value ?? annual(id).at(-1)?.value;
    if (!finite(value)) return "";
    return `<div><span>${esc(label)}</span><strong>${esc(money(value, cur))}</strong>${spark(annual(id))}</div>`;
  }).join("");
  host.innerHTML = html || '<p class="cx-empty">This company has not reported comparable XBRL financial statements to the SEC.</p>';
}
function renderOverviewFilings() {
  const host = $("cx-filing-rows");
  if (!state.intel) { if (state.intelError) host.innerHTML = `<p class="cx-empty">${esc(state.intelError)}</p>`; return; }
  const rows = (state.intel.filings || []).slice(0, 5);
  host.innerHTML = rows.length ? rows.map(f => `<a href="${esc(secUrl(f.sourceUrl))}" target="_blank" rel="noopener noreferrer" title="${esc(f.headline)}"><time datetime="${esc(f.filedAt)}">${esc(day(f.filedAt))}</time><b>${esc(f.form)}</b>${EXT}</a>`).join("")
    : '<p class="cx-empty">No recent annual, quarterly or current reports were found on EDGAR.</p>';
}
function activity() { return state.insiders?.activity || []; }
function amountCell(a) {
  const cur = "USD";
  if (finite(a.netShares) && a.netShares !== 0) {
    return `<div class="cx-amount"><strong class="${a.netShares > 0 ? "is-up" : "is-down"}">${signed(a.netShares)}</strong><span>${finite(a.value) ? money(a.value, cur) : esc(a.codeLabel || "")}</span></div>`;
  }
  return `<div class="cx-amount"><strong class="is-flat">${esc(a.codeLabel || "Reported")}</strong><span>${finite(a.value) ? money(a.value, cur) : "Form " + esc(a.form || "4")}</span></div>`;
}
function renderOverviewInsiders() {
  const host = $("cx-insider-rows");
  if (!state.insiders) { if (state.insidersError) host.innerHTML = `<p class="cx-empty">${esc(state.insidersError)}</p>`; return; }
  const rows = activity().slice(0, 4);
  host.innerHTML = rows.length ? rows.map(a => {
    const p = personInfo(a.owner.name, true, a.owner.cik);
    return `<div>${avatar(p.name, p.photo)}<div class="cx-person-name"><strong>${esc(p.name)}</strong><span title="${esc(a.owner.role || "")}">${esc(shortRole(a.owner.role))}</span></div><time datetime="${esc(a.transactionDate || a.filedAt)}">${esc(day(a.transactionDate || a.filedAt))}</time>${amountCell(a)}</div>`;
  }).join("") : '<p class="cx-empty">No Form 4 insider filings were found for this company.</p>';
}
function renderAbout() {
  const about = $("cx-about"), overview = $("cx-overview");
  const prof = state.profile, summary = prof?.summary;
  const short = String(prof?.shortDescription || "").split(/\s+(?:based|headquartered) in\s|,\s|;\s|\s(?:that|which)\s/)[0].replace(/\.$/, "").trim();
  const sentenceCase = t => t ? t.charAt(0).toUpperCase() + t.slice(1).replace(/[.!]?$/, m => m || ".") : "";
  const tagline = sentenceCase(String(prof?.motto || "").trim()) || sentenceCase(short);
  if (!tagline || !summary?.text) { about.hidden = true; overview.classList.add("no-about"); return; }
  about.hidden = false; overview.classList.remove("no-about");
  $("cx-about-title").textContent = tagline;
  const s = sentences(summary.text);
  let used = s.slice(0, 2).join(" ").length > 240 ? 1 : 2;
  const rest = s.slice(used);
  let teaser = rest[0] || secDescription() || s[0];
  if (teaser.length > 210) teaser = teaser.slice(0, 200).replace(/[\s,;:]+\S*$/, "") + "…";
  $("cx-about-text").textContent = teaser;
  const p = state.intel?.profile;
  const secFacts = p ? [p.industry && "Industry (SIC): " + p.industry, p.stateOfIncorporation && "Incorporated in " + p.stateOfIncorporation, p.fiscalYearEnd && "Fiscal year ends " + p.fiscalYearEnd, p.filerCategory && "SEC filer category: " + p.filerCategory].filter(Boolean) : [];
  $("cx-about-more").innerHTML = `<p>${esc(summary.text)}</p>${secFacts.length ? `<p>${esc(secFacts.join(" · "))}</p>` : ""}<small>Description from <a href="${esc(safeUrl(summary.url, ["wikipedia.org"]))}" target="_blank" rel="noopener noreferrer">Wikipedia</a>, CC BY-SA 4.0. Company facts from <a href="${esc(safeUrl(prof.wikidataUrl, ["wikidata.org"]))}" target="_blank" rel="noopener noreferrer">Wikidata</a> and SEC EDGAR.</small>`;
}

/* ---------- financials tab ---------- */
function tile(label, value, sub = "", source = "") {
  const link = source ? `<a href="${esc(source)}" target="_blank" rel="noopener noreferrer">SEC source</a>` : "";
  return `<div class="cx-tile"><span>${esc(label)}</span><strong>${value}</strong>${sub || link ? `<small>${esc(sub)}${sub && link ? " · " : ""}${link}</small>` : ""}</div>`;
}
function renderFinancials() {
  const intel = state.intel, cur = currency();
  if (!intel) {
    const msg = state.intelError ? `<p class="cx-empty">${esc(state.intelError)}</p>` : "";
    for (const id of ["cx-ttm-tiles", "cx-statements", "cx-balance", "cx-annual-chart"]) $(id).innerHTML = msg;
    return;
  }
  $("cx-research-link").href = "research.html?ticker=" + encodeURIComponent(state.ticker);
  $("cx-currency-badge").textContent = cur + " · SEC 10-K / 20-F";
  const period = m => m ? `${m.basis === "ttm" ? "TTM" : "FY"} ended ${day(m.periodEnd)}` : "";
  const margin = (m, base) => m && base && base.value > 0 && m.periodEnd === base.periodEnd ? ` · ${(m.value / base.value * 100).toFixed(1)}% margin` : "";
  const rev = ttm("revenue"), gp = ttm("grossProfit"), op = ttm("operatingIncome"), ni = ttm("netIncome"), eps = ttm("eps"), ocf = ttm("operatingCashFlow"), capex = ttm("capex");
  const tiles = [];
  if (rev) tiles.push(tile("Revenue", esc(money(rev.value, cur)), period(rev), secUrl(rev.sources?.at(-1))));
  if (gp) tiles.push(tile("Gross profit", esc(money(gp.value, cur)), period(gp) + margin(gp, rev), secUrl(gp.sources?.at(-1))));
  if (op) tiles.push(tile("Operating income", esc(money(op.value, cur)), period(op) + margin(op, rev), secUrl(op.sources?.at(-1))));
  if (ni) tiles.push(tile("Net income", esc(money(ni.value, cur)), period(ni) + margin(ni, rev), secUrl(ni.sources?.at(-1))));
  if (eps) tiles.push(tile("Diluted EPS", esc(money(eps.value, cur, { precise: true })), period(eps), secUrl(eps.sources?.at(-1))));
  if (ocf) tiles.push(tile("Operating cash flow", esc(money(ocf.value, cur)), period(ocf), secUrl(ocf.sources?.at(-1))));
  if (capex) tiles.push(tile("Capital expenditure", esc(money(capex.value, cur)), period(capex), secUrl(capex.sources?.at(-1))));
  if (ocf && capex && ocf.periodEnd === capex.periodEnd) tiles.push(tile("Free cash flow", esc(money(ocf.value - capex.value, cur)), period(ocf) + " · operating cash flow − capex"));
  $("cx-ttm-tiles").innerHTML = tiles.join("") || '<p class="cx-empty">No trailing financial measures are available in this company\'s SEC XBRL data.</p>';
  renderAnnualChart();
  const defs = [["Revenue", "revenue"], ["Gross profit", "grossProfit"], ["Operating income", "operatingIncome"], ["Net income", "netIncome"], ["Operating cash flow", "operatingCashFlow"], ["Capital expenditure", "capex"], ["Total assets", "assets"], ["Total liabilities", "liabilities"], ["Shareholders' equity", "equity"], ["Cash & equivalents", "cash"]];
  let periods = annual("revenue").map(p => p.periodEnd);
  if (!periods.length) periods = [...new Set(defs.flatMap(([, id]) => annual(id).map(p => p.periodEnd)))].sort();
  periods = periods.slice(-6).reverse();
  if (!periods.length) $("cx-statements").innerHTML = '<p class="cx-empty">No full-year statements are available from SEC XBRL for this company.</p>';
  else {
    let out = `<table class="cx-table cx-statements"><thead><tr><th scope="col">Fiscal year ended</th>${periods.map(p => `<th scope="col" class="num">${esc(day(p))}</th>`).join("")}</tr></thead><tbody>`;
    for (const [label, id] of defs) {
      const xs = annual(id);
      if (!xs.length) continue;
      out += `<tr><td>${esc(label)}</td>${periods.map(end => { const r = xs.find(p => p.periodEnd === end); return `<td class="num">${r ? `<a href="${esc(secUrl(r.sourceUrl))}" target="_blank" rel="noopener noreferrer" title="${esc((r.form || "Annual report") + " filed " + day(r.filedAt))}">${esc(money(r.value, cur))}</a>` : "—"}</td>`; }).join("")}</tr>`;
    }
    $("cx-statements").innerHTML = out + "</tbody></table>";
  }
  const b = intel.balance, facts = intel.facts || [], fact = id => facts.find(f => f.id === id);
  const sh = intel.shares;
  $("cx-balance-date").textContent = b?.asOf ? "As of " + day(b.asOf) : "Latest filing";
  const bal = [];
  if (b && finite(b.cashAndShortTermInvestments)) bal.push(tile("Cash & short-term investments", esc(money(b.cashAndShortTermInvestments, cur)), "", secUrl(b.sources?.[0])));
  if (b && finite(b.totalDebt)) bal.push(tile("Total debt", esc(money(b.totalDebt, cur)), "Long-term debt incl. current portion, commercial paper, short-term borrowings"));
  for (const [id, label] of [["assets", "Total assets"], ["liabilities", "Total liabilities"], ["equity", "Shareholders' equity"]]) {
    const f = fact(id);
    if (f) bal.push(tile(label, esc(money(f.value, cur)), "As of " + day(f.periodEnd), secUrl(f.sourceUrl)));
  }
  if (sh) bal.push(tile("Shares outstanding", esc(compactShares(sh.value)), (sh.method === "implied" ? "Implied from TTM net income ÷ EPS" : "Reported") + " · " + day(sh.asOf), secUrl(sh.sourceUrl)));
  $("cx-balance").innerHTML = bal.join("") || '<p class="cx-empty">No balance sheet data is available in this company\'s SEC XBRL filings.</p>';
}
function renderAnnualChart() {
  for (const b of document.querySelectorAll("#cx-annual-metrics [data-metric]")) { const on = b.dataset.metric === state.annualMetric; b.classList.toggle("is-active", on); b.setAttribute("aria-pressed", String(on)); }
  const xs = annual(state.annualMetric).slice(-9), cur = currency();
  if (!xs.length) { $("cx-annual-chart").innerHTML = '<p class="cx-empty">This measure is not reported as comparable full-year data.</p>'; return; }
  const max = Math.max(...xs.map(p => Math.abs(p.value)), 1);
  $("cx-annual-chart").innerHTML = xs.map(p => `<div title="Fiscal year ended ${esc(day(p.periodEnd))}"><b>${esc(money(p.value, cur))}</b><i class="${p.value < 0 ? "neg" : ""}" style="height:${Math.max(2, Math.abs(p.value) / max * 82).toFixed(1)}%"></i><span>FY${esc(p.periodEnd.slice(2, 4))}</span></div>`).join("");
  $("cx-annual-chart").setAttribute("role", "img");
  $("cx-annual-chart").setAttribute("aria-label", `${state.intel?.financialHistory?.[state.annualMetric]?.label || "Annual"} by fiscal year: ` + xs.map(p => p.periodEnd.slice(0, 4) + " " + money(p.value, cur)).join(", "));
}

/* ---------- filings tab ---------- */
const filingGroup = form => /^(10-K|20-F|40-F|10-KT|ARS)/.test(form) ? "annual" : /^10-Q/.test(form) ? "quarterly" : /^(8-K|6-K)/.test(form) ? "current" : "other";
function renderFilings() {
  for (const b of document.querySelectorAll("#cx-filing-filters [data-filter]")) { const on = b.dataset.filter === state.filingFilter; b.classList.toggle("is-active", on); b.setAttribute("aria-pressed", String(on)); }
  const all = state.intel?.filings || [];
  const rows = all.filter(f => state.filingFilter === "all" || filingGroup(f.form) === state.filingFilter);
  $("cx-filing-count").textContent = String(all.length);
  const cik = state.intel?.company?.cik;
  if (cik) $("cx-edgar-link").href = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=" + encodeURIComponent(cik) + "&type=&dateb=&owner=include&count=40";
  $("cx-filings-table").innerHTML = rows.length ? rows.map(f => {
    const items = (f.items || []).filter(i => i.code !== "9.01").map(i => i.label);
    return `<tr><td><span class="cx-form">${esc(f.form)}</span></td><td>${esc(f.headline)}${items.length ? `<small>${esc(items.join(" · "))}</small>` : ""}</td><td>${esc(day(f.reportDate))}</td><td>${esc(day(f.filedAt))}</td><td class="num"><a href="${esc(secUrl(f.sourceUrl))}" target="_blank" rel="noopener noreferrer">View ${EXT}</a></td></tr>`;
  }).join("") : `<tr><td colspan="5"><p class="cx-empty">${state.intel ? "No filings match this filter." : esc(state.intelError || "Loading SEC filings…")}</p></td></tr>`;
}

/* ---------- insiders tab ---------- */
const insiderGroup = a => a.kind === "purchase" ? "buy" : a.kind === "sale" || a.kind === "mixed" ? "sell" : "other";
function renderInsiders() {
  for (const b of document.querySelectorAll("#cx-insider-filters [data-filter]")) { const on = b.dataset.filter === state.insiderFilter; b.classList.toggle("is-active", on); b.setAttribute("aria-pressed", String(on)); }
  const cik = state.intel?.company?.cik || state.insiders?.company?.cik;
  if (cik) $("cx-form4-link").href = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=" + encodeURIComponent(cik) + "&type=4&dateb=&owner=include&count=40";
  if (!state.insiders) {
    $("cx-insiders-table").innerHTML = `<tr><td colspan="8"><p class="cx-empty">${esc(state.insidersError || "Loading Form 4 filings…")}</p></td></tr>`;
    $("cx-insider-summary").innerHTML = "";
    return;
  }
  const all = activity();
  const buys = all.filter(a => a.kind === "purchase"), sells = all.filter(a => a.kind === "sale" || a.kind === "mixed");
  const sum = (xs, f) => xs.reduce((s, a) => s + (finite(f(a)) ? f(a) : 0), 0);
  const oldest = all.map(a => a.filedAt).sort()[0];
  $("cx-insider-summary").innerHTML = [
    tile("Open-market buys", esc(String(buys.length)), buys.length ? `${compactShares(sum(buys, a => a.netShares))} shares · ${money(sum(buys, a => a.value))}` : "None in these filings"),
    tile("Open-market sales", esc(String(sells.length)), sells.length ? `${compactShares(Math.abs(sum(sells, a => a.netShares)))} shares · ${money(sum(sells, a => a.value))}` : "None in these filings"),
    tile("Insiders reporting", esc(String((state.insiders.people || []).length)), "Officers, directors and 10% owners"),
    tile("Filings reviewed", esc(String(all.length)), oldest ? "Filed since " + day(oldest) : "")
  ].join("");
  const rows = all.filter(a => state.insiderFilter === "all" || insiderGroup(a) === state.insiderFilter);
  $("cx-insiders-table").innerHTML = rows.length ? rows.map(a => {
    const p = personInfo(a.owner.name, false, a.owner.cik);
    const extra = (a.transactions || []).length > 1 ? ` <small>${a.transactions.length} line items</small>` : "";
    const price = (a.transactions || []).filter(t => t.price > 0 && !t.derivative);
    const avg = price.length ? price.reduce((s, t) => s + t.price * t.shares, 0) / Math.max(1, price.reduce((s, t) => s + t.shares, 0)) : null;
    return `<tr><td><div class="cx-person-cell">${avatar(p.name, p.photo, "sm")}<div class="cx-person-name"><strong>${esc(p.name)}</strong><span title="${esc(a.owner.role || "")}">${esc(shortRole(a.owner.role))}</span></div></div></td>
      <td>${esc(a.codeLabel || "Reported transaction")}${extra}${finite(avg) ? `<small>Avg. ${esc(money(avg, "USD", { precise: true }))}</small>` : ""}</td>
      <td>${esc(day(a.transactionDate))}</td><td>${esc(day(a.filedAt))}</td>
      <td class="num ${finite(a.netShares) && a.netShares !== 0 ? (a.netShares > 0 ? "is-up" : "is-down") : ""}">${finite(a.netShares) ? signed(a.netShares) : "—"}</td>
      <td class="num">${finite(a.value) ? esc(money(a.value)) : "—"}</td><td class="num">${finite(a.sharesAfter) ? esc(integer(a.sharesAfter)) : "—"}</td>
      <td class="num">${secUrl(a.sourceUrl) ? `<a href="${esc(secUrl(a.sourceUrl))}" target="_blank" rel="noopener noreferrer">Form ${esc(a.form || "4")} ${EXT}</a>` : ""}</td></tr>`;
  }).join("") : `<tr><td colspan="8"><p class="cx-empty">${all.length ? "No transactions match this filter." : "No Form 4 insider filings were found for this company."}</p></td></tr>`;
}

/* ---------- people tab ---------- */
function renderPeople() {
  const secPeople = state.insiders?.people || [];
  $("cx-people-sec").innerHTML = state.insiders ? (secPeople.length ? secPeople.slice(0, 24).map(person => {
    const p = personInfo(person.name, false, person.cik);
    return `<article class="cx-person">${avatar(p.name, p.photo, "lg")}<div class="cx-person__body"><h4>${esc(p.name)}</h4><p>${esc(person.role || "Reporting owner")}</p>
      <dl><dt>Last filing</dt><dd>${esc(day(person.lastFiled))}</dd><dt>Filings</dt><dd>${esc(String(person.filings))} in this window</dd>${finite(person.sharesAfter) ? `<dt>Owned after</dt><dd>${esc(integer(person.sharesAfter))} shares</dd>` : ""}</dl>
      <a href="people.html?q=${encodeURIComponent(person.name)}">Search insider records →</a></div></article>`;
  }).join("") : '<p class="cx-empty">No officers or directors have filed recent Form 4 reports for this company.</p>')
    : `<p class="cx-empty">${esc(state.insidersError || "Loading reporting people…")}</p>`;
  const matched = new Set(secPeople.map(s => (state.profile?.people || []).find(p => matchesPerson(s.name, p))?.name).filter(Boolean));
  const serverLeaders = state.photos?.leaders?.length ? state.photos.leaders.filter(l => !l.insider || l.roles.includes("Founder")) : null;
  const leaders = serverLeaders || (state.profile?.people || []).filter(p => !matched.has(p.name) || p.roles.includes("Founder"));
  $("cx-leaders-head").hidden = !leaders.length;
  $("cx-people-wiki").innerHTML = leaders.map(p => {
    const photo = p.src ? { src: p.src, credit: p.credit } : p.photo ? { src: p.photo.src, credit: "Wikimedia Commons" } : null;
    const link = safeUrl(p.wikidataUrl, ["wikidata.org"]);
    return `<article class="cx-person">${avatar(p.name, photo, "lg")}<div class="cx-person__body"><h4>${esc(p.name)}</h4><p>${esc((p.roles || []).join(" · "))}</p>${link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">Wikidata profile ↗</a>` : ""}</div></article>`;
  }).join("");
}

/* ---------- news tab ---------- */
async function loadNews(seq = state.seq) {
  if (state.news || state.newsLoading) return;
  state.newsLoading = true;
  $("cx-announcements").innerHTML = '<span class="cx-skel cx-skel--row"></span><span class="cx-skel cx-skel--row"></span>';
  $("cx-headlines").innerHTML = '<span class="cx-skel cx-skel--row"></span><span class="cx-skel cx-skel--row"></span>';
  try {
    const data = await getJSON("/v1/company/news?ticker=" + encodeURIComponent(state.ticker));
    if (seq !== state.seq) return;
    state.news = data;
  } catch (e) {
    if (seq !== state.seq) return;
    state.news = { announcements: [], headlines: [], error: e.message };
  } finally { if (seq === state.seq) state.newsLoading = false; }
  renderNews();
}
function renderNews() {
  const n = state.news;
  if (!n) return;
  $("cx-announcements").innerHTML = n.announcements?.length ? n.announcements.slice(0, 12).map(a => `<a href="${esc(secUrl(a.url))}" target="_blank" rel="noopener noreferrer"><strong>${a.earnings ? '<span class="cx-pill">Earnings</span>' : ""}${esc(a.title)}</strong><span>${esc(day(a.filedAt))} · Form ${esc(a.form)}</span></a>`).join("")
    : `<p class="cx-empty">${esc(n.error || "No recent 8-K current reports.")}</p>`;
  $("cx-headlines").innerHTML = n.headlines?.length ? n.headlines.slice(0, 12).map(h => `<a href="${esc(safeUrl(h.url))}" target="_blank" rel="noopener noreferrer nofollow"><strong>${esc(h.title)}</strong><span>${esc(h.publisher)}${h.publishedAt ? " · " + esc(ago(h.publishedAt)) : ""}</span></a>`).join("")
    : `<p class="cx-empty">${n.headlinesAvailable === false ? "Headlines are temporarily unavailable." : "No recent headlines for this ticker."}</p>`;
}

/* ---------- tabs ---------- */
function activateTab(id, { focus = false, push = true } = {}) {
  if (!TABS.includes(id)) id = "overview";
  for (const b of document.querySelectorAll("#cx-tabs [role=tab]")) {
    const on = b.dataset.tab === id;
    b.setAttribute("aria-selected", String(on));
    b.tabIndex = on ? 0 : -1;
    if (on && focus) b.focus();
  }
  for (const t of TABS) $(t).hidden = t !== id;
  if (id === "news") loadNews();
  if (push && state.ticker) history.replaceState(null, "", "company.html?ticker=" + encodeURIComponent(state.ticker) + (id === "overview" ? "" : "#" + id));
}

/* ---------- watchlist & actions ---------- */
function renderWatch() {
  const b = $("cx-watch"), label = b.querySelector("span");
  b.setAttribute("aria-pressed", String(state.watch === true));
  label.textContent = state.watch === true ? "On watchlist" : state.watch === "signed_out" ? "Sign in to save" : "Add to watchlist";
  b.querySelector("svg").innerHTML = state.watch === true ? '<path d="m5 12.5 4.5 4.5L19 7.5"/>' : '<path d="M12 5v14M5 12h14"/>';
}
async function loadWatch(seq) {
  try {
    const d = await getJSON("/v1/me/watchlist");
    if (seq !== state.seq) return;
    state.watch = (d.items || []).some(x => String(x.ticker).toUpperCase() === state.ticker);
  } catch (e) { if (seq === state.seq) state.watch = e.status === 401 ? "signed_out" : null; }
  if (seq === state.seq) renderWatch();
}
async function addToWatchlist() {
  await getJSON("/v1/me/watchlist", { method: "POST", body: JSON.stringify({ ticker: state.ticker }) });
  state.watch = true;
}
const signIn = () => { location.href = "signin.html?next=" + encodeURIComponent(location.pathname + location.search); };

/* ---------- load ---------- */
/* Verified photos arrive from a background job; check back a few times while it works. */
async function loadPhotos(seq, attempt = 0) {
  try {
    const data = await getJSON("/v1/company/photos?ticker=" + encodeURIComponent(state.ticker) + (attempt === 0 ? "&wait=2500" : ""));
    if (seq !== state.seq) return;
    state.photos = data;
    renderOverviewInsiders(); renderInsiders(); renderPeople();
    // Company sites are crawled politely (one request a second), so a first visit can take a few
    // minutes; photos appear as each source finishes.
    const delays = [2500, 4000, 6000, 8000, 12000, 15000, 20000, 30000, 30000, 45000, 45000, 60000, 60000];
    if (!data.complete && attempt < delays.length) setTimeout(() => { if (seq === state.seq) loadPhotos(seq, attempt + 1); }, delays[attempt]);
  } catch { /* initials stay */ }
}
function resetView() {
  state.intel = null; state.intelError = null; state.profile = null; state.profileDone = false; state.insiders = null; state.insidersError = null;
  state.news = null; state.newsLoading = false; state.market = {}; state.marketError = null; state.watch = null; state.photos = null;
  state.annualMetric = "revenue"; state.filingFilter = "all"; state.insiderFilter = "all";
  statusNotes.clear(); setStatus("");
  $("cx-logo").className = "cx-logo is-loading"; $("cx-logo").hidden = false; $("cx-logo").innerHTML = ""; delete $("cx-logo").dataset.src;
  $("cx-logo").closest(".cx-brand").classList.remove("is-wide-logo");
  $("cx-name").innerHTML = '<span class="cx-skel cx-skel--title"></span>';
  $("cx-description").innerHTML = '<span class="cx-skel"></span><span class="cx-skel"></span><span class="cx-skel cx-skel--short"></span>';
  $("cx-price").innerHTML = '<span class="cx-skel cx-skel--price"></span>'; $("cx-change").textContent = ""; $("cx-quote-meta").textContent = "Loading market data…";
}
function renderAll() {
  renderIdentity(); renderFacts(); renderOverviewFinancials(); renderOverviewFilings(); renderOverviewInsiders();
  renderFinancials(); renderFilings(); renderInsiders(); renderPeople(); renderWatch();
}
function fallbackInsiders(rows) {
  const activity = rows.map(r => ({
    accession: r.accession, form: "4", filedAt: String(r.published_at || "").slice(0, 10), transactionDate: r.transaction_date ? String(r.transaction_date).slice(0, 10) : null,
    owner: { name: r.owner_name, cik: r.owner_cik, role: null }, kind: r.category === "reported_purchase" ? "purchase" : r.category === "reported_sale" ? "sale" : "other",
    code: r.transaction_code, codeLabel: r.category === "reported_purchase" ? "Open-market purchase" : r.category === "reported_sale" ? "Open-market sale" : "Reported transaction",
    netShares: finite(Number(r.shares)) ? (r.acquired_disposed === "D" ? -Number(r.shares) : Number(r.shares)) : null,
    value: finite(Number(r.estimated_value)) ? Number(r.estimated_value) : null, sharesAfter: null, transactions: [], sourceUrl: r.source_url
  }));
  const people = new Map();
  for (const a of activity) { const k = a.owner.cik || a.owner.name; const p = people.get(k) || { name: a.owner.name, cik: a.owner.cik, role: null, filings: 0, lastFiled: a.filedAt }; p.filings++; people.set(k, p); }
  return { activity, people: [...people.values()] };
}
async function load(ticker) {
  const seq = ++state.seq;
  state.ticker = ticker;
  resetView();
  $("cx-picker").hidden = true; $("cx-report").hidden = false;
  for (const id of ["cx-ticker", "cx-crumb-ticker", "cx-quote-symbol"]) $(id).textContent = ticker;
  renderAll();
  const initialTab = location.hash.slice(1);
  activateTab(TABS.includes(initialTab) ? initialTab : "overview", { push: false });
  history.replaceState(null, "", "company.html?ticker=" + encodeURIComponent(ticker) + (TABS.includes(initialTab) && initialTab !== "overview" ? "#" + initialTab : ""));
  const enc = encodeURIComponent(ticker);
  loadMarket(state.range, seq);
  getJSON("/v1/intelligence?ticker=" + enc).then(d => { if (seq !== state.seq) return; state.intel = d; note("intel", (d.warnings || []).join(" ")); })
    .catch(e => { if (seq !== state.seq) return; state.intelError = e.status === 404 ? "This ticker is not in the SEC's official company list." : "SEC data is temporarily unavailable: " + e.message; note("intel", state.intelError); })
    .finally(() => { if (seq !== state.seq) return; renderAll(); });
  getJSON("/v1/company/profile?ticker=" + enc).then(d => { if (seq !== state.seq) return; state.profile = d?.matched ? d : null; })
    .catch(() => {}).finally(() => { if (seq !== state.seq) return; state.profileDone = true; renderAll(); });
  getJSON("/v1/company/insiders?ticker=" + enc).then(d => { if (seq !== state.seq) return; state.insiders = d; })
    .catch(async e => {
      if (seq !== state.seq) return;
      try {
        const rows = (await getJSON("/v1/transactions?ticker=" + enc + "&limit=60")).items || [];
        if (seq !== state.seq) return;
        state.insiders = fallbackInsiders(rows);
      } catch { state.insidersError = e.status === 404 ? "This ticker is not in the SEC's official company list." : "SEC ownership filings are temporarily unavailable."; }
    }).finally(() => { if (seq !== state.seq) return; renderOverviewInsiders(); renderInsiders(); renderPeople(); });
  renderLogo();
  loadPhotos(seq);
  loadWatch(seq);
  setTimeout(() => { if (seq === state.seq) loadNews(seq); }, 2500);
}
function showPicker() {
  $("cx-report").hidden = true; $("cx-picker").hidden = false;
  document.title = "Company research — insidir.";
  $("cx-picker-grid").innerHTML = POPULAR.map(([t, n]) => {
    return `<a href="company.html?ticker=${encodeURIComponent(t)}"><span class="cx-mark" data-logo="${esc(t)}"></span><div><b>${esc(t)}</b><span>${esc(n)}</span></div></a>`;
  }).join("");
  for (const slot of document.querySelectorAll("#cx-picker-grid [data-logo]")) {
    window.InsidirBrand?.prepare("/v1/company/logo?ticker=" + encodeURIComponent(slot.dataset.logo), { prepared: true }).then(mark => {
      if (mark) slot.innerHTML = `<img src="${mark.url}" alt="">`; else slot.remove();
    });
  }
}
const normalizeTicker = v => { const t = String(v || "").trim().toUpperCase().replace(/\./g, "-"); return /^[A-Z0-9][A-Z0-9-]{0,14}$/.test(t) ? t : ""; };

document.addEventListener("DOMContentLoaded", () => {
  for (const b of document.querySelectorAll("[data-range]")) b.addEventListener("click", () => loadMarket(b.dataset.range));
  const tabs = [...document.querySelectorAll("#cx-tabs [role=tab]")];
  tabs.forEach((b, i) => {
    b.addEventListener("click", () => activateTab(b.dataset.tab));
    b.addEventListener("keydown", e => {
      const next = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : null;
      if (next === null) return;
      e.preventDefault();
      activateTab(tabs[(next + tabs.length) % tabs.length].dataset.tab, { focus: true });
    });
  });
  document.addEventListener("click", e => {
    const go = e.target.closest("[data-go]");
    if (!go) return;
    activateTab(go.dataset.go);
    $("cx-tabs").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  });
  for (const b of document.querySelectorAll("#cx-annual-metrics [data-metric]")) b.addEventListener("click", () => { state.annualMetric = b.dataset.metric; renderAnnualChart(); });
  for (const b of document.querySelectorAll("#cx-filing-filters [data-filter]")) b.addEventListener("click", () => { state.filingFilter = b.dataset.filter; renderFilings(); });
  for (const b of document.querySelectorAll("#cx-insider-filters [data-filter]")) b.addEventListener("click", () => { state.insiderFilter = b.dataset.filter; renderInsiders(); });
  $("cx-about-toggle").addEventListener("click", () => {
    const more = $("cx-about-more"), open = more.hidden;
    more.hidden = !open;
    $("cx-about-text").hidden = open;
    $("cx-about-toggle").setAttribute("aria-expanded", String(open));
    $("cx-about-toggle").firstChild.textContent = open ? "Show less " : "Read full company description ";
  });
  $("cx-watch").addEventListener("click", async () => {
    if (!state.ticker) return;
    if (state.watch === "signed_out") return signIn();
    const b = $("cx-watch");
    b.disabled = true;
    try {
      if (state.watch === true) { await getJSON("/v1/me/watchlist/" + encodeURIComponent(state.ticker), { method: "DELETE" }); state.watch = false; }
      else await addToWatchlist();
    } catch (e) {
      if (e.status === 401) { state.watch = "signed_out"; return signIn(); }
      note("watch", "Watchlist could not be updated: " + e.message);
    } finally { b.disabled = false; renderWatch(); }
  });
  $("cx-alert").addEventListener("click", async () => {
    if (!state.ticker) return;
    if (state.watch === "signed_out") return signIn();
    const b = $("cx-alert");
    b.disabled = true;
    try { if (state.watch !== true) await addToWatchlist(); location.href = "alerts.html?ticker=" + encodeURIComponent(state.ticker); }
    catch (e) { if (e.status === 401) return signIn(); note("watch", "Alert could not be set: " + e.message); }
    finally { b.disabled = false; renderWatch(); }
  });
  $("cx-share").addEventListener("click", async () => {
    const url = location.href, label = $("cx-share").querySelector("span");
    try {
      if (navigator.share) await navigator.share({ title: document.title, url });
      else { await navigator.clipboard.writeText(url); label.textContent = "Link copied"; setTimeout(() => { label.textContent = "Share"; }, 1800); }
    } catch (e) { if (e?.name !== "AbortError") window.prompt("Copy this link:", url); }
  });
  $("cx-picker-form").addEventListener("submit", async e => {
    e.preventDefault();
    const input = $("cx-picker-input"), q = input.value.trim();
    if (!q) return;
    try {
      const d = await getJSON("/v1/search?q=" + encodeURIComponent(q));
      const hit = (d.items || [])[0];
      if (hit) { location.href = "company.html?ticker=" + encodeURIComponent(hit.ticker); return; }
    } catch { /* fall back to the ticker as typed */ }
    const t = normalizeTicker(q);
    if (t) location.href = "company.html?ticker=" + encodeURIComponent(t);
    else { input.setCustomValidity("No matching company found"); input.reportValidity(); }
  });
  $("cx-picker-input").addEventListener("input", e => e.target.setCustomValidity(""));
  let resizeFrame = 0;
  new ResizeObserver(() => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(drawChart); }).observe($("cx-chart"));
  window.addEventListener("hashchange", () => activateTab(location.hash.slice(1), { push: false }));
  const ticker = normalizeTicker(new URLSearchParams(location.search).get("ticker"));
  if (ticker) load(ticker); else showPicker();
});
})();
