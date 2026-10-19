import { XMLParser } from "fast-xml-parser";
import { config, secReady } from "./config.mjs";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", parseTagValue: false, parseAttributeValue: false, trimValues: true, processEntities: true });
const list = value => value == null ? [] : Array.isArray(value) ? value : [value];
const scalar = v => v == null ? null : typeof v === "object" ? scalar(v["#text"] ?? v.value) : String(v).trim() || null;
const val = v => scalar(v?.value ?? v);
const amount = v => {
  const s = val(v);
  if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && Math.abs(n) < 1e15 ? n : null;
};
const flag = v => /^(1|true)$/i.test(val(v) || "");
const isDate = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
/* An XML Schema date may carry a time zone ("2026-10-14-05:00", "2026-10-14Z"); the calendar date is the part before
 * it. Filers do send these: without this the trade date of such a line was stored as unknown. */
export const xmlDate = v => { const m = /^(\d{4}-\d{2}-\d{2})(?:Z|[+-]\d{2}:\d{2})?$/.exec(String(v ?? "").trim()); return m && isDate(m[1]) ? m[1] : null; };

export function parseAtom(xml) {
  const feed = parser.parse(xml)?.feed;
  if (!feed) throw new Error("Invalid SEC Atom feed");
  const seen = new Set();
  return list(feed.entry).flatMap(entry => {
    const links = list(entry.link);
    const href = links.find(x => String(x?.["@_href"] || "").includes("/Archives/edgar/data/"))?.["@_href"];
    if (!href) return [];
    let url;
    try { url = new URL(href, "https://www.sec.gov"); } catch { return []; }
    if (url.protocol !== "https:" || url.hostname !== "www.sec.gov") return [];
    const match = url.pathname.match(/^\/Archives\/edgar\/data\/(\d+)\/(\d{18})\//);
    if (!match) return [];
    const [, filerCik, accession] = match;
    if (seen.has(accession)) return [];
    seen.add(accession);
    return [{
      accession, filerCik, title: scalar(entry.title) || "Form 4",
      publishedAt: scalar(entry.updated) || scalar(entry.published),
      sourceUrl: url.toString(), indexBase: "https://www.sec.gov/Archives/edgar/data/" + filerCik + "/" + accession + "/",
      formType: (scalar(entry["filing-type"]) || "4")
    }];
  });
}

export function parseOwnership(xml, filing) {
  const root = parser.parse(xml)?.ownershipDocument;
  if (!root || !root.issuer) throw new Error("Not a valid ownershipDocument");
  const issuer = root.issuer;
  const issuerCik = scalar(issuer.issuerCik);
  if (!/^\d{1,10}$/.test(issuerCik || "")) throw new Error("Missing issuer CIK");
  const owners = list(root.reportingOwner).map(o => ({
    cik: scalar(o?.reportingOwnerId?.rptOwnerCik),
    name: scalar(o?.reportingOwnerId?.rptOwnerName) || "Unspecified reporting owner",
    isDirector: flag(o?.reportingOwnerRelationship?.isDirector),
    isOfficer: flag(o?.reportingOwnerRelationship?.isOfficer),
    isTenPercentOwner: flag(o?.reportingOwnerRelationship?.isTenPercentOwner),
    officerTitle: scalar(o?.reportingOwnerRelationship?.officerTitle),
    otherText: scalar(o?.reportingOwnerRelationship?.otherText)
  }));
  const ticker = scalar(issuer.issuerTradingSymbol)?.toUpperCase() || null;
  const transactions = [];
  for (const [derivative, key, table] of [[false,"nonDerivativeTransaction",root.nonDerivativeTable],[true,"derivativeTransaction",root.derivativeTable]]) {
    const trs = list(table?.[key]);
    for (let i = 0; i < trs.length; i++) {
      const t = trs[i], code = val(t?.transactionCoding?.transactionCode)?.toUpperCase() || null;
      const acq = val(t?.transactionAmounts?.transactionAcquiredDisposedCode)?.toUpperCase() || null;
      const shares = amount(t?.transactionAmounts?.transactionShares);
      const price = amount(t?.transactionAmounts?.transactionPricePerShare);
      const transactionDate = xmlDate(val(t?.transactionDate));
      const owner = owners.length === 1 ? owners[0] : null;
      const category = !derivative && code === "P" && acq === "A" ? "reported_purchase"
        : !derivative && code === "S" && acq === "D" ? "reported_sale"
        : "other";
      transactions.push({
        id: filing.accession + ":" + (derivative ? "D" : "N") + ":" + i,
        accession: filing.accession, issuerCik, ticker,
        ownerCik: owner?.cik || null,
        ownerName: owner?.name || (owners.map(x => x.name).join(", ") || "Unknown"),
        transactionDate,
        securityTitle: val(t?.securityTitle) || null,
        code, acquiredDisposed: acq, category, derivative,
        shares, pricePerShare: price,
        estimatedValue: shares != null && price != null && shares >= 0 && price >= 0 ? Math.round(shares * price * 100) / 100 : null,
        directOwnership: val(t?.ownershipNature?.directOrIndirectOwnership) || null,
        sharesAfter: amount(t?.postTransactionAmounts?.sharesOwnedFollowingTransaction),
        sourceUrl: filing.sourceUrl
      });
    }
  }
  return {
    accession: filing.accession,
    filerCik: filing.filerCik,
    issuerCik, issuerName: scalar(issuer.issuerName) || "Unknown issuer", ticker,
    title: filing.title, formType: val(root.documentType) || filing.formType,
    sourceUrl: filing.sourceUrl, publishedAt: filing.publishedAt,
    periodOfReport: xmlDate(val(root.periodOfReport)),
    isAmendment: /\/A/i.test(val(root.documentType) || filing.formType || ""),
    owners, transactions
  };
}

/* Source health for operators (GET /v1/admin/ops): counts and the latest outcome of this process's SEC requests. */
const stats = { requests: 0, ok: 0, errors: 0, throttled: 0, blocked: 0, lastOkAt: null, lastError: null };
export const secHealth = () => ({ ...stats, lastError: stats.lastError && { ...stats.lastError }, backlogMs: secBacklogMs() });
function recordSec(status, message) {
  stats.requests++;
  if (status >= 200 && status < 300) { stats.ok++; stats.lastOkAt = new Date().toISOString(); return; }
  stats.errors++;
  if (status === 429) stats.throttled++;
  if (status === 403) stats.blocked++;
  stats.lastError = { at: new Date().toISOString(), status: status || null, message: String(message || "").slice(0, 160) };
}
let nextRequest = 0;
async function throttle() {
  const wait = Math.max(0, nextRequest - Date.now());
  // SEC fair access allows up to 10 requests per second; stay comfortably below it.
  nextRequest = Math.max(nextRequest, Date.now()) + 125;
  if (wait) await new Promise(r => setTimeout(r, wait));
}
/* How long a request asked for now would wait for its turn in the shared SEC throttle (ms; 0 when
 * the queue is empty). Read-only: callers with optional SEC work (person profiles) skip it while
 * the queue is long, so the ingest and the pages someone is reading are not slowed down. */
export const secBacklogMs = () => Math.max(0, nextRequest - Date.now());
export function allowedSecUrl(input) {
  try {
    const u = new URL(input);
    if (u.protocol !== "https:" || u.username || u.password || u.port) return false;
    if (u.hostname === "data.sec.gov") {
      return !u.search && !u.hash &&
        (/^\/submissions\/CIK\d{10}\.json$/.test(u.pathname) ||
         /^\/api\/xbrl\/companyfacts\/CIK\d{10}\.json$/.test(u.pathname));
    }
    return u.hostname === "www.sec.gov" &&
      ((/^\/Archives\/edgar\/data\/\d+\/\d{18}\//.test(u.pathname) ||
        u.pathname === "/cgi-bin/browse-edgar" || u.pathname === "/cgi-bin/own-disp") ||
        (!u.search && !u.hash && u.pathname === "/files/company_tickers.json"));
  } catch { return false; }
}
export async function secFetch(url, { json = false } = {}) {
  if (!secReady()) throw new Error("SEC_USER_AGENT must identify the operator and a monitored email");
  if (!allowedSecUrl(url)) throw new Error("Disallowed SEC URL");
  for (let attempt = 0; attempt < 3; attempt++) {
    await throttle();
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), config.timeoutMs);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": config.userAgent, "Accept": json ? "application/json" : "application/xml,application/atom+xml,text/xml,*/*;q=0.8", "Accept-Encoding": "gzip, deflate" },
        signal: abort.signal, redirect: "error"
      });
      recordSec(response.status, response.ok ? "" : "SEC responded " + response.status);
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        const retrySeconds = Number(response.headers.get("retry-after"));
        await new Promise(r => setTimeout(r, Number.isFinite(retrySeconds) && retrySeconds > 0 ? Math.min(30000, retrySeconds * 1000) : (attempt + 1) * 1500));
        continue;
      }
      if (!response.ok) throw new Error("SEC responded " + response.status);
      // Company facts and the submissions of very active filers (JPM, GS) run past 3MB.
      const maxLength = json && /^https:\/\/data\.sec\.gov\/(api\/xbrl\/companyfacts|submissions)\//.test(url) ? 12_000_000 : json ? 3_000_000 : 5_000_000;
      const size = Number(response.headers.get("content-length") || 0);
      if (size > maxLength) throw new Error("SEC response too large");
      const body = await response.text();
      if (body.length > maxLength) throw new Error("SEC response too large");
      return json ? JSON.parse(body) : body;
    } catch (e) {
      if (!/^SEC responded/.test(String(e?.message))) recordSec(0, e?.name === "AbortError" ? "timeout" : e?.message);
      throw e;
    } finally { clearTimeout(timeout); }
  }
  throw new Error("SEC request attempts exhausted");
}
/* Binary download from SEC Archives (e.g. headshot images inside a proxy statement), through
 * the same User-Agent, allowlist and throttle as every other SEC request. */
export async function secFetchBytes(url, { maxBytes = 3_000_000 } = {}) {
  if (!secReady()) throw new Error("SEC_USER_AGENT must identify the operator and a monitored email");
  if (!allowedSecUrl(url) || !/^https:\/\/www\.sec\.gov\/Archives\//.test(url)) throw new Error("Disallowed SEC URL");
  for (let attempt = 0; attempt < 3; attempt++) {
    await throttle();
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), config.timeoutMs);
    try {
      const response = await fetch(url, { headers: { "User-Agent": config.userAgent, "Accept": "image/*,*/*;q=0.5" }, signal: abort.signal, redirect: "error" });
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        const retrySeconds = Number(response.headers.get("retry-after"));
        await new Promise(r => setTimeout(r, Number.isFinite(retrySeconds) && retrySeconds > 0 ? Math.min(30000, retrySeconds * 1000) : (attempt + 1) * 1500));
        continue;
      }
      if (!response.ok) throw new Error("SEC responded " + response.status);
      const size = Number(response.headers.get("content-length") || 0);
      if (size > maxBytes) throw new Error("SEC file too large");
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > maxBytes) throw new Error("SEC file too large");
      return bytes;
    } finally { clearTimeout(timeout); }
  }
  throw new Error("SEC request attempts exhausted");
}
export async function recentForm4Filings({ start = 0 } = {}) {
  const from = Math.max(0, Math.floor(Number(start) || 0));
  const xml = await secFetch("https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&output=atom&count=100" + (from ? "&start=" + from : ""));
  return parseAtom(xml);
}
/* EDGAR's current-filings feed lists each Form 4 under the issuer and again under each reporting owner, so a page of
 * 100 entries is only about 50 filings, and a busy hour files more than that. Pages back, newest first, until a page
 * holds nothing that isKnown(accession) has not already stored (or maxPages), so no filing between runs is skipped. */
