/* Company logo resolution: the right mark for the company behind a CIK, prepared to sit on the
 * dark page with no tile around it.
 *
 * Sources (all keyless, fetched server-side through fetchImage):
 *   S1 stockanalysis light/dark SVG   S2 Wikipedia infobox via the CIK's Wikidata item (P154 fallback)
 *   S3 companiesmarketcap light/.D    S4 FMP   S5 EODHD   S6 nvstly   S7 the company's own website
 * Every wrong logo seen in research came from a recycled ticker or a rebrand, so a CIK whose SEC
 * history shows a recent name change or a fresh listing ("identity risk") only accepts a
 * ticker-keyed image when it agrees in shape (IoU >= 0.5) with the CIK-keyed Wikipedia logo.
 * Agreement is only ever used as confirmation: different but correct marks (symbol vs wordmark)
 * routinely disagree. A 429/5xx/timeout is "unknown", never "missing", and an incomplete
 * negative result is not cached. */
import { createHash } from "node:crypto";
import { fetchImage, assertPublic } from "./media.mjs";
import sharp from "sharp";
import { rasterize, measureRaster, debox, liftDark, iou, luminance, contrast, PAGE_BG } from "./image-analysis.mjs";
import { config } from "./config.mjs";
import { putMedia, getRecord, putRecord } from "./media-store.mjs";
import { createCache } from "./cache.mjs";
import { externalFetch, contactAgent } from "./external.mjs";
import { secFetch } from "./sec.mjs";
import { tickerIndex, tickerRecord } from "./intelligence.mjs";

const DAY = 86_400_000;
export const LOGO_TTL = 30 * DAY;
export const NEGATIVE_TTL = 7 * DAY;
export const PARTIAL_TTL = DAY; // found a logo, but a better-ranked source could not be reached
const RISK_MONTHS = 36;
const RISK_FORMS = new Set(["8-A12B", "8-A12G", "424B4", "S-1", "F-1", "S-4"]);
const AGREE = 0.5;
const TILE_SERVICES = new Set(["fmp", "eodhd", "nvstly"]);
const SQUARE_MAX = 1.6, WIDE_MIN = 1.8;
const SPARQL = "https://query.wikidata.org/sparql";
const US_EXCHANGES = ["wd:Q13677", "wd:Q82059", "wd:Q846626"]; // NYSE, Nasdaq, NYSE American

/* Known-bad (source, ticker) pairs measured in research: the source shows a previous owner of the
 * ticker, an old brand or junk. Operators add more through putRecord('logo-override', cik, ...). */
export const KNOWN_BAD = Object.freeze({
  fmp: new Set(["SI", "CNEY", "OFAL", "PGOL"]),
  eodhd: new Set(["DAVE", "CNR", "YOU", "SI", "SDHY"]),
  cmcDark: new Set(["CNR", "SI"]),
  wikidata: new Set(["PRU", "KR", "ALK", "OPTU"])
});

/* Corrections found by visually auditing a 120-company sample against each company's own site and
 * filings: the usual sources show another company (ALTX, HTCR), a product brand (FMHS), an old
 * identity (CGC, NWFL, ELAB, JPM) or a damaged file (BCAB, DIN). Each replacement is the
 * company's own published file. Operator overrides in the store take precedence; if a file here
 * stops loading, the normal sources are used again. crop trims fractions of the image first. */
export const LOGO_OVERRIDES = Object.freeze({
  "0000775057": { none: true, reason: "ALTX: the stock-logo services show Altex Inc. (Canada), a different company" },
  "0001892322": { url: "https://heartcore-enterprises.com/img/footer-logo.svg", reason: "HTCR: services show HeartCore Co., Ltd.'s mark" },
  "0001811999": { url: "https://farmhouse.tv/FH%20Horizontal.svg", reason: "FMHS: services show the WeedClub product mark" },
  "0001737927": { url: "https://canopygrowth.com/wp-content/uploads/2026/07/Canopy-Growth-Footer-logo.png", crop: { bottom: 0.16 }, reason: "CGC: Wikipedia has the retired gold-tree logo" },
  "0001013272": { url: "https://www.sec.gov/Archives/edgar/data/1013272/000101327226000012/nwfl-20260722xex99_1g001.jpg", reason: "NWFL: services show the retired slab wordmark" },
  "0001840563": { url: "https://pmgcholdings.com/images/logo/nav-logo.png", reason: "ELAB: services show the retired PMGC mark" },
  "0001826892": { url: "https://www.bioatla.com/wp-content/uploads/2016/01/logo-footer.svg", reason: "BCAB: the service file is squashed" },
  "0000049754": { url: "https://en.wikipedia.org/wiki/Special:FilePath/Dine_Brands_Logo.png", reason: "DIN: the service file's black frame and BRANDS line vanish on a dark page" },
  "0000019617": { url: "https://www.jpmorganchase.com/content/dam/jpmorganchase/images/logos/jpmc-logo-white.svg", reason: "JPM: services show the J.P. Morgan segment wordmark, not JPMorganChase" }
});
async function cropped(candidate, crop) {
  if (candidate.status !== "found" || !crop) return candidate;
  const input = sharp(candidate.bytes, candidate.type === "svg" ? { density: 300 } : {});
  const { data, info } = await input.png().toBuffer({ resolveWithObject: true });
  const left = Math.round(info.width * (crop.left || 0)), top = Math.round(info.height * (crop.top || 0));
  const width = Math.max(1, info.width - left - Math.round(info.width * (crop.right || 0))), height = Math.max(1, info.height - top - Math.round(info.height * (crop.bottom || 0)));
  return { ...candidate, bytes: await sharp(data).extract({ left, top, width, height }).png().toBuffer(), type: "png" };
}

/* ---------- small helpers ---------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));
export function normalizeTicker(ticker) {
  const t = String(ticker || "").trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(t) ? t : null;
}
export function normalizeCik(cik) {
  const id = String(cik ?? "").trim().replace(/^CIK/i, "");
  if (!/^\d{1,10}$/.test(id) || Number(id) === 0) return null;
  return id.padStart(10, "0");
}
/* Each service spells share classes its own way: stockanalysis brk.b, the others BRK-B. */
export function tickerForms(ticker) {
  const T = normalizeTicker(ticker);
  if (!T) return null;
  const dash = T.replace(/\./g, "-");
  return { sa: T.toLowerCase().replace(/-/g, "."), cmc: dash, fmp: dash, eodhd: [dash.toLowerCase(), dash], nvstly: dash };
}
export function sourceUrls(ticker) {
  const f = tickerForms(ticker);
  if (!f) return null;
  const sa = encodeURIComponent(f.sa), cmc = encodeURIComponent(f.cmc);
  return {
    s1Light: "https://logos.stockanalysis.com/" + sa + ".svg",
    s1Dark: "https://logos.stockanalysis.com/" + sa + "-dark.svg",
    s3Light: "https://companiesmarketcap.com/img/company-logos/256/" + cmc + ".webp",
    s3Dark: "https://companiesmarketcap.com/img/company-logos/256/" + cmc + ".D.webp",
    fmp: "https://financialmodelingprep.com/image-stock/" + encodeURIComponent(f.fmp) + ".png",
    eodhd: [...new Set(f.eodhd)].map(t => "https://eodhd.com/img/logos/US/" + encodeURIComponent(t) + ".png"),
    nvstly: "https://raw.githubusercontent.com/nvstly/icons/main/ticker_icons/" + encodeURIComponent(f.nvstly) + ".png"
  };
}

