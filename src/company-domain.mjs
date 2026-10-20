/* The company's own website domain, and logo candidates read from its homepage.
 *
 * Domain (synthesis S7): the SEC submissions "website" field is almost always empty, so the domain
 * is read from the company's own filing text — latest 10-K/20-F/40-F/N-CSR, then 10-Q, then
 * S-1/424B, then 8-K EX-99 press releases — scored by "Available Information" / "Our Internet
 * address is" context and company-name tokens, with an anchored blocklist (transfer agents,
 * newswires, regulators, auditors...). Wikidata P856 is a cross-check. The homepage's <title> /
 * og:site_name must then share a distinctive token with the SEC name (this rejects a transfer
 * agent's or another company's site). A domain seen only in 8-K press releases is never used
 * without that confirmation.
 *
 * Logo candidates (S7 extraction order): JSON-LD Organization.logo, the header home-link logo,
 * a white/light/reverse variant of it, mask-icon, apple-touch-icon >= 180 px. */
import { secFetch, parseAtom, allowedSecUrl } from "./sec.mjs";
import { config, secReady } from "./config.mjs";
import { externalFetch } from "./external.mjs";
import { fetchImage, imageSize, safeSvg } from "./media.mjs";
import { measure } from "./image-analysis.mjs";
import { getRecord, putRecord } from "./media-store.mjs";
import {
  publicFetcher, PUBLIC_UA, registrableDomain, parseHtml, elements, ancestors, classList, pageMeta, jsonLd, ldTypes, ldUrl,
  absoluteUrl, decodeEntities
} from "./public-fetch.mjs";

const DAY = 86400000;
export const DOMAIN_TTL = 30 * DAY;
const NEGATIVE_TTL = 7 * DAY;
export const ACCEPT_SCORE = 5;
const STOP_SCORE = 6;

/* ---------------- SEC access at <= 3 requests/second from this module ---------------- */
let secNext = 0;
async function pacedSec(url, options) {
  const wait = Math.max(0, secNext - Date.now());
  secNext = Math.max(secNext, Date.now()) + 340;
  if (wait) await new Promise(r => setTimeout(r, wait));
  if (options?.json || !/^https:\/\/www\.sec\.gov\/Archives\//.test(url)) return secFetch(url, options);
  return secArchiveHead(url);
}
/* Filing documents can exceed sec.mjs's 5 MB text cap (JPM's 10-K); the website sentence sits in
 * Item 1, so read only the head of the document. Same User-Agent and allowlist as sec.mjs. */
const HEAD_BYTES = 6_000_000;
async function secArchiveHead(url) {
  if (!secReady()) throw new Error("SEC_USER_AGENT must identify the operator and a monitored email");
  if (!allowedSecUrl(url)) throw new Error("Disallowed SEC URL");
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(url, { headers: { "User-Agent": config.userAgent, Accept: "text/html,*/*;q=0.5" }, redirect: "error", signal: AbortSignal.timeout(30_000) });
    if ((response.status === 429 || response.status >= 500) && attempt === 0) {
      await response.body?.cancel().catch(() => {});
      const after = Number(response.headers.get("retry-after"));
      await new Promise(r => setTimeout(r, Number.isFinite(after) && after > 0 ? Math.min(30000, after * 1000) : 2000));
      continue;
    }
    if (!response.ok) { await response.body?.cancel().catch(() => {}); throw new Error("SEC responded " + response.status); }
    const reader = response.body.getReader(), chunks = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); size += value.length;
      if (size >= HEAD_BYTES) { await reader.cancel().catch(() => {}); break; }
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  throw new Error("SEC request attempts exhausted");
}

/* ---------------- filing text scan ---------------- */
const NAME_STOP = new Set(("inc incorporated corp corporation co company companies ltd limited llc lp plc sa nv ag se the of and & group holdings holding " +
  "international global fund trust enterprises industries de del new").split(" "));
// Words too common in company names to prove a website belongs to this company on their own.
const GENERIC = new Set(("american america national first united general financial finance bancorp bancshares bank banc banking capital technologies technology tech " +
  "therapeutics pharmaceuticals pharma pharmaceutical bio biosciences bioscience biotherapeutics biopharma biopharmaceuticals energy resources systems solutions services partners " +
  "realty reit properties property communications networks network software medical health healthcare acquisition income investment investments investors real estate " +
  "savings community federal mutual insurance brands foods products entertainment media digital data labs laboratories sciences science life oil gas mining gold silver " +
  "minerals metals power electric water motors automotive semiconductor semiconductors devices instruments materials chemical chemicals retail stores restaurants hotels " +
  "resorts airlines logistics transportation shipping marine petroleum royalty renewable clean green solar wind north south east west pacific atlantic western eastern " +
  "southern northern central home homes credit lending mortgage asset assets management advisors strategies opportunities corp inc innovations innovative industrial " +
  "manufacturing world worldwide usa us china interactive mobile online cloud ai intelligence health wellness care diagnostics genetics genomics medicines oncology " +
  "sports gaming games apparel fashion consumer trading markets exchange payments pay energy infrastructure").split(" "));