export async function recentForm4Backlog({ isKnown, maxPages = 8, fetchPage = recentForm4Filings } = {}) {
  const out = [], seen = new Set();
  for (let page = 0; page < maxPages; page++) {
    const batch = await fetchPage({ start: page * 100 });
    if (!batch.length) break;
    let unknown = 0;
    for (const f of batch) {
      if (seen.has(f.accession)) continue;
      seen.add(f.accession); out.push(f);
      if (!await isKnown(f.accession)) unknown++;
    }
    if (!unknown) break;
  }
  return out;
}
export async function loadOwnership(filing) {
  const path = filing.indexBase + "index.json";
  const idx = await secFetch(path, { json: true });
  const items = list(idx?.directory?.item);
  const candidates = items.filter(x => {
    const name = x?.name;
    return typeof name === "string" && /^[a-zA-Z0-9_.-]+\.xml$/i.test(name) &&
      !/^(FilingSummary|Financial_Report|MetaLinks|xsl)/i.test(name);
  }).sort((a,b) => {
    const score = x => /^(primary_doc|ownership|form4|wk-form4|doc4)/i.test(x.name) ? 0 : 1;
    return score(a)-score(b);
  }).slice(0, 6);
  for (const item of candidates) {
    const candidate = filing.indexBase + item.name;
    try {
      const xml = await secFetch(candidate);
      if (!xml.includes("ownershipDocument")) continue;
      return { ...parseOwnership(xml, filing), xmlUrl: candidate };
    } catch (e) {
      if (e.message?.includes("Missing issuer CIK")) continue;
      if (e.message?.includes("valid ownershipDocument")) continue;
      throw e;
    }
  }
  throw new Error("No parsable ownership XML in this SEC accession");
}