/* A missing image is a 4xx "not found" or bytes that are not an image; anything else (429, 5xx,
 * 403 bot walls, timeouts, DNS) only means we could not tell. */
export function classifyFailure(error) {
  const status = error?.upstreamStatus;
  if (status === 404 || status === 410 || status === 400) return "missing";
  if (/Not an image|too large|active content|Unsupported/i.test(String(error?.message))) return "missing";
  return "unknown";
}

/* ---------- identity risk (section 1.1) ---------- */
const PERIODIC = new Set(["10-K", "10-K405", "10-KT", "10-KSB", "10-Q", "10-QSB", "20-F", "40-F", "N-CSR", "N-CSRS"]);
/* Section 1.1. Deviation, measured on the 120-company sample: a fresh registration form (8-A12B for
 * new notes, S-4 for an acquisition, 424B4 for a follow-on) by a company that was already filing
 * periodic reports before the window says nothing about a recycled ticker, and flagged 17 of 48
 * mega/large caps. Those forms only count when the CIK has no periodic report older than the window.
 * Former names count unless they differ from the current name only in case/punctuation/suffix. */
export function identityRisk(submissions, now = Date.now()) {
  if (!submissions || typeof submissions !== "object") return { flag: true, unknown: true, reasons: ["submissions unavailable"] };
  const cut = new Date(now);
  cut.setUTCMonth(cut.getUTCMonth() - RISK_MONTHS);
  const cutoff = cut.toISOString().slice(0, 10);
  const reasons = [];
  const current = nameTokens(submissions.name).join(" ");
  for (const former of Array.isArray(submissions.formerNames) ? submissions.formerNames : []) {
    const to = String(former?.to || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(to) || to < cutoff) continue;
    if (current && nameTokens(former.name).join(" ") === current) continue;
    reasons.push("former name " + String(former.name || "").slice(0, 80) + " until " + to);
  }
  const recent = submissions.filings?.recent || {};
  const forms = Array.isArray(recent.form) ? recent.form : [], dates = Array.isArray(recent.filingDate) ? recent.filingDate : [];
  const olderPages = (Array.isArray(submissions.filings?.files) ? submissions.filings.files : []).some(f => String(f?.filingFrom || "9") < cutoff);
  let established = olderPages;
  for (let i = 0; i < forms.length && !established; i++) if (PERIODIC.has(String(forms[i] || "").toUpperCase()) && String(dates[i] || "9") < cutoff) established = true;
  if (!established) {
    const seen = new Set();
    for (let i = 0; i < forms.length; i++) {
      const form = String(forms[i] || "").toUpperCase(), date = String(dates[i] || "");
      if (RISK_FORMS.has(form) && date >= cutoff && !seen.has(form)) { seen.add(form); reasons.push(form + " filed " + date); }
    }
  }
  return { flag: reasons.length > 0, unknown: false, established, reasons };
}