export function nameTokens(name) {
  return String(name || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/([a-z0-9])\s*&\s*([a-z0-9])(?![a-z0-9]{2})/g, "$1$2").replace(/&/g, " and ")
    .replace(/(\w)['’.-](?=\w)/g, "$1").split(/[^a-z0-9]+/).filter(t => t.length >= 2 && !NAME_STOP.has(t));
}
const distinctive = name => nameTokens(name).filter(t => t.length >= 3 && !GENERIC.has(t));

// Hard blocklist on the whole registrable domain: never a company's own site.
const BLOCKED = new Set(("sec.gov investor.gov xbrl.org xbrl.us fasb.org w3.org ifrs.org iso.org pcaobus.org finra.org sipc.org nasdaq.com nyse.com otcmarkets.com " +
  "sedarplus.ca sedar.com sedarplus.com cboe.com tsx.com tmx.com asx.com.au lseg.com londonstockexchange.com euronext.com nasdaqomxnordic.com " +
  "workiva.com toppanmerrill.com dfinsolutions.com rrdonnelley.com donnelley.com broadridge.com proxyvote.com edocumentview.com proxydocs.com viewproxy.com " +
  "computershare.com computershare.com.au equiniti.com equiniti.co.uk astfinancial.com amstock.com continentalstock.com vstocktransfer.com transferonline.com " +
  "signaturestocktransfer.com pacificstocktransfer.com colonialstock.com stctransfer.com actionstocktransfer.com westcoaststocktransfer.com issuerdirect.com " +
  "securitiestransfer.com issuertransfer.com olde-monmouth.com corporatestock.com mstransfer.com globalstocktransfer.com empirestock.com " +
  "globenewswire.com businesswire.com prnewswire.com accesswire.com newsfilecorp.com marketwired.com cision.com einpresswire.com prweb.com " +
  "q4inc.com q4cdn.com q4web.com gcs-web.com notified.com investorroom.com irwebpage.com ir-site.com tikr.com shareholder.com " +
  "virtualshareholdermeeting.com meetnow.global envisionreports.com investorvote.com onlineproxy.com cstproxy.com cstproxyvote.com " +
  "linkedin.com twitter.com x.com facebook.com youtube.com instagram.com tiktok.com threads.net pinterest.com " +
  "bloomberg.com reuters.com wsj.com ft.com cnbc.com adobe.com creativecommons.org ishares.com msci.com spglobal.com ftserussell.com cusip.com " +
  "kpmg.com ey.com pwc.com deloitte.com bdo.com grantthornton.com marcumllp.com rsmus.com bakertilly.com mossadams.com malonebailey.com " +
  "wolterskluwer.com cscglobal.com ctcorporation.com who.int un.org oecd.org europa.eu wikipedia.org").split(" "));
// Big third-party sites that filings mention constantly; allowed only when the company's name says so (Apple -> apple.com).
const THIRD_PARTY = new Set("google.com apple.com microsoft.com amazon.com aws.amazon.com android.com".split(" "));
const TLD_OK = /^(?:[a-z]{2}|com|net|org|io|co|ai|bio|info|biz|tech|app|health|inc|global|group|bank|capital|energy|finance|media|network|online|solutions|systems|ventures|xyz|one|life|care|us|eu|asia|holdings|company|technology|pharma|science|games)$/;
export function blockedDomain(domain, name = "") {
  const d = String(domain || "").toLowerCase();
  if (!d || !d.includes(".")) return true;
  if (BLOCKED.has(d) || /\.(gov|mil|edu)(\.[a-z]{2})?$/.test(d) || /^gov\.[a-z]{2}$/.test(d)) return true;
  if (!TLD_OK.test(d.split(".").at(-1))) return true;
  if (/\.(htm|html|pdf|jpe?g|png|gif|xml|xsd|txt|js|aspx?|php|css|zip)$/.test(d)) return true;
  if (THIRD_PARTY.has(d)) { const label = d.split(".")[0]; return !nameTokens(name).includes(label); }
  return false;
}

export function filingText(html) {
  let h = String(html || "");
  h = h.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ").replace(/<ix:header>[\s\S]*?<\/ix:header>/gi, " ");
  h = h.replace(/<[^>]+>/g, " ");
  return decodeEntities(h).replace(/\s+/g, " ");
}
const URL_RX = /(?:https?:\/\/)?www\.[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,6}(?![a-z0-9-])|https?:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,6}(?![a-z0-9-])/gi;
const BARE_RX = /(?<![@/.a-z0-9-])[a-z0-9-]{2,40}(?:\.[a-z0-9-]+)?\.(?:com|net|org|io|co|ai|bio|us|one|cn|hk|il|ca|uk|de|ch|sg)(?![a-z0-9-])/gi;
const CONTEXT_I = /(our (?:corporate |internet )?web ?site|available information|internet (?:address|site|website)|web ?site (?:address )?(?:is|at)|located at|can be (?:found|accessed) at|visit(?:ing)? (?:us at|our))/i;
const CONTEXT_ABOUT = /\bAbout [A-Z]/;

/* Score candidate registrable domains in one document's text (research step1b). */
export function scanDomains(text, name) {
  const scores = new Map(), hits = new Map();
  const tokens = nameTokens(name).filter(t => t.length > 2);
  // Short tokens ("air", "ups") count only at the start of the label: "hawaiianairlines" is not Alaska Air.
  const nameHit = d => { const l = d.split(".")[0].replace(/-/g, ""); return tokens.some(w => (w.length >= 4 ? l.includes(w) : l.startsWith(w))); };
  const add = (d, s, snippet) => {
    scores.set(d, (scores.get(d) || 0) + s);
    hits.set(d, (hits.get(d) || 0) + 1);
    if (snippet && !add.snips.has(d)) add.snips.set(d, snippet);
  };
  add.snips = new Map();
  const ctxAt = index => { const c = text.slice(Math.max(0, index - 250), index); return CONTEXT_I.test(c) || CONTEXT_ABOUT.test(c); };
  for (const m of text.matchAll(URL_RX)) {
    const d = registrableDomain(m[0]);
    if (blockedDomain(d, name)) continue;
    const ctx = ctxAt(m.index);
    add(d, 1 + (ctx ? 5 : 0) + (nameHit(d) ? 4 : 0), ctx ? text.slice(Math.max(0, m.index - 120), m.index + m[0].length).trim() : null);
  }
  for (const m of text.matchAll(BARE_RX)) {
    if (/(?:www\.|\/\/|@)\s*$/i.test(text.slice(Math.max(0, m.index - 12), m.index))) continue;
    const d = registrableDomain(m[0]);
    if (blockedDomain(d, name) || !ctxAt(m.index)) continue;
    add(d, 3 + (nameHit(d) ? 4 : 0), text.slice(Math.max(0, m.index - 120), m.index + m[0].length).trim());
  }
  return [...scores].map(([domain, score]) => ({ domain, score, hits: hits.get(domain), snippet: add.snips.get(domain) || null }))
    .sort((a, b) => b.score - a.score || b.hits - a.hits);
}
const merge = (total, list, source) => {
  for (const c of list) {
    const t = total.get(c.domain) || { domain: c.domain, score: 0, hits: 0, sources: [], snippet: null };
    t.score += c.score; t.hits += c.hits;
    if (!t.sources.includes(source)) t.sources.push(source);
    t.snippet = t.snippet || c.snippet;
    total.set(c.domain, t);
  }
};
/* amazon.com and amazon.in (a subsidiary's country site) are one candidate: the member the
 * filing introduces as the website wins, else .com, else the most mentioned. */
const label = d => String(d).split(".")[0];
function ranked(total) {
  const groups = new Map();
  for (const c of total.values()) { const g = groups.get(label(c.domain)) || []; g.push(c); groups.set(label(c.domain), g); }
  const out = [];
  for (const g of groups.values()) {
    g.sort((a, b) => Boolean(b.snippet) - Boolean(a.snippet) || (b.domain.endsWith(".com") - a.domain.endsWith(".com")) || b.score - a.score);
    const rep = { ...g[0], score: g.reduce((n, c) => n + c.score, 0), hits: g.reduce((n, c) => n + c.hits, 0), sources: [...new Set(g.flatMap(c => c.sources))] };
    out.push(rep);
  }
  return out.sort((a, b) => b.score - a.score || b.hits - a.hits);
}

const FORM_TIERS = [["10-K", "20-F", "40-F", "N-CSR"], ["10-K/A", "20-F/A", "40-F/A"], ["10-Q", "6-K"], ["S-1", "F-1", "424B4", "S-4", "F-4", "424B3", "S-1/A", "F-1/A"]];
export function pickFilings(submissions) {
  const r = submissions?.filings?.recent || {};
  const forms = r.form || [];
  const picks = [];
  for (const tier of FORM_TIERS) {
    const i = forms.findIndex(f => tier.includes(f));
    if (i >= 0 && r.primaryDocument?.[i]) picks.push({ form: forms[i], accession: r.accessionNumber[i], document: r.primaryDocument[i], filed: r.filingDate?.[i] });
  }
  const eightK = [];
  forms.forEach((f, i) => { if (f === "8-K" && eightK.length < 3) eightK.push({ form: "8-K", accession: r.accessionNumber[i], filed: r.filingDate?.[i] }); });
  return { picks, eightK };
}
const archive = (cik, accession, file) => "https://www.sec.gov/Archives/edgar/data/" + Number(cik) + "/" + String(accession).replace(/-/g, "") + "/" + file;
const okFile = f => /^[A-Za-z0-9][A-Za-z0-9._-]{0,149}$/.test(String(f || ""));

/* Filing-text scan. deps.sec(url, {json}) -> parsed JSON or text. */
export async function filingDomains({ cik, name, submissions }, deps = {}) {
  const sec = deps.sec || pacedSec;
  const total = new Map(), used = [];
  let subs = submissions, picks, eightK = [];
  const padded = String(Number(cik)).padStart(10, "0");
  if (!subs) {
    try { subs = await sec("https://data.sec.gov/submissions/CIK" + padded + ".json", { json: true }); }
    catch (e) {
      // Long-lived filers (JPM) exceed the submissions size cap: list annual reports from the browse feed instead.
      if (!/too large/i.test(String(e?.message))) throw e;
      picks = [];
      for (const form of ["10-K", "20-F", "10-Q"]) {
        const atom = parseAtom(await sec("https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=" + padded + "&type=" + encodeURIComponent(form) + "&dateb=&owner=include&count=5&output=atom"), { forms: [form] });
        const entry = atom.find(x => String(x.title || "").toUpperCase().startsWith(form + " "));
        if (!entry) continue;
        const idx = await sec(archive(cik, entry.accession, "index.json"), { json: true });
        const doc = (idx?.directory?.item || []).filter(x => /\.html?$/i.test(x.name) && !/index/i.test(x.name) && !/^R\d+\.htm/i.test(x.name) && !/ex-?\d/i.test(x.name))
          .sort((a, b) => Number(b.size || 0) - Number(a.size || 0))[0]?.name;
        if (doc) { picks.push({ form, accession: entry.accession.replace(/^(\d{10})(\d{2})(\d{6})$/, "$1-$2-$3"), document: doc, filed: String(entry.publishedAt || "").slice(0, 10) }); break; }
      }
    }
  }
  const companyName = name || subs?.name || "";
  if (!picks) ({ picks, eightK } = pickFilings(subs));
  const top = () => ranked(total)[0]?.score || 0;
  for (const p of picks) {
    if (!okFile(p.document)) continue;
    try {
      const html = await sec(archive(cik, p.accession, p.document));
      merge(total, scanDomains(filingText(html), companyName), p.form);
      used.push({ form: p.form, accession: p.accession, filed: p.filed });
    } catch (e) { used.push({ form: p.form, accession: p.accession, error: String(e?.message || e).slice(0, 80) }); }
    if (top() >= STOP_SCORE) break;
  }
  if (top() < STOP_SCORE) {
    for (const p of eightK) {
      try {
        const idx = await sec(archive(cik, p.accession, "index.json"), { json: true });
        const ex = (idx?.directory?.item || []).map(x => x.name).find(n => /ex.?99/i.test(n) && /\.(htm|html|txt)$/i.test(n) && okFile(n));
        if (!ex) continue;
        const html = await sec(archive(cik, p.accession, ex));
        merge(total, scanDomains(filingText(html), companyName), "8-K EX-99");
        used.push({ form: "8-K EX-99", accession: p.accession, filed: p.filed });
      } catch (e) { used.push({ form: "8-K", accession: p.accession, error: String(e?.message || e).slice(0, 80) }); }
      if (top() >= STOP_SCORE) break;
    }
  }
  return { candidates: ranked(total).slice(0, 6), used, name: companyName, website: subs?.website || null };
}

/* ---------------- Wikidata P856 ---------------- */
export async function wikidataWebsites(cik, deps = {}) {
  const plain = String(Number(cik)), padded = plain.padStart(10, "0");
  const query = `SELECT ?w WHERE { VALUES ?cik { "${plain}" "${padded}" } ?item wdt:P5531 ?cik . ?item p:P856 ?s . ?s ps:P856 ?w ; wikibase:rank ?r .
    FILTER(?r != wikibase:DeprecatedRank) FILTER NOT EXISTS { ?s pq:P582 [] } } LIMIT 20`;
  const fetcher = deps.external || externalFetch;
  const payload = await fetcher("https://query.wikidata.org/sparql", {
    json: true, method: "POST", accept: "application/sparql-results+json", maxBytes: 500_000,
    headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ query }).toString()
  });
  const sites = (payload?.results?.bindings || []).map(b => b?.w?.value).filter(v => typeof v === "string");
  return [...new Set(sites.map(s => registrableDomain(s)).filter(d => d && d.includes(".")))];
}

