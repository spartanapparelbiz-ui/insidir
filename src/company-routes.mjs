/* Public, read-only company report endpoints. They need no database, so the same
 * handler serves both the full engine (`npm start`) and the website preview (`npm run web`). */
import { secReady } from "./config.mjs";
import { getCompanyIntelligence, resolveCompany, tickerIndex, tickerRecord, extractFilings } from "./intelligence.mjs";
import { getMarketChart, MARKET_RANGES } from "./market.mjs";
import { getCompanyProfile } from "./company-profile.mjs";
import { getCompanyInsiders } from "./insiders.mjs";
import { getHeadlines, announcementsFromFilings, focusHeadlines, relevanceTerms } from "./news.mjs";
import { searchCompanies } from "./search.mjs";

const failure = (status, message) => Object.assign(new Error(message), { status });
const hits = new Map();
function limited(key, limit, windowMs = 60_000) {
  const now = Date.now();
  if (hits.size > 10000) for (const [k, v] of hits) if (v.until < now) hits.delete(k);
  const entry = hits.get(key);
  if (!entry || entry.until <= now) { hits.set(key, { count: 1, until: now + windowMs }); return false; }
  entry.count++;
  return entry.count > limit;
}
/* Behind the hosting proxy every request arrives from the proxy's socket address. The proxy
 * appends the real client to X-Forwarded-For, so the last entry is the one a client cannot forge. */
export function clientAddress(req) {
  const forwarded = String(req.headers?.["x-forwarded-for"] || "").split(",").map(x => x.trim()).filter(Boolean).at(-1);
  return forwarded && forwarded.length <= 64 ? forwarded : req.socket?.remoteAddress || "unknown";
}
function send(res, status, body, maxAge = 0) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": maxAge ? "public, max-age=" + maxAge : "no-store",
    "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
  });
  res.end(JSON.stringify(body));
}
export function parseTicker(value) {
  // SEC and market data list share classes with a hyphen (BRK-B), so BRK.B is accepted as an alias.
  const t = String(value || "").trim().toUpperCase().replace(/\./g, "-");
  if (!/^[A-Z0-9][A-Z0-9-]{0,14}$/.test(t)) throw failure(400, "Invalid ticker");
  return t;
}
function requireSec() {
  if (!secReady()) throw failure(503, "SEC_USER_AGENT not configured for official SEC research");
}
const upstream = (label, error) => {
  if (error?.status && error.status < 500) throw error;
  console.warn(label + " lookup failed:", error?.message);
  throw failure(503, label + " is temporarily unavailable. Try again shortly.");
};
const notListed = () => failure(404, "Ticker not found in the SEC's official company mapping. This does not establish that a company does not exist.");

const ROUTES = new Set(["/v1/search", "/v1/intelligence", "/v1/market/chart", "/v1/company/profile", "/v1/company/insiders", "/v1/company/news"]);
export function isCompanyRoute(pathname) { return ROUTES.has(pathname); }

/* Returns false when the path is not a company route; otherwise responds or throws {status}. */
export async function handleCompanyRoute(req, res, url, { loadTransactions = async () => [] } = {}) {
  const p = url.pathname;
  if (!ROUTES.has(p)) return false;
  if (req.method !== "GET" && req.method !== "HEAD") throw failure(405, "Method not allowed");
  const ip = clientAddress(req);

  if (p === "/v1/search") {
    const q = String(url.searchParams.get("q") || "").trim().slice(0, 60);
    if (limited("search:" + ip, 120)) throw failure(429, "Too many searches. Try again shortly.");
    if (!q) return send(res, 200, { items: [] }), true;
    requireSec();
    let items;
    try { items = await searchCompanies(q, { limit: 8 }); } catch (e) { upstream("Company search", e); }
    return send(res, 200, { items, source: "SEC official ticker mapping" }, 300), true;
  }

  const t = parseTicker(url.searchParams.get("ticker"));

  if (p === "/v1/intelligence") {
    if (limited("intelligence:" + ip, 20)) throw failure(429, "Too many intelligence requests. Try again shortly.");
    requireSec();
    const transactions = await loadTransactions(t);
    let intel;
    try { intel = await getCompanyIntelligence(t, transactions); } catch (e) { upstream("SEC data", e); }
    if (!intel) throw notListed();
    return send(res, 200, { ...intel, disclaimer: "Descriptive public-record intelligence only; not personalized investment advice or an executable trading signal." }), true;
  }

  if (p === "/v1/market/chart") {
    const range = String(url.searchParams.get("range") || "1Y").toUpperCase();
    if (!MARKET_RANGES[range]) throw failure(400, "Range must be one of " + Object.keys(MARKET_RANGES).join(", "));
    if (limited("market:" + ip, 90)) throw failure(429, "Too many chart requests. Try again shortly.");
    let chart;
    try { chart = await getMarketChart(t, range); } catch (e) { upstream("Market data", e); }
    return send(res, 200, { ...chart, disclaimer: "Delayed market data for research. Not a trading quote." }, range === "1D" ? 30 : 120), true;
  }

  if (p === "/v1/company/profile") {
    if (limited("profile:" + ip, 40)) throw failure(429, "Too many profile requests. Try again shortly.");
    requireSec();
    let record;
    try { record = tickerRecord(await tickerIndex(), t); } catch (e) { upstream("SEC ticker mapping", e); }
    if (!record) throw notListed();
    let profile;
    try { profile = await getCompanyProfile(record.cik); } catch (e) { upstream("Company profile", e); }
    return send(res, 200, { ticker: t, cik: record.cik, ...profile }, 3600), true;
  }

  if (p === "/v1/company/insiders") {
    if (limited("insiders:" + ip, 20)) throw failure(429, "Too many insider requests. Try again shortly.");
    requireSec();
    let insiders;
    try { insiders = await getCompanyInsiders(t); } catch (e) { upstream("SEC ownership filings", e); }
    if (!insiders) throw notListed();
    return send(res, 200, { ...insiders, disclaimer: "Reported Form 4 transactions. Grants, exercises, tax withholding and gifts are not open-market trades." }, 300), true;
  }

  if (p === "/v1/company/news") {
    if (limited("news:" + ip, 40)) throw failure(429, "Too many news requests. Try again shortly.");
    requireSec();
    let resolved;
    try { resolved = await resolveCompany(t); } catch (e) { upstream("SEC filings", e); }
    if (!resolved) throw notListed();
    const announcements = announcementsFromFilings(extractFilings(resolved.submissions, resolved.company.cik, 80));
    const feed = await getHeadlines(t).catch(e => { console.warn("Headline feed failed:", e?.message); return null; });
    const headlines = feed && focusHeadlines(feed, relevanceTerms(t, resolved.company.name));
    return send(res, 200, {
      ticker: t, company: resolved.company, announcements, headlines: headlines || [],
      headlinesAvailable: Boolean(headlines),
      sources: [{ name: "SEC EDGAR current reports", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=" + resolved.company.cik + "&type=8-K" },
        { name: "Yahoo Finance headlines", url: "https://finance.yahoo.com/quote/" + encodeURIComponent(t) + "/news" }]
    }, 300), true;
  }
  return false;
}