/* ---------- names ---------- */
const STOP = new Set(["the", "inc", "incorporated", "corp", "corporation", "co", "company", "companies", "group", "holding", "holdings", "plc", "ltd", "limited", "llc", "lp", "nv", "sa", "ag", "se", "de", "del", "and", "of", "trust", "fund", "class", "new"]);
export function nameTokens(name) {
  return String(name || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ").split(" ").filter(t => t && !STOP.has(t));
}
export function namesAgree(secName, label) {
  const a = nameTokens(secName), b = nameTokens(label);
  if (!a.length || !b.length) return false;
  if (a[0] === b[0]) return true;
  // "EXXON MOBIL" vs "ExxonMobil", "JPMORGAN CHASE" vs "JPMorgan Chase"
  const ja = a.join(""), jb = b.join("");
  return ja.startsWith(jb) || jb.startsWith(ja) || ja.startsWith(b[0]) && b[0].length >= 4 || jb.startsWith(a[0]) && a[0].length >= 4;
}

/* ---------- Wikipedia / Wikidata (S2) ---------- */
export function wikidataQueryByCik(cik) {
  const plain = String(Number(cik)), padded = plain.padStart(10, "0");
  return `SELECT ?item ?itemLabel ?article ?logo ?rank WHERE {
  VALUES ?cik { "${plain}" "${padded}" }
  ?item wdt:P5531 ?cik .
  OPTIONAL { ?item p:P154 ?ls . ?ls ps:P154 ?logo ; wikibase:rank ?rank . FILTER(?rank != wikibase:DeprecatedRank) FILTER NOT EXISTS { ?ls pq:P582 [] } }
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 60`;
}
export function wikidataQueryByTicker(ticker) {
  const tickers = [...new Set([ticker, ticker.replace(/-/g, "."), ticker.replace(/[.-]/g, " ")])].map(t => JSON.stringify(t)).join(" ");
  return `SELECT ?item ?itemLabel ?article ?logo ?rank WHERE {
  VALUES ?tic { ${tickers} }
  VALUES ?exch { ${US_EXCHANGES.join(" ")} }
  ?item p:P414 ?s . ?s ps:P414 ?exch ; pq:P249 ?tic . FILTER NOT EXISTS { ?s pq:P582 [] }
  OPTIONAL { ?item p:P154 ?ls . ?ls ps:P154 ?logo ; wikibase:rank ?rank . FILTER(?rank != wikibase:DeprecatedRank) FILTER NOT EXISTS { ?ls pq:P582 [] } }
  OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
} LIMIT 60`;
}
const bindingValue = (b, k) => typeof b?.[k]?.value === "string" ? b[k].value : null;
/* Group SPARQL rows per item; best-rank P154 (preferred over normal) like wdt:P154. */
export function parseWikidataItems(payload) {
  const rows = Array.isArray(payload?.results?.bindings) ? payload.results.bindings : [];
  const items = new Map();
  for (const row of rows) {
    const id = bindingValue(row, "item");
    if (!id) continue;
    const entry = items.get(id) || { id: id.split("/").pop(), label: bindingValue(row, "itemLabel") || "", article: null, logos: [] };
    const article = bindingValue(row, "article");
    if (article && article.startsWith("https://en.wikipedia.org/wiki/")) entry.article = article;
    const logo = bindingValue(row, "logo");
    if (logo) {
      const preferred = /PreferredRank$/.test(bindingValue(row, "rank") || "");
      if (!entry.logos.some(l => l.file === logo)) entry.logos.push({ file: logo, preferred });
    }
    items.set(id, entry);
  }
  return [...items.values()].map(e => {
    const best = e.logos.some(l => l.preferred) ? e.logos.filter(l => l.preferred) : e.logos;
    return { ...e, logos: best.map(l => fileNameFrom(l.file)).filter(Boolean) };
  });
}
function pickItem(items, name, { requireName }) {
  const scored = items.map(item => ({ item, name: namesAgree(name, item.label), article: Boolean(item.article) }))
    .filter(x => !requireName || x.name);
  scored.sort((a, b) => Number(b.name) - Number(a.name) || Number(b.article) - Number(a.article));
  return scored[0]?.item || null;
}

/* Top-level parameters of the first {{Infobox ...}} in wikitext. */
export function infoboxParams(wikitext) {
  const text = String(wikitext || "");
  const start = text.search(/\{\{\s*Infobox/i);
  if (start < 0) return null;
  let depth = 0, j = start;
  for (; j < text.length; j++) {
    if (text.startsWith("{{", j)) { depth++; j++; continue; }
    if (text.startsWith("}}", j)) { depth--; j++; if (depth === 0) break; }
  }
  const body = text.slice(start + 2, Math.max(start + 2, j - 1));
  const parts = [];
  let cur = "", curly = 0, square = 0;
  for (let k = 0; k < body.length; k++) {
    const two = body.slice(k, k + 2);
    if (two === "{{") { curly++; cur += two; k++; continue; }
    if (two === "}}") { curly--; cur += two; k++; continue; }
    if (two === "[[") { square++; cur += two; k++; continue; }
    if (two === "]]") { square--; cur += two; k++; continue; }
    if (body[k] === "|" && curly === 0 && square === 0) { parts.push(cur); cur = ""; continue; }
    cur += body[k];
  }
  parts.push(cur);
  const params = {};
  for (const part of parts.slice(1)) {
    const eq = part.indexOf("=");
    if (eq > 0) params[part.slice(0, eq).trim().toLowerCase()] = part.slice(eq + 1).trim();
  }
  return params;
}
const decodeEntities = s => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'").replace(/&nbsp;/g, " ");
/* File name from a wikitext value, a [[File:...]] link or a Special:FilePath URL. */
export function fileNameFrom(value) {
  if (!value) return null;
  let v = String(value);
  const marker = v.indexOf("Special:FilePath/");
  if (marker >= 0) { v = v.slice(marker + "Special:FilePath/".length); try { v = decodeURIComponent(v); } catch { return null; } }
  v = decodeEntities(v.replace(/<!--[\s\S]*?-->/g, "")).trim();
  const m = /(?:File|Image):\s*([^|\]}\n]+?\.(?:svg|png|jpe?g|gif|webp))/i.exec(v) || /([^|=[\]{}\n]+?\.(?:svg|png|jpe?g|gif|webp))/i.exec(v);
  if (!m) return null;
  let name = m[1].trim().replace(/^(?:File|Image):\s*/i, "").replace(/[ _]+/g, "_").replace(/^_+|_+$/g, "");
  if (!name || name.length > 240 || /[/\\#?<>]/.test(name)) return null;
  return name.charAt(0).toUpperCase() + name.slice(1);
}
export function infoboxLogo(wikitext) {
  const params = infoboxParams(wikitext);
  if (!params) return null;
  for (const key of ["logo", "logo_image"]) {
    const name = fileNameFrom(params[key]);
    if (name) return name;
  }
  const image = fileNameFrom(params.image);
  return image && /logo/i.test(image) ? image : null;
}
/* upload.wikimedia.org paths; enwiki-local (non-free) files live under /wikipedia/en/. */
export function wikimediaFileUrls(fileName, { thumbWidth = 500 } = {}) {
  const name = fileNameFrom(fileName);
  if (!name) return null;
  const hash = createHash("md5").update(name).digest("hex");
  const path = hash[0] + "/" + hash.slice(0, 2) + "/" + encodeURIComponent(name);
  const thumb = repo => "https://upload.wikimedia.org/wikipedia/" + repo + "/thumb/" + path + "/" + thumbWidth + "px-" + encodeURIComponent(name) + (/\.svg$/i.test(name) ? ".png" : "");
  return {
    name,
    commons: "https://upload.wikimedia.org/wikipedia/commons/" + path, commonsThumb: thumb("commons"),
    en: "https://upload.wikimedia.org/wikipedia/en/" + path, enThumb: thumb("en")
  };
}
const COUNTRY = /\b(brasil|brazil|india|japan|china|uk|united.kingdom|canada|mexico|france|germany|deutschland|italia|italy|espana|spain|australia|korea|singapore|philippines|indonesia|malaysia|thailand|vietnam|argentina|chile|colombia|peru|ireland|netherlands|nederland|polska|poland|turkey|turkiye|russia|africa|europe|asia|latam)\b/i;
/* P154 fallback guard: no year ranges (historic marks) and no other entity/country in the name. */
export function acceptableWikidataLogo(fileName, companyName) {
  const plain = String(fileName || "").replace(/_/g, " ");
  if (/\b(1[89]|20)\d{2}\s*[-–—]\s*((1[89]|20)\d{2}|present|today)\b/i.test(plain)) return false;
  if (/\b(former|old|historic|historical|defunct)\b/i.test(plain)) return false;
  const country = COUNTRY.exec(plain);
  if (country && !COUNTRY.test(String(companyName || ""))) return false;
  return true;
}

/* ---------- politeness ---------- */
const HOST_GAP = { "en.wikipedia.org": 1000, "query.wikidata.org": 500, "upload.wikimedia.org": 400, "data.sec.gov": 350, "www.sec.gov": 350 };
const nextSlot = new Map();
async function pace(url) {
  let host = "";
  try { host = new URL(url).hostname; } catch { return; }
  const gap = HOST_GAP[host] ?? 120, now = Date.now(), at = Math.max(now, nextSlot.get(host) || 0);
  nextSlot.set(host, at + gap);
  if (at > now) await sleep(at - now);
}
function cooldown(url, ms) {
  try { const host = new URL(url).hostname; nextSlot.set(host, Math.max(nextSlot.get(host) || 0, Date.now() + ms)); } catch { /* ignore */ }
}

/* companiesmarketcap answers a missing logo with a 302 to an error page that can take minutes to
 * load, which would read as a timeout ("unknown"). A HEAD first turns that into a clean "missing". */
async function probeRedirect(url) {
  await assertPublic(url);
  await pace(url);
  const response = await fetch(url, { method: "HEAD", redirect: "manual", headers: { "User-Agent": contactAgent() }, signal: AbortSignal.timeout(10_000) });
  if (response.status === 404 || response.status === 410) throw Object.assign(new Error("Image responded " + response.status), { upstreamStatus: response.status });
  if (response.status >= 300 && response.status < 400 && /error|404|not-?found/i.test(response.headers.get("location") || "")) {
    throw Object.assign(new Error("Image responded 404"), { upstreamStatus: 404 });
  }
}
const defaultFetchers = {
  async image(url) {
    if (/^https:\/\/companiesmarketcap\.com\//.test(url)) await probeRedirect(url);
    for (let attempt = 0; ; attempt++) {
      await pace(url);
      try {
        // companiesmarketcap is slow under load; a timeout is "unknown", so give it longer.
        return await fetchImage(url, { userAgent: contactAgent(), maxBytes: 2_500_000, timeoutMs: /companiesmarketcap\.com/.test(url) ? 25_000 : 12_000 });
      } catch (error) {
        const s = error?.upstreamStatus;
        // Wikimedia's upload servers rate-limit shared addresses; back off once before giving up.
        if ((s === 429 || s === 503) && attempt < 1) { cooldown(url, /wikimedia\.org/.test(url) ? 8000 : 2500); continue; }
        throw error;
      }
    }
  },
  async text(url, options) { await pace(url); return externalFetch(url, options); },
  async sec(url, options) {
    await pace(url);
    try { return await secFetch(url, options); }
    catch (error) {
      // Long-lived filers (JPM) exceed secFetch's 3 MB JSON cap; the submissions index is still needed.
      if (!/too large/i.test(String(error?.message)) || !/^https:\/\/data\.sec\.gov\/submissions\/CIK\d{10}\.json$/.test(url)) throw error;
      await pace(url);
      const response = await fetch(url, { headers: { "User-Agent": config.userAgent, Accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw Object.assign(new Error("SEC responded " + response.status), { upstreamStatus: response.status });
      const text = await response.text();
      if (text.length > 16_000_000) throw new Error("SEC response too large");
      return JSON.parse(text);
    }
  },
  async website(args) {
    let mod;
    try { mod = await import("./company-domain.mjs"); } catch { return null; }
    if (typeof mod?.websiteLogoCandidates !== "function") return null;
    return mod.websiteLogoCandidates(args);
  }
};

/* ---------- pixels: stricter badge test and dark-monochrome recolour ---------- */
const BG_LUM = luminance(...PAGE_BG);
const OFF_WHITE = [242, 244, 247];
/* A badge is light ink sitting inside the mark's own dark shape (KREF, CIGI, ALK): light pixels that
 * cannot be reached from the transparent surroundings without crossing dark ink. image-analysis's
 * neighbour test also accepts any thick bright stroke (Amazon's orange smile, Meta's blue symbol),
 * which then skips the lift and leaves dark wordmarks invisible, so the resolver uses this one. */
export function strictBadge(px, w, h) {
  const n = w * h, kind = new Uint8Array(n); // 0 transparent, 1 dark ink, 2 mid ink, 3 light ink
  let ink = 0, dark = 0, light = 0;
  for (let i = 0; i < n; i++) {
    if (px[i * 4 + 3] <= 128) continue;
    ink++;
    const c = contrast(luminance(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]), BG_LUM);
    if (c < 2) { kind[i] = 1; dark++; } else if (c >= 4.5) { kind[i] = 3; light++; } else kind[i] = 2;
  }
  if (!ink || light < ink * .04 || dark < ink * .3) return false;
  const reached = new Uint8Array(n), stack = [];
  for (let i = 0; i < n; i++) {
    const x = i % w, y = (i - x) / w;
    if (kind[i] !== 1 && (kind[i] === 0 || x === 0 || y === 0 || x === w - 1 || y === h - 1)) { reached[i] = 1; stack.push(i); }
  }
  while (stack.length) {
    const i = stack.pop(), x = i % w;
    for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
      if (j >= 0 && j < n && !reached[j] && kind[j] !== 1) { reached[j] = 1; stack.push(j); }
    }
  }
  let enclosed = 0, solid = 0;
  for (let i = 0; i < n; i++) {
    if (kind[i] === 3 && !reached[i]) enclosed++;
    if (kind[i] !== 1) continue;
    // The dark part must be a filled shape, not thin strokes around light counters (Sohu's glyphs).
    const x = i % w, y = (i - x) / w;
    let inside = x >= 2 && y >= 2 && x < w - 2 && y < h - 2;
    for (let dy = -2; dy <= 2 && inside; dy++) for (let dx = -2; dx <= 2; dx++) if (kind[i + dy * w + dx] !== 1) { inside = false; break; }
    if (inside) solid++;
  }
  return enclosed >= ink * .04 && enclosed / light >= .2 && solid >= dark * .3;
}
/* Mostly dark ink of one hue (navy Berkshire, black Apple): becomes off-white, alpha kept. */
export function darkMonochrome(px, w, h) {
  let ink = 0, darkInk = 0, lightInk = 0;
  const hues = new Map();
  for (let i = 0; i < w * h; i++) {
    if (px[i * 4 + 3] <= 128) continue;
    ink++;
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
    const c = contrast(luminance(r, g, b), BG_LUM);
    if (c < 2) darkInk++;
    if (c >= 4.5) lightInk++;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max - min > 24) {
      const hue = max === r ? (g - b) / (max - min) : max === g ? 2 + (b - r) / (max - min) : 4 + (r - g) / (max - min);
      const bin = Math.floor(((hue + 6) % 6) * 2); // 12 bins
      hues.set(bin, (hues.get(bin) || 0) + 1);
    }
  }
  if (!ink || darkInk < ink * .9 || lightInk > ink * .02) return false;
  const significant = [...hues.entries()].filter(([, count]) => count > ink * .03).map(([bin]) => bin).sort((a, b) => a - b);
  return significant.length <= 1 || (significant.length === 2 && (significant[1] - significant[0] === 1 || significant[1] - significant[0] === 11));
}
function recolorAll(px) {
  for (let i = 0; i < px.length; i += 4) if (px[i + 3]) { px[i] = OFF_WHITE[0]; px[i + 1] = OFF_WHITE[1]; px[i + 2] = OFF_WHITE[2]; }
}
function alphaBounds(px, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
/* A fully opaque raster whose border is mostly one colour is a tile even when the mark touches an
 * edge (FMP's PIAC: a white square with an oval reaching the sides). Returns that colour. */
export function opaqueTileColor(px, w, h) {
  let transparent = 0;
  for (let i = 0; i < w * h; i++) if (px[i * 4 + 3] < 250) transparent++;
  if (transparent > w * h * .02) return null;
  const ring = [];
  for (let x = 0; x < w; x++) ring.push(x, (h - 1) * w + x);
  for (let y = 1; y < h - 1; y++) ring.push(y * w, y * w + w - 1);
  const bins = new Map();
  for (const i of ring) { const k = (px[i * 4] >> 4) << 8 | (px[i * 4 + 1] >> 4) << 4 | px[i * 4 + 2] >> 4; bins.set(k, (bins.get(k) || 0) + 1); }
  const top = [...bins.entries()].sort((x, y) => y[1] - x[1])[0];
  if (!top) return null;
  const seed = [(top[0] >> 8 & 15) * 16 + 8, (top[0] >> 4 & 15) * 16 + 8, (top[0] & 15) * 16 + 8];
  const near = ring.filter(i => Math.abs(px[i * 4] - seed[0]) + Math.abs(px[i * 4 + 1] - seed[1]) + Math.abs(px[i * 4 + 2] - seed[2]) <= 40);
  if (near.length < ring.length * .6) return null;
  return [0, 1, 2].map(c => Math.round(near.reduce((sum, i) => sum + px[i * 4 + c], 0) / near.length));
}
/* A tile drawn inside transparent padding (an app-icon square with rounded corners, as FMP/EODHD
 * serve): the edges of the ink's own bounding box, corners skipped, are one opaque colour. Only
 * applied to the fallback ticker services, whose tiles are artefacts; a mark that is itself a box
 * (Power REIT, Colliers' outlined badge) from stockanalysis or Wikipedia is left alone. */
export function innerTileColor(px, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] > 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  if (bw < 24 || bh < 24 || bw / bh > 1.6 || bh / bw > 1.6) return null;
  const inset = Math.max(1, Math.round(Math.min(bw, bh) * .03)), skipX = Math.round(bw * .2), skipY = Math.round(bh * .2), ring = [];
  for (let x = x0 + skipX; x <= x1 - skipX; x++) ring.push((y0 + inset) * w + x, (y1 - inset) * w + x);
  for (let y = y0 + skipY; y <= y1 - skipY; y++) ring.push(y * w + x0 + inset, y * w + x1 - inset);
  const opaque = ring.filter(i => px[i * 4 + 3] > 200);
  if (opaque.length < ring.length * .9) return null;
  const mean = [0, 1, 2].map(c => opaque.reduce((sum, i) => sum + px[i * 4 + c], 0) / opaque.length);
  const std = [0, 1, 2].map(c => Math.sqrt(opaque.reduce((sum, i) => sum + (px[i * 4 + c] - mean[c]) ** 2, 0) / opaque.length));
  return (std[0] + std[1] + std[2]) / 3 < 25 ? mean.map(Math.round) : null;
}
/* A tile with rounded corners on an opaque canvas leaves the canvas colour in the four corners once
 * the tile colour is keyed out (EODHD's WeedClub icon). Flood those corner wedges away, only when
 * they are small, so a mark that reaches a corner is never eaten. */
export function clearCorners(px, w, h) {
  for (const start of [0, w - 1, (h - 1) * w, h * w - 1]) {
    if (px[start * 4 + 3] <= 128) continue;
    const color = [px[start * 4], px[start * 4 + 1], px[start * 4 + 2]];
    const seen = new Uint8Array(w * h), stack = [start], region = [];
    seen[start] = 1;
    while (stack.length && region.length <= w * h * .08) {
      const i = stack.pop(), x = i % w;
      region.push(i);
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j < 0 || j >= w * h || seen[j] || px[j * 4 + 3] <= 16) continue;
        seen[j] = 1;
        if (Math.abs(px[j * 4] - color[0]) + Math.abs(px[j * 4 + 1] - color[1]) + Math.abs(px[j * 4 + 2] - color[2]) <= 60) stack.push(j);
      }
    }
    if (region.length > w * h * .08) continue;
    // The wedge and its 2px anti-aliased seam with the keyed tile.
    for (const i of region) {
      const x = i % w, y = (i - x) / w;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h) px[(yy * w + xx) * 4 + 3] = 0;
      }
    }
  }
}
/* Thin slivers of a keyed tile's edge left along the canvas border: small components (< 1% of
 * the canvas) that touch the outer 3px. A real mark reaching the border is far larger. */