/* ---------------- homepage confirmation ---------------- */
const homeCache = new Map(); // domain -> {at, value}
function remember(domain, value) {
  homeCache.set(domain, { at: Date.now(), value });
  if (homeCache.size > 200) homeCache.delete(homeCache.keys().next().value);
  return value;
}
/* Fetch the homepage (www first). -> {status, url, html?, root?, meta?} */
export async function fetchHomepage(domain, deps = {}) {
  const hit = homeCache.get(domain);
  if (!deps.page && hit && Date.now() - hit.at < 15 * 60 * 1000) return hit.value;
  const page = deps.page || (url => publicFetcher().page(url));
  let last = null;
  for (const url of ["https://www." + domain + "/", "https://" + domain + "/"]) {
    const r = await page(url);
    last = r;
    if (r.status === "ok") {
      const root = parseHtml(r.html);
      return remember(domain, { status: "ok", url: r.url, html: r.html, root, meta: pageMeta(root, r.url) });
    }
    if (r.status === "blocked" || r.status === "rate-limited" || r.status === "robots") break;
  }
  return remember(domain, { status: last?.status || "unreachable", url: last?.url, code: last?.code });
}
/* Name evidence the site states about itself. */
export function siteNames(root, meta) {
  const names = [meta?.title, meta?.["og:site_name"], meta?.["og:title"], meta?.["application-name"]];
  for (const o of jsonLd(root)) {
    if (ldTypes(o).some(t => /Organization|Corporation|WebSite|Brand/.test(t)) && typeof o.name === "string") names.push(o.name);
  }
  return names.filter(Boolean).map(s => String(s).slice(0, 300));
}
/* True when a site name shares a distinctive token (or the whole compact name) with the SEC name. */
export function confirmsName(siteTexts, secName, domain) {
  const tokens = distinctive(secName);
  const all = nameTokens(secName);
  const text = siteTexts.join(" | ");
  const siteTokens = new Set(nameTokens(text));
  const compact = nameTokens(text).join("");
  const label = String(domain || "").split(".")[0].replace(/-/g, "");
  if (tokens.some(t => siteTokens.has(t) || (t.length >= 5 && compact.includes(t)))) return { ok: true, why: "token" };
  if (all.length >= 2 && compact.includes(all.join(""))) return { ok: true, why: "phrase" };
  // Very short names ("NN, Inc.") must be the whole site name.
  if (all.length && siteTexts.some(n => { const t = nameTokens(n); return t.length === all.length && t.every((x, i) => x === all[i]); })) return { ok: true, why: "exact" };
  // Names built only from common words ("First Financial") need the full phrase; initialisms (KKR) count as distinctive.
  if (all.length && all.every(t => GENERIC.has(t)) && label && label.length >= 4 && compact.includes(label) && all.join("").startsWith(label.slice(0, 4))) return { ok: true, why: "label" };
  return { ok: false };
}
/* The domain label itself carries the company's name, initials (amd.com) or ticker (cht.com.tw). */
export function domainHasToken(domain, name, ticker = "") {
  const l = String(domain).split(".")[0].replace(/-/g, "");
  const all = nameTokens(name);
  const initials = all.map(t => t[0]).join("");
  return distinctive(name).some(t => l.includes(t) || (l.length >= 4 && t.startsWith(l))) ||
    (all.length >= 2 && initials.length >= 3 && l === initials) || (String(ticker).length >= 3 && l === String(ticker).toLowerCase().replace(/[^a-z0-9]/g, ""));
}