export function dropEdgeSlivers(px, w, h) {
  const seen = new Uint8Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || px[start * 4 + 3] <= 16) continue;
    const stack = [start], comp = [];
    seen[start] = 1;
    let touches = false;
    while (stack.length) {
      const i = stack.pop(), x = i % w, y = (i - x) / w;
      comp.push(i);
      if (x < 3 || y < 3 || x >= w - 3 || y >= h - 3) touches = true;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) {
        if (j >= 0 && j < w * h && !seen[j] && px[j * 4 + 3] > 16) { seen[j] = 1; stack.push(j); }
      }
    }
    if (touches && comp.length < w * h * .01) for (const i of comp) px[i * 4 + 3] = 0;
  }
}
/* Opaque ink running along most of its own bounding box's edges: a frame is still there. */
export function framed(px, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] > 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return false;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, ring = [];
  const skipX = Math.round(bw * .2), skipY = Math.round(bh * .2), inset = 0;
  for (let x = x0 + skipX; x <= x1 - skipX; x++) ring.push((y0 + inset) * w + x, (y1 - inset) * w + x);
  for (let y = y0 + skipY; y <= y1 - skipY; y++) ring.push(y * w + x0 + inset, y * w + x1 - inset);
  return ring.length > 0 && ring.filter(i => px[i * 4 + 3] > 48).length >= ring.length * .6;
}
/* After keying out a box, faint unmixed remnants of a textured background (BIXT's photo) are not
 * part of the mark: drop semi-transparent pixels with no solid ink within 2px. */
function dropFaintRemnants(px, w, h) {
  const solid = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if (px[i * 4 + 3] > 128) solid[i] = 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (solid[i] || !px[i * 4 + 3]) continue;
    let near = false;
    for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < w && yy < h && solid[yy * w + xx]) { near = true; break; }
    }
    if (!near) px[i * 4 + 3] = 0;
  }
}
/* Measurement of the raster with the resolver's extensions: the strict badge, opaque tiles, and
 * a box colour measured on the keyed-out mark. */
function analyze(r, { innerTile = false } = {}) {
  const m = measureRaster(r);
  if (!m.boxed) {
    const tile = opaqueTileColor(r.data, r.width, r.height) || (innerTile ? innerTileColor(r.data, r.width, r.height) : null);
    if (tile) {
      const px = new Uint8ClampedArray(r.data);
      debox(px, r.width, r.height, tile);
      const keyed = measureRaster({ data: px, width: r.width, height: r.height });
      Object.assign(m, { boxed: true, boxColor: tile, visible: keyed.visible, aspect: keyed.aspect, shape: keyed.shape, inkFrac: keyed.inkFrac, photoLike: false });
    }
  }
  m.badge = !m.boxed && strictBadge(r.data, r.width, r.height);
  return m;
}
export async function measureMark(bytes, type, options = {}) {
  return analyze(await rasterize(bytes, type, 256), options);
}
/* Section 1.6 preparation (prepareLogo with the strict badge, opaque tiles, remnant cleanup and the
 * monochrome recolour). badge: the decision taken at measurement, so both passes agree. */
export async function prepareMark(bytes, type, { badge, innerTile = false } = {}) {
  const r = await rasterize(bytes, type, 512);
  const m = analyze(r, { innerTile });
  if (m.photoLike) return null;
  const w = r.width, h = r.height, px = new Uint8ClampedArray(r.data);
  let method = "asis";
  if (m.boxed) {
    if (debox(px, w, h, m.boxColor) < .02) return null;
    clearCorners(px, w, h);
    dropFaintRemnants(px, w, h);
    dropEdgeSlivers(px, w, h);
    method = "debox";
  }
  if (!(badge ?? m.badge)) {
    if (darkMonochrome(px, w, h)) { recolorAll(px); method = method === "debox" ? "debox+recolor" : "recolor"; }
    else {
      const lifted = liftDark(px, w, h);
      if (lifted > 0) method = method === "debox" ? "debox+lift" : lifted > .9 ? "recolor" : "lift";
    }
  }
  const box = alphaBounds(px, w, h);
  if (!box || box.w * box.h < 64) return null;
  const pad = Math.round(Math.max(box.w, box.h) * .04);
  const png = await sharp(Buffer.from(px.buffer, px.byteOffset, px.length), { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: box.x, top: box.y, width: box.w, height: box.h })
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 }).toBuffer();
  return { bytes: png, type: "png", width: box.w + pad * 2, height: box.h + pad * 2, aspect: box.w / box.h, method };
}