/* ---------------- companyDomain ---------------- */
export async function companyDomain({ cik, name, ticker, submissions } = {}, deps = {}) {
  const id = String(Number(cik || 0));
  if (!/^\d{1,10}$/.test(id) || id === "0") return null;
  const key = id.padStart(10, "0");
  const store = deps.store || { getRecord, putRecord };
  if (!deps.refresh) {
    const cached = await store.getRecord("domain", key).catch(() => null);
    if (cached) return cached.domain ? cached : null;
  }
  let filing, wikidata = [], unknown = false;
  try { filing = await filingDomains({ cik: id, name, submissions }, deps); }
  catch (e) { unknown = true; filing = { candidates: [], used: [], error: String(e?.message || e).slice(0, 120), name }; }
  const secName = name || filing.name || "";
  try { wikidata = await wikidataWebsites(id, deps); }
  catch (e) { if (/429|5\d\d|timeout|abort/i.test(String(e?.upstreamStatus || e?.message))) unknown = unknown || !filing.candidates.length; }

  const accepted = filing.candidates.filter(c => c.score >= ACCEPT_SCORE);
  const order = [];
  for (const c of accepted.slice(0, 3)) order.push({ domain: c.domain, from: "filing", filing: c, lowTier: c.sources.every(s => s === "8-K EX-99"), wikidata: wikidata.some(w => w === c.domain || label(w) === label(c.domain)) });
  const wdOrder = [...wikidata].sort((a, b) => accepted.some(c => label(c.domain) === label(b)) - accepted.some(c => label(c.domain) === label(a)) || b.endsWith(".com") - a.endsWith(".com"));
  for (const w of wdOrder) if (!order.some(o => o.domain === w || label(o.domain) === label(w)) && !blockedDomain(w, secName)) order.push({ domain: w, from: "wikidata", filing: null, lowTier: false, wikidata: true });

  const tried = [];
  // Pass 1: does the homepage name the company?
  const examine = async cand => {
    const home = await fetchHomepage(cand.domain, deps);
    const evidence = { filing: cand.filing ? { score: cand.filing.score, hits: cand.filing.hits, forms: cand.filing.sources, snippet: cand.filing.snippet?.slice(-180) || null } : null,
      wikidata: cand.wikidata, homepage: { status: home.status, url: home.url || null } };
    tried.push({ domain: cand.domain, status: home.status });
    let names = [], confirmed = null;
    if (home.status === "ok") {
      let finalDomain = registrableDomain(new URL(home.url).hostname);
      // Country redirects (amazon.com -> amazon.in from this server's location) keep the filed domain.
      if (finalDomain !== cand.domain && label(finalDomain) === label(cand.domain)) finalDomain = cand.domain;
      names = siteNames(home.root, home.meta);
      const conf = confirmsName(names, secName, finalDomain);
      evidence.homepage.title = (home.meta?.title || "").slice(0, 160);
      evidence.homepage.siteName = home.meta?.["og:site_name"] || null;
      if (conf.ok && !blockedDomain(finalDomain, secName)) {
        const moved = finalDomain !== cand.domain;
        confirmed = { domain: finalDomain, host: new URL(home.url).hostname, homepage: home.url, confidence: cand.lowTier && !cand.wikidata ? "medium" : "high", confirmed: true,
          method: cand.from + (cand.wikidata && cand.from === "filing" ? "+wikidata" : "") + (moved ? "+redirect" : "") + "+title", evidence: { ...evidence, match: conf.why } };
      }
    }
    return { cand, home, names, evidence, confirmed };
  };
  // Pass 2: no page named the company. Two independent sources agreeing, or a strong annual-report
  // domain that itself carries the name, still stand (marked unconfirmed); 8-K-only domains never do.
  const fallback = ({ cand, home, names, evidence }) => {
    if (names.some(n => /domain (?:is )?for sale|parked|buy this domain/i.test(n))) return null;
    const ok = home.status === "ok";
    const base = { domain: cand.domain, host: ok ? new URL(home.url).hostname : null, homepage: ok ? home.url : null, confirmed: false, evidence };
    if (cand.from === "filing") {
      if (cand.wikidata && cand.filing.score >= ACCEPT_SCORE) return { ...base, confidence: "high", method: "filing+wikidata" + (ok ? "+untitled" : "+unconfirmed") };
      if (cand.lowTier || cand.filing.score < 10) return null;
      if (home.status !== "unreachable" && domainHasToken(cand.domain, secName, ticker)) return { ...base, confidence: "medium", method: "filing+domain-name" + (ok ? "" : "+unconfirmed") };
      // "Our website address is www.x.com" in an annual/quarterly report, and the site answers but its
      // title is a builder default ("HOME | Mysite"): keep it, at medium confidence.
      if (ok && cand.filing.snippet && registrableDomain(new URL(home.url).hostname) === cand.domain) return { ...base, confidence: "medium", method: "filing+context" };
      return null;
    }
    if (!accepted.length && home.status !== "unreachable" && domainHasToken(cand.domain, secName, ticker)) return { ...base, confidence: "low", method: "wikidata+domain-name" + (ok ? "" : "+unconfirmed") };
    return null;
  };
  // Filing candidates first (confirmed, then fallback); Wikidata-only websites only after that, so
  // a bot-walled walmart.com is not replaced by a confirmed but secondary walmartphotocentre.ca.
  let result = null;
  for (const group of [order.filter(o => o.from === "filing").slice(0, 3), order.filter(o => o.from !== "filing").slice(0, 2)]) {
    const seen = [];
    for (const cand of group) {
      const x = await examine(cand);
      if (x.confirmed) { result = x.confirmed; break; }
      seen.push(x);
    }
    if (!result) for (const x of seen) { result = fallback(x); if (result) break; }
    if (result) break;
  }
  if (result) {
    result = { ...result, cik: key, ticker: ticker || null, name: secName, filingsUsed: filing.used.map(u => u.form), tried, resolvedAt: new Date().toISOString() };
    await store.putRecord("domain", key, result, DOMAIN_TTL).catch(() => {});
    return result;
  }
  const blocked = tried.some(t => t.status === "blocked" || t.status === "rate-limited");
  if (!unknown && !blocked) await store.putRecord("domain", key, { domain: null, cik: key, tried, candidates: filing.candidates.slice(0, 3), resolvedAt: new Date().toISOString() }, NEGATIVE_TTL).catch(() => {});
  return null;
}