/* ---------- fetching candidates ---------- */
async function getImage(f, url) {
  try {
    const image = await f.image(url);
    if (!image?.bytes || !image.type) return { status: "missing", url };
    return { status: "found", url: image.url || url, bytes: image.bytes, type: image.type };
  } catch (error) { return { status: classifyFailure(error), url, error: String(error?.message || error).slice(0, 120) }; }
}
/* Internal DTD entities (Illustrator exports such as Exxon's) are expanded before the DOCTYPE is
 * stripped for rendering; external (SYSTEM/PUBLIC) entities are never resolved. */
export function expandSvgEntities(bytes) {
  const text = Buffer.from(bytes).toString("utf8");
  const doctype = /<!DOCTYPE[^[>]*(\[[\s\S]*?\])?\s*>/i.exec(text);
  if (!doctype) return Buffer.from(bytes);
  const entities = new Map();
  for (const m of (doctype[1] || "").matchAll(/<!ENTITY\s+([A-Za-z_][\w.-]*)\s+(["'])([^"'<&]{0,500})\2\s*>/g)) entities.set(m[1], m[3]);
  let body = text.slice(0, doctype.index) + text.slice(doctype.index + doctype[0].length);
  if (entities.size) body = body.replace(/&([A-Za-z_][\w.-]*);/g, (all, key) => entities.has(key) ? entities.get(key) : all);
  return Buffer.from(body, "utf8");
}
async function measured(candidate) {
  if (candidate.status !== "found") return candidate;
  if (candidate.type === "svg") candidate.bytes = expandSvgEntities(candidate.bytes);
  try {
    const m = await measureMark(candidate.bytes, candidate.type, { innerTile: TILE_SERVICES.has(candidate.key) });
    // A JPEG without a flat border is a photo or banner, not a mark.
    if (candidate.type === "jpeg" && !m.boxed) m.photoLike = true;
    candidate.m = m;
  } catch (error) { candidate.status = "missing"; candidate.error = "unreadable: " + String(error?.message || error).slice(0, 80); }
  return candidate;
}
async function sparql(f, query) {
  return f.text(SPARQL, {
    json: true, method: "POST", accept: "application/sparql-results+json", maxBytes: 1_000_000,
    headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ query }).toString()
  });
}
async function wikimediaImage(f, fileName, repos) {
  const urls = wikimediaFileUrls(fileName);
  if (!urls) return { status: "missing" };
  let unknown = null;
  for (const repo of repos) {
    const original = await getImage(f, urls[repo]);
    if (original.status === "found") return { ...original, file: urls.name, repo };
    if (original.status === "unknown" || /too large/i.test(original.error || "")) {
      // Rate-limited originals are usually served from the thumbnail cache.
      const thumb = await getImage(f, urls[repo + "Thumb"]);
      if (thumb.status === "found") return { ...thumb, file: urls.name, repo };
      if (original.status === "unknown") unknown = original;
    }
  }
  return unknown ? { status: "unknown", file: urls.name, error: unknown.error } : { status: "missing", file: urls.name };
}
/* S2: the infobox logo of the English Wikipedia article for the CIK's Wikidata item. */
async function wikipediaCandidate(f, { cik, ticker, name }) {
  let items;
  try { items = parseWikidataItems(await sparql(f, wikidataQueryByCik(cik))); }
  catch (error) { return { status: "unknown", key: "s2", error: String(error?.message || error).slice(0, 120) }; }
  let item = pickItem(items, name, { requireName: false }), via = "cik";
  if (!item && ticker) {
    try { item = pickItem(parseWikidataItems(await sparql(f, wikidataQueryByTicker(ticker))), name, { requireName: true }); via = "ticker"; }
    catch (error) { return { status: "unknown", key: "s2", error: String(error?.message || error).slice(0, 120) }; }
  }
  if (!item) return { status: "missing", key: "s2" };
  const base = { key: "s2", wikidata: item.id, via };
  let file = null, origin = null, unknown = false;
  if (item.article) {
    const title = decodeURIComponent(item.article.slice("https://en.wikipedia.org/wiki/".length));
    if (title && title.length <= 250) {
      let text = null;
      try {
        text = await f.text("https://en.wikipedia.org/w/index.php?title=" + encodeURIComponent(title) + "&action=raw&section=0", { json: false, accept: "text/x-wiki, text/plain", maxBytes: 600_000 });
        const redirect = /^#REDIRECT\s*\[\[([^\]|#]+)/i.exec(String(text || "").trim());
        if (redirect) text = await f.text("https://en.wikipedia.org/w/index.php?title=" + encodeURIComponent(redirect[1].trim()) + "&action=raw&section=0", { json: false, accept: "text/x-wiki, text/plain", maxBytes: 600_000 });
      } catch (error) { if (classifyFailure(error) === "unknown") unknown = true; }
      file = infoboxLogo(text);
      if (file) origin = "infobox";
    }
  }
  if (!file && !unknown && !KNOWN_BAD.wikidata.has(ticker)) {
    file = item.logos.find(l => /\.svg$/i.test(l) && acceptableWikidataLogo(l, name)) || item.logos.find(l => acceptableWikidataLogo(l, name)) || null;
    if (file) origin = "wikidata";
  }
  if (!file) return { ...base, status: unknown ? "unknown" : "missing" };
  const image = await wikimediaImage(f, file, origin === "infobox" ? ["commons", "en"] : ["commons"]);
  return { ...image, ...base, origin, file, source: origin === "infobox" ? "wikipedia" : "wikidata", status: image.status };
}
/* S7: candidates from the company-domain module (written separately); accepted shapes are a URL
 * string or {url, bytes?, type?, kind?}. */
async function websiteCandidates(f, args) {
  let list;
  try { list = await f.website(args); }
  catch (error) { return { status: "unknown", items: [], error: String(error?.message || error).slice(0, 120) }; }
  if (list && !Array.isArray(list)) list = Array.isArray(list.candidates) ? list.candidates : [];
  const items = [];
  for (const entry of (list || []).slice(0, 4)) {
    const spec = typeof entry === "string" ? { url: entry } : entry || {};
    let c;
    if (spec.bytes && spec.type) c = { status: "found", url: spec.url || null, bytes: Buffer.from(spec.bytes), type: spec.type };
    else if (typeof spec.url === "string") c = await getImage(f, spec.url);
    else continue;
    items.push(await measured({ ...c, key: "s7", source: "website", kind: spec.kind || spec.method || null }));
  }
  return { status: list ? "found" : "missing", items };
}

/* ---------- selection ---------- */
const agree = (a, b) => Boolean(a?.m && b?.m) && iou(a.m.shape, b.m.shape) >= AGREE;
// Ink share is measured on a square canvas, so a thin wordmark can sit below 2% and still hold
// plenty of ink; it also counts as usable when it has a few hundred ink pixels.
const enoughInk = m => m.inkFrac >= 0.02 || m.inkFrac * m.width * m.height >= 400;
const usable = c => c?.status === "found" && c.m && !c.m.photoLike && enoughInk(c.m);
const flatOk = c => usable(c) && !c.m.boxed;
const showsWell = (c, min) => c.m.visible >= min || c.m.badge;

export function selectCandidates({ s1l, s1d, s2, s3l, s3d, fmp, eodhd, nvstly, website = [], ticker, risk }) {
  const notes = [];
  const T = normalizeTicker(ticker) || "";
  // Rule 1: stockanalysis dark must have the light file's shape.
  const s1dPass = usable(s1d) && (!usable(s1l) || agree(s1l, s1d));
  if (usable(s1l) && usable(s1d) && !s1dPass) notes.push("stockanalysis dark disagrees with light; dark discarded");
  const s2ok = usable(s2) ? s2 : null;
  // Rule 3: with identity risk, ticker-keyed images need the CIK-keyed Wikipedia mark to agree.
  let s1Trusted = true;
  if (risk.flag && s2ok) {
    s1Trusted = agree(s1l, s2ok) || (s1dPass && agree(s1d, s2ok));
    if (!s1Trusted && (usable(s1l) || usable(s1d))) notes.push("identity risk: stockanalysis disagrees with Wikipedia; Wikipedia shown");
  }
  const anchors = [s2ok, s1Trusted && usable(s1l) ? s1l : null, s1Trusted && s1dPass ? s1d : null].filter(Boolean);
  const confirmed = c => anchors.some(a => a !== c && agree(a, c));
  const tickerOk = (c, bad) => {
    if (!usable(c) || (bad && bad.has(T))) return false;
    return !risk.flag || confirmed(c);
  };
  // Rule 2: companiesmarketcap .D must have the shape of its light file or of stockanalysis.
  const s3dPass = usable(s3d) && !KNOWN_BAD.cmcDark.has(T) && (agree(s3d, s3l) || agree(s3d, s1l) || (s1dPass && agree(s3d, s1d)));
  const s3lOk = tickerOk(s3l), s3dOk = s3dPass && tickerOk(s3d);
  const order = [];
  const add = (c, step, trusted) => { if (c && !order.some(o => o.c === c)) order.push({ c, step, trusted }); };
  const s1lOk = s1Trusted && flatOk(s1l), s1dOk = s1Trusted && s1dPass && flatOk(s1d);
  if (s1lOk && showsWell(s1l, .8)) add(s1l, 1, true);
  if (s1dOk && showsWell(s1d, .5)) add(s1d, 2, true);
  if (s1lOk) add(s1l, 2, true); // recoloured on preparation
  if (flatOk(s2ok)) add(s2ok, 3, true);
  if (s3lOk && flatOk(s3l) && showsWell(s3l, .8)) add(s3l, 4, true);
  if (s3dOk && flatOk(s3d) && showsWell(s3d, .5)) add(s3d, 4, true);
  if (s3lOk && flatOk(s3l)) add(s3l, 4, true);
  // From the tile services a "badge" is nearly always an app-icon tile, so it never counts as visible.
  for (const [c, bad] of [[fmp, KNOWN_BAD.fmp], [eodhd, KNOWN_BAD.eodhd]]) if (tickerOk(c, bad) && flatOk(c) && c.m.visible >= .5) add(c, 5, false);
  for (const c of website) if (flatOk(c)) add(c, 6, true);
  if (tickerOk(nvstly) && flatOk(nvstly) && nvstly.m.visible >= .5) add(nvstly, 7, false);
  // Step 8: boxed images, deboxed, from sources that passed the identity rules.
  const boxedPool = [
    s1Trusted ? s1l : null, s1Trusted && s1dPass ? s1d : null, s2ok, s3lOk ? s3l : null, s3dOk ? s3d : null, ...website,
    tickerOk(fmp, KNOWN_BAD.fmp) ? fmp : null, tickerOk(eodhd, KNOWN_BAD.eodhd) ? eodhd : null, tickerOk(nvstly) ? nvstly : null
  ];
  for (const c of boxedPool) if (usable(c) && c.m.boxed) add(c, 8, false);
  const review = Boolean(risk.flag && !s1Trusted && (usable(s1l) || usable(s1d)));
  return { order, notes, review, confirmed };
}

/* ---------- preparation and storage ---------- */
async function prepareCandidate(c, store) {
  const prepared = await prepareMark(c.bytes, c.type, { badge: c.m.badge, innerTile: TILE_SERVICES.has(c.key) });
  if (!prepared) return null;
  if (prepared.method.startsWith("debox")) {
    // Keying must leave a free-standing mark; a rim left from a rounded tile is still a box.
    const r = await rasterize(prepared.bytes, prepared.type, 256);
    if (framed(r.data, r.width, r.height)) return null;
  }
  const check = await measureMark(prepared.bytes, prepared.type);
  if (check.photoLike || !enoughInk(check) || !(check.visible >= .5 || check.badge || (c.m.badge && prepared.method === "asis"))) return null;
  const saved = await store.putMedia({ bytes: prepared.bytes, type: prepared.type, width: prepared.width, height: prepared.height });
  return {
    url: saved.url, sha: saved.sha, width: prepared.width, height: prepared.height, aspect: Math.round(prepared.aspect * 1000) / 1000,
    source: c.label, sourceUrl: c.url || null, method: prepared.method, visible: Math.round(check.visible * 100) / 100
  };
}
const slotFor = aspect => aspect <= SQUARE_MAX ? "square" : aspect > WIDE_MIN ? "wide" : "medium";

const defaultStore = { getRecord, putRecord, putMedia };

export async function resolveLogo({ ticker, cik, name } = {}, options = {}) {
  const cik10 = normalizeCik(cik);
  if (!cik10) throw Object.assign(new Error("Invalid CIK"), { status: 400 });
  const T = normalizeTicker(ticker);
  const store = { ...defaultStore, ...(options.store || {}) };
  const f = { ...defaultFetchers, ...(options.fetchers || {}) };
  const now = options.now ?? Date.now();
  if (!options.refresh) {
    const cached = await store.getRecord("logo", cik10).catch(() => null);
    if (cached) return cached;
  }
  const checkedAt = new Date(now).toISOString();
  const override = (await store.getRecord("logo-override", cik10).catch(() => null)) || (options.overrides || LOGO_OVERRIDES)[cik10] || null;
  if (override?.none) {
    const result = { status: "none", ticker: T, cik: cik10, variants: {}, risk: null, support: ["override: no logo" + (override.reason ? " (" + override.reason + ")" : "")], sources: {}, review: false, incomplete: false, checkedAt };
    await store.putRecord("logo", cik10, result, NEGATIVE_TTL);
    return result;
  }
  if (typeof override?.url === "string") {
    // An operator-chosen file (media_overrides) replaces every source.
    const c = await measured(Object.assign(await cropped(await getImage(f, override.url), override.crop).catch(() => ({ status: "missing" })), { key: "override", label: "override", source: "override" }));
    const prepared = usable(c) ? await prepareCandidate(c, store).catch(() => null) : null;
    if (prepared) {
      const slot = slotFor(prepared.aspect) === "wide" ? "wide" : "square";
      const result = { status: "ok", ticker: T, cik: cik10, variants: { [slot]: prepared }, risk: null, support: ["override" + (override.reason ? ": " + override.reason : "")], sources: { override: "found" }, review: false, incomplete: false, checkedAt };
      await store.putRecord("logo", cik10, result, LOGO_TTL);
      return result;
    }
  }

  const urls = T ? sourceUrls(T) : null;
  const tagged = (key, label, source) => c => Object.assign(c, { key, label, source });
  const fetchTicker = (key, label, url) => url ? getImage(f, url).then(tagged(key, label, label)).then(measured) : Promise.resolve({ key, label, status: "missing" });
  const submissionsP = f.sec("https://data.sec.gov/submissions/CIK" + cik10 + ".json", { json: true }).catch(() => null);
  const [submissions, s1l, s1d, s3l, s3d] = await Promise.all([
    submissionsP,
    fetchTicker("s1l", "stockanalysis", urls?.s1Light), fetchTicker("s1d", "stockanalysis-dark", urls?.s1Dark),
    fetchTicker("s3l", "companiesmarketcap", urls?.s3Light), fetchTicker("s3d", "companiesmarketcap-dark", urls?.s3Dark)
  ]);
  const risk = identityRisk(submissions, now);
  const companyName = name || (typeof submissions?.name === "string" ? submissions.name : "") || T || "";
  const s2 = await measured(tagged("s2", "wikipedia", "wikipedia")(await wikipediaCandidate(f, { cik: cik10, ticker: T, name: companyName }).catch(e => ({ status: "unknown", error: String(e?.message || e) }))));
  if (s2.origin === "wikidata") s2.label = "wikidata";
  if (s2.status === "missing" && /^unreadable/.test(s2.error || "") && s2.file) {
    // An SVG librsvg cannot render (or one too large to rasterise) still has a PNG thumbnail.
    const thumb = wikimediaFileUrls(s2.file)?.[(s2.repo || "commons") + "Thumb"];
    if (thumb) Object.assign(s2, await measured(Object.assign(await getImage(f, thumb), { key: "s2" })), { key: "s2", label: s2.label, source: s2.source });
  }

  const states = { s1l, s1d, s2, s3l, s3d };
  let selection = selectCandidates({ ...states, ticker: T, risk });
  // Later sources are only fetched when the primary ones gave nothing usable.
  let fmp = null, eodhd = null, nvstly = null, website = { status: "skipped", items: [] };
  if (!selection.order.some(o => o.step <= 4)) {
    [fmp, eodhd] = await Promise.all([
      fetchTicker("fmp", "fmp", urls?.fmp),
      (async () => {
        let last = { key: "eodhd", label: "eodhd", status: "missing" };
        for (const url of urls?.eodhd || []) {
          last = await fetchTicker("eodhd", "eodhd", url);
          if (last.status === "found") break;
        }
        return last;
      })()
    ]);
    website = await websiteCandidates(f, { cik: cik10, name: companyName, ticker: T });
    for (const c of website.items) c.label = "website";
    nvstly = await fetchTicker("nvstly", "nvstly", urls?.nvstly);
    Object.assign(states, { fmp, eodhd, nvstly });
    selection = selectCandidates({ ...states, website: website.items, ticker: T, risk });
  }

  const variants = {};
  const used = [];
  let winnerMethod = null;
  for (const { c, step, trusted } of selection.order) {
    if (variants.square && variants.wide) break;
    const primary = !used.length;
    // The second variant only comes from identity-safe sources, never a deboxed fallback tile.
    if (!primary && (!trusted || step >= 8)) continue;
    // companiesmarketcap wordmarks can show a product brand (UniFi for Ubiquiti) or an old one:
    // as a second variant they need shape agreement with stockanalysis or Wikipedia.
    if (!primary && c.key.startsWith("s3") && !selection.confirmed(c)) continue;
    // The same mark again (light and dark files of one logo) is not a second variant.
    if (!primary && used.some(u => iou(u.m.shape, c.m.shape) >= .75)) continue;
    if (!primary && slotFor(c.m.aspect) !== "medium" && variants[slotFor(c.m.aspect)]) continue;
    let prepared = null;
    try { prepared = await prepareCandidate(c, store); } catch { prepared = null; }
    if (!prepared) continue;
    let slot = slotFor(prepared.aspect);
    if (slot === "medium") slot = variants.square ? "wide" : "square";
    if (variants[slot]) continue;
    variants[slot] = { ...prepared, step };
    if (!used.length) winnerMethod = prepared.method;
    used.push(c);
  }

  const support = [];
  const found = Object.values({ ...states }).filter(usable).concat(website.items.filter(usable));
  for (let i = 0; i < found.length; i++) for (let j = i + 1; j < found.length; j++) {
    const score = iou(found[i].m.shape, found[j].m.shape);
    if (score >= AGREE) support.push({ a: found[i].label, b: found[j].label, iou: Math.round(score * 100) / 100 });
  }
  const sources = {}, errors = {};
  for (const [k, c] of Object.entries(states)) if (c) {
    sources[c.label || k] = c.status;
    if (c.status === "unknown" && c.error) errors[c.label || k] = c.error;
  }
  if (website.status !== "skipped") sources.website = website.items.some(c => c.status === "found") ? "found" : website.status === "unknown" ? "unknown" : "missing";
  const primarySources = [s1l, s1d, s2, s3l, s3d];
  const incomplete = risk.unknown || primarySources.some(c => c?.status === "unknown") || website.status === "unknown" || [fmp, eodhd, nvstly].some(c => c?.status === "unknown") ||
    website.items.some(c => c.status === "unknown");
  const winner = used[0];
  const confirmedWinner = winner ? found.some(c => c !== winner && agree(c, winner)) : false;
  // FMP, EODHD and nvstly key their images by ticker alone. In the audited sample half of the logos
  // that only they supplied belonged to another company or a product brand (Altex Inc. for ALTX,
  // WeedClub for FMHS), so without a second source showing the same mark no logo is shown.
  if (winner && TILE_SERVICES.has(winner.key) && !confirmedWinner) {
    for (const k of Object.keys(variants)) delete variants[k];
    selection.notes.push(winner.label + " logo not confirmed by another source; not shown");
  }
  const review = selection.review || Boolean(winner && !confirmedWinner && (risk.flag || ["fmp", "eodhd", "nvstly", "website"].includes(winner.label) || String(winnerMethod).startsWith("debox")));
  const result = {
    status: Object.keys(variants).length ? "ok" : "none",
    ticker: T, cik: cik10,
    variants: Object.fromEntries(Object.entries(variants).map(([k, v]) => [k, (({ step, ...rest }) => rest)(v)])),
    risk: { flag: risk.flag, unknown: risk.unknown, reasons: risk.reasons.slice(0, 6) },
    support: [...selection.notes, ...support],
    sources, ...(Object.keys(errors).length ? { errors } : {}), review, incomplete, checkedAt
  };
  const ttl = result.status === "ok" ? (incomplete ? PARTIAL_TTL : LOGO_TTL) : incomplete ? 0 : NEGATIVE_TTL;
  if (ttl > 0 && options.cache !== false) await store.putRecord("logo", cik10, result, ttl).catch(() => {});
  return result;
}

/* ---------- ticker entry point ---------- */
const inflight = createCache(500);
export async function logoForTicker(ticker, options = {}) {
  const T = normalizeTicker(ticker);
  if (!T) return null;
  const sec = options.fetchers?.sec || defaultFetchers.sec;
  const record = tickerRecord(await tickerIndex(sec), T);
  if (!record) return null;
  if (options.refresh) return resolveLogo({ ticker: T, cik: record.cik, name: record.name }, options);
  return inflight("cik:" + record.cik, 10 * 60 * 1000, () => resolveLogo({ ticker: T, cik: record.cik, name: record.name }, options));
}