/* ---------------- website logo candidates ---------------- */
const BUILDER_DEFAULT = /media\.base44\.com|static\.parastorage\.com\/client\/pfavico|squarespace\.com\/universal\/default-favicon|wp-includes\/images\/w-logo|\/favicon-default|cookieyes|gravatar\.com/i;
const NOT_LOGO = /flag|\blang|language|globe|sprite|social|icon-|facebook|twitter|linkedin|youtube|instagram|tiktok|search|hamburger|menu|close|arrow|chevron|cart|avatar|badge-|award|certif|partner|client|customer|caret|play-button/i;
const LIGHT = /white|light|reverse|negative|inverse|knockout|[_-]wht\b|[_-]wh\b|[_-]rev\b/i;
// File names, not hosts: a WordPress upload on saver.one must not "name" SaverOne just by its URL.
const fileNames = v => String(v || "").split(/[\s,]+/).filter(x => /[./]/.test(x)).map(u => decodeURIComponent(u.split(/[?#]/)[0].split("/").pop() || "")).join(" ");
const attrText = node => ["alt", "class", "id", "aria-label", "title"].map(k => node.attrs?.[k] || "").join(" ") + " " +
  ["src", "data-src", "srcset", "data-srcset"].map(k => fileNames(node.attrs?.[k])).join(" ");
function imgSource(node, base) {
  for (const k of ["src", "data-src", "data-lazy-src", "data-original"]) {
    const v = node.attrs[k];
    if (v && !/^data:/i.test(v)) return absoluteUrl(v, base);
  }
  const ss = node.attrs.srcset || node.attrs["data-srcset"];
  if (ss) return absoluteUrl(ss.split(",")[0].trim().split(/\s+/)[0], base);
  return null;
}
function isHomeHref(href, base) {
  if (href == null) return false;
  let u;
  try { u = new URL(href, base); } catch { return false; }
  const b = new URL(base);
  if (u.hostname.replace(/^www\./, "") !== b.hostname.replace(/^www\./, "")) return false;
  const p = u.pathname.replace(/\/+$/, "");
  return p === "" || /^\/[a-z]{2}(?:[-_][a-z]{2})?$/i.test(p) || /^\/(?:index\.(?:html?|php|aspx?)|home(?:page)?(?:\.aspx?)?|default\.aspx)$/i.test(p) || p === b.pathname.replace(/\/+$/, "");
}
// body/html classes describe the whole page ("elementor-location-footer"), not the element's place.
const inside = (node, rx, depth = 6) => ancestors(node).slice(0, depth).filter(a => a.tag !== "body" && a.tag !== "html")
  .some(a => rx.test(a.tag) || rx.test(classList(a).join(" ") + " " + (a.attrs.id || "") + " " + (a.attrs.role || "")));
const declaredHeight = node => { const h = Number(String(node.attrs.height || "").replace(/px$/, "")); return Number.isFinite(h) && h > 0 ? h : null; };

/* Pure extraction from a parsed homepage. -> [{url|svg, kind, score, feature flags}] in preference order. */
export function extractLogoCandidates(root, pageUrl, { name = "", domain = "" } = {}) {
  const meta = pageMeta(root, pageUrl);
  const base = meta.base || pageUrl;
  const tokens = [...new Set([...distinctive(name), ...nameTokens(name).filter(t => t.length >= 3 && !/^\d+$/.test(t)), String(domain).split(".")[0]].filter(t => t && t.length >= 3))];
  const hasToken = s => { const x = String(s || "").toLowerCase().replace(/[-_\s]/g, ""); return tokens.some(t => x.includes(t)); };
  const out = [];
  // 1. JSON-LD Organization.logo
  for (const o of jsonLd(root)) {
    if (!ldTypes(o).some(t => /Organization|Corporation|Brand|LocalBusiness|NGO|Company/i.test(t))) continue;
    const url = absoluteUrl(ldUrl(o.logo), base);
    if (!url || BUILDER_DEFAULT.test(url)) continue;
    const file = decodeURIComponent(url.split(/[?#]/)[0].split("/").pop() || "");
    if (!/logo/i.test(file) && !hasToken(file)) continue;
    if (!out.some(c => c.url === url)) out.push({ url, kind: "jsonld", score: 10 });
  }
  // 2. Header home-link logo: first in DOM order.
  const imgs = [];
  let idx = 0, header = null;
  for (const node of elements(root)) {
    if (node.tag !== "img" && node.tag !== "svg") continue;
    if (node.tag === "svg" && ancestors(node).some(a => a.tag === "svg")) continue;
    if (/^[01](?:px)?$/.test(String(node.attrs.width || "").trim()) || /^[01](?:px)?$/.test(String(node.attrs.height || "").trim()) || /display:\s*none/i.test(node.attrs.style || "")) continue; // tracking pixels
    const i = idx++;
    const anchors = ancestors(node);
    const a = anchors.find(x => x.tag === "a");
    const attrs = attrText(node) + " " + anchors.slice(0, 4).map(x => classList(x).join(" ") + " " + (x.attrs.id || "") + " " + (x.attrs["aria-label"] || "")).join(" ");
    const f = {
      idx: i,
      home: Boolean(a && isHomeHref(a.attrs.href, base)),
      logoAttr: /logo|brand/i.test(attrs),
      nameMatch: hasToken(attrText(node)) || hasToken(a?.attrs?.["aria-label"]) || hasToken(a?.attrs?.title),
      fileMatch: hasToken(fileNames(node.attrs.src || node.attrs["data-src"] || "")),
      header: inside(node, /^(header|nav)$|header|navbar|masthead|site-branding|top-?bar/i, 12),
      footer: inside(node, /^footer$|footer/i, 12),
      bad: NOT_LOGO.test(attrText(node).replace(/logo/gi, "")),
      light: LIGHT.test(attrText(node))
    };
    const url = node.tag === "img" ? imgSource(node, base) : null;
    if (node.tag === "img" && !url) continue;
    const svgText = node.tag === "svg" ? svgMarkup(node) : null;
    imgs.push({ node, url, svgText, f });
    // The header home-link logo; or, on sites without a linked logo, one of the first images whose
    // file says "logo" and whose attributes name the company.
    if (!header && !f.footer && !f.bad && ((f.home && (f.logoAttr || f.nameMatch) && (f.header || i < 8)) || (i < 4 && f.logoAttr && f.nameMatch))) {
      const h = declaredHeight(node);
      if (h != null && h < 20) continue;
      if (node.tag === "svg" && (!svgText || !/viewbox/i.test(svgText) || /<use\b/i.test(svgText) || svgText.length < 300)) continue;
      header = imgs.at(-1);
    }
  }
  if (header) {
    if (!header.url || !out.some(c => c.url === header.url)) out.push(header.url ? { url: header.url, kind: "header", score: 8, light: header.f.light } : { url: null, svg: header.svgText, kind: "header-inline-svg", score: 7, light: header.f.light });
    // 3. white/light/reverse variant of the same mark anywhere on the page.
    const stem = u => decodeURIComponent(String(u || "").split(/[?#]/)[0].split("/").pop() || "").toLowerCase().replace(/\.(svg|png|webp|jpe?g|gif)$/, "")
      .replace(/[-_.]?(white|light|reverse|negative|inverse|knockout|wht|rev|dark|black|color|colour|full|primary|default|\d+x?\d*)\b/g, "").replace(/[-_.]+$/, "");
    const s0 = stem(header.url);
    for (const im of imgs) {
      if (im === header || !im.url || !im.f.light || im.f.bad) continue;
      // Same file stem, or a logo file that itself names the company (a home-linked "K-440-Logo-White" is another brand).
      if ((s0 && s0.length >= 3 && stem(im.url) === s0) || (im.f.logoAttr && im.f.fileMatch)) {
        if (!out.some(c => c.url === im.url)) out.push({ url: im.url, kind: "light-variant", score: 9, light: true });
        break;
      }
    }
  }
  // 4. mask-icon, 5. apple-touch-icon >= 180
  const touch = [];
  for (const node of elements(root)) {
    if (node.tag !== "link" || !node.attrs.href) continue;
    const rel = String(node.attrs.rel || "").toLowerCase();
    const url = absoluteUrl(node.attrs.href, base);
    if (!url || BUILDER_DEFAULT.test(url)) continue;
    if (rel.includes("mask-icon")) { if (!out.some(c => c.url === url)) out.push({ url, kind: "mask-icon", score: 4 }); }
    else if (rel.includes("apple-touch-icon")) {
      const size = Math.max(0, ...String(node.attrs.sizes || "").split(/\s+/).map(s => Number(s.split("x")[0])).filter(Number.isFinite));
      touch.push({ url, kind: "apple-touch-icon", score: 3, declared: size || null });
    }
  }
  touch.sort((a, b) => (b.declared || 0) - (a.declared || 0));
  if (touch[0] && (touch[0].declared == null || touch[0].declared >= 180)) out.push(touch[0]);
  return out;
}
function svgMarkup(node) {
  const ser = n => {
    if (n.text != null) return n.text.replace(/[<&]/g, c => (c === "<" ? "&lt;" : "&amp;"));
    if (/^(script|foreignobject|iframe)$/i.test(n.tag)) return "";
    const attrs = Object.entries(n.attrs).filter(([k, v]) => !/^on/i.test(k) && !/javascript:/i.test(v)).map(([k, v]) => " " + k + '="' + String(v).replace(/[&"<]/g, c => ({ "&": "&amp;", '"': "&quot;", "<": "&lt;" })[c]) + '"').join("");
    const inner = n.raw != null ? "" : n.children.map(ser).join("");
    return "<" + n.tag + attrs + (inner ? ">" + inner + "</" + n.tag + ">" : "/>");
  };
  let s = ser(node);
  if (!/^<svg[^>]*\sxmlns=/.test(s)) s = s.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
  if (/xlink:/.test(s) && !/^<svg[^>]*xmlns:xlink=/.test(s)) s = s.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
  // Case-sensitive SVG attributes were lower-cased by the HTML parser.
  return s.replace(/\sviewbox=/g, " viewBox=").replace(/\spreserveaspectratio=/g, " preserveAspectRatio=").replace(/<lineargradient/g, "<linearGradient").replace(/<\/lineargradient/g, "</linearGradient")
    .replace(/<radialgradient/g, "<radialGradient").replace(/<\/radialgradient/g, "</radialGradient").replace(/\sgradientunits=/g, " gradientUnits=").replace(/\sgradienttransform=/g, " gradientTransform=")
    .replace(/<clippath/g, "<clipPath").replace(/<\/clippath/g, "</clipPath").replace(/\sclippathunits=/g, " clipPathUnits=").replace(/\sfill-rule=/g, " fill-rule=");
}

/* librsvg refuses an XML declaration that lies about the encoding (IMXI says utf-16 in a UTF-8 file)
 * and inline SVGs often carry only a viewBox, which renders at an enormous size. */
export function normalizeSvg(text) {
  let s = String(text).replace(/^\uFEFF/, "").replace(/^\s*<\?xml[^>]*\?>/i, "").replace(/<!DOCTYPE[\s\S]*?(\[[\s\S]*?\])?\s*>/gi, "").trimStart();
  const tag = /<svg\b[^>]*>/i.exec(s)?.[0];
  if (!tag) return s;
  const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(tag);
  const w = /\swidth\s*=\s*["']?\s*([\d.]+)(px)?\s*["']?(?=[\s/>])/i.exec(tag), h = /\sheight\s*=\s*["']?\s*([\d.]+)(px)?\s*["']?(?=[\s/>])/i.exec(tag);
  if (vb && (!w || !h)) {
    const vw = Number(vb[1]), vh = Number(vb[2]);
    if (vw > 0 && vh > 0) {
      const k = 512 / Math.max(vw, vh);
      const fixed = tag.replace(/\s(width|height)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "").replace(/^<svg/i, `<svg width="${Math.round(vw * k)}" height="${Math.round(vh * k)}"`);
      s = s.replace(tag, fixed);
    }
  }
  return s;
}

/* Fetch and check the chosen candidates so the resolver gets bytes it can trust. */
async function loadCandidate(c, pageUrl, deps) {
  if (c.svg) {
    const bytes = Buffer.from(normalizeSvg(c.svg), "utf8");
    if (!safeSvg(bytes) || bytes.length > 400_000) return null;
    return { ...c, bytes, type: "svg", url: pageUrl + "#inline-svg" };
  }
  const fetcher = deps.fetchImage || ((url, o) => fetchImage(url, o));
  const gate = deps.gate || (url => publicFetcher().gate(url));
  const paced = deps.paced || ((url, task) => publicFetcher().paced(url, task));
  let url = c.url;
  if (url.startsWith("http://")) url = "https://" + url.slice(7);
  if (!(await gate(url))) return null;
  let image;
  try { image = await paced(url, () => fetcher(url, { maxBytes: 1_500_000, userAgent: PUBLIC_UA, headers: { Referer: pageUrl } })); }
  catch { return null; }
  if (image.type !== "svg") {
    const size = imageSize(image.bytes, image.type);
    if (c.kind === "apple-touch-icon" && (!size || Math.min(size.width, size.height) < 180)) return null;
    if ((c.kind === "header" || c.kind === "light-variant") && size && size.height < 40 && size.width < 160) return null; // tiny marks like a 35x22 "o."
    if (size) Object.assign(c, { width: size.width, height: size.height });
  }
  const bytes = image.type === "svg" ? Buffer.from(normalizeSvg(image.bytes.toString("utf8")), "utf8") : image.bytes;
  return { ...c, url: image.url, bytes, type: image.type };
}

export async function websiteLogoCandidates({ cik, name, ticker } = {}, deps = {}) {
  const domain = await (deps.companyDomain || companyDomain)({ cik, name, ticker }, deps);
  if (!domain?.domain || domain.confidence === "low") return [];
  const home = await fetchHomepage(domain.domain, deps);
  if (home.status !== "ok") return [];
  const companyName = name || domain.name || "";
  const list = extractLogoCandidates(home.root, home.url, { name: companyName, domain: domain.domain }).slice(0, 5);
  const loaded = [];
  for (const c of list) {
    const x = await loadCandidate(c, home.url, deps);
    if (x) loaded.push(x);
  }
  // Prefer the light variant when the primary mark would vanish on the dark page.
  const variant = loaded.find(c => c.kind === "light-variant");
  const primary = loaded.find(c => c.kind === "jsonld" || c.kind.startsWith("header"));
  if (variant && primary) {
    let dark = !primary.light;
    try { const m = await (deps.measure || measure)(primary.bytes, primary.type); dark = m.visible < 0.5; } catch { /* keep heuristic */ }
    variant.score = dark ? primary.score + 1 : primary.score - 1;
  }
  loaded.sort((a, b) => b.score - a.score);
  return loaded.map(({ url, kind, score, bytes, type, width, height }) => ({ url, kind, score, bytes, type, width: width || null, height: height || null, domain: domain.domain, pageUrl: home.url }));
}
