/* Public, read-only company report endpoints. They need no database, so the same
 * handler serves both the full engine (`npm start`) and the website preview (`npm run web`). */
import { secReady } from "./config.mjs";
import { getCompanyIntelligence, resolveCompany, tickerIndex, tickerRecord, extractFilings } from "./intelligence.mjs";
import { getMarketChart, MARKET_RANGES } from "./market.mjs";
import { getCompanyProfile } from "./company-profile.mjs";
import { getCompanyInsiders } from "./insiders.mjs";
import { getHeadlines, announcementsFromFilings, focusHeadlines, relevanceTerms } from "./news.mjs";
import { searchCompanies, browseCompanies } from "./search.mjs";
import { getMedia, hasMedia } from "./media-store.mjs";
import { sendImage } from "./media.mjs";
import { parseMediaQuery, mediaBatch, mediaPending } from "./media-batch.mjs";

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
// Whether `key` has used up its limit in the current window, without counting this request.
const spent = (key, limit) => { const entry = hits.get(key); return Boolean(entry && entry.until > Date.now() && entry.count >= limit); };

/* New upstream work each requester (a member, else an address) may start per 10 minutes: logo
 * resolutions and company photo jobs from GET /v1/media, and company report photo jobs
 * (/v1/company/photos). Joining work that is already running is always free. Past the allowance
 * a key stays pending until the window turns, so one member cannot fill the shared queues. */
export const START_ALLOWANCE = Object.freeze({ logos: 60, photos: 10, pages: 20 });
const START_WINDOW_MS = 10 * 60_000;
const allowances = new Map();
function allowanceFor(requester) {
  const now = Date.now();
  if (allowances.size > 10000) for (const [k, v] of allowances) if (v.until <= now) allowances.delete(k);
  let entry = allowances.get(requester);
  if (!entry || entry.until <= now) allowances.set(requester, entry = { ...START_ALLOWANCE, until: now + START_WINDOW_MS });
  return entry;
}
// Reserved before the work and the unused part given back after, so parallel requests from one
// requester cannot spend the same allowance twice.
const reserve = (entry, kind, most) => { const n = Math.max(0, Math.min(most, entry[kind])); entry[kind] -= n; return n; };
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

const ROUTES = new Set(["/v1/search", "/v1/company/directory", "/v1/intelligence", "/v1/market/chart", "/v1/company/profile", "/v1/company/insiders", "/v1/company/news", "/v1/company/logo", "/v1/company/photos", "/v1/media"]);
const MEDIA_PATH = /^\/v1\/media\/([a-f0-9]{64})\.(png|webp|jpeg|svg)$/;
export function isCompanyRoute(pathname) { return ROUTES.has(pathname) || MEDIA_PATH.test(pathname); }
const optional = async path => { try { return await import(path); } catch { return null; } };

/* Returns false when the path is not a company route; otherwise responds or throws {status}.
 * loadOwners(pairs [{cik, ticker}]) -> [{owner_cik, ticker, owner_name}] and
 * loadIssuers(ciks) -> [{issuer_cik}] confirm reporting owners and issuers from the engine's SEC
 * import for GET /v1/media; null (the website preview, no database) means nothing is confirmed.
 * requester: who is asking (the engine passes "user:<id>"); otherwise the client address.
 * mediaDeps / photoDeps replace the media batch's resolvers and companyPhotos in tests. */
export async function handleCompanyRoute(req, res, url, { loadTransactions = async () => [], loadOwners = null, loadIssuers = null, requester = null, mediaDeps = null, photoDeps = null } = {}) {
  const p = url.pathname;
  if (!isCompanyRoute(p)) return false;
  if (req.method !== "GET" && req.method !== "HEAD") throw failure(405, "Method not allowed");
  const ip = clientAddress(req);
  const who = String(requester || "ip:" + ip).slice(0, 120);

  // Prepared logos and photos: content-addressed, served from this origin without a session. A
  // takedown stops serving an address, so caches keep a copy for a day, not for ever, and check
  // back cheaply (ETag). Unknown addresses are limited per client: each one costs a lookup.
  const media = MEDIA_PATH.exec(p);
  if (media) {
    const sha = media[1], etag = '"' + sha + '"';
    // A client past its 404 allowance is still served what this instance holds in memory; only
    // further lookups are refused.
    const throttled = spent("media-miss:" + ip, 120), lookup = { cachedOnly: throttled };
    const tooMany = () => failure(429, "Too many requests for missing images. Try again shortly.");
    const cache = { "Cache-Control": "public, max-age=86400", ETag: etag };
    const asked = String(req.headers?.["if-none-match"] || "").split(",").map(x => x.trim().replace(/^W\//, ""));
    if (asked.includes(etag)) {
      const known = await hasMedia(sha, lookup);
      if (known) { res.writeHead(304, { ...cache, "X-Content-Type-Options": "nosniff" }); return res.end(), true; }
    }
    const item = await getMedia(sha, lookup);
    if (item === undefined) throw tooMany();
    if (!item) { if (limited("media-miss:" + ip, 120)) throw tooMany(); throw failure(404, "Media not found"); }
    const type = { "image/png": "png", "image/webp": "webp", "image/jpeg": "jpeg", "image/svg+xml": "svg" }[item.mime];
    return sendImage(res, { bytes: item.bytes, type }, 86400, cache), true;
  }

  // Logos and headshots for a whole page in one request; see src/media-batch.mjs.
  if (p === "/v1/media") {
    if (limited("media:" + ip, 120)) throw failure(429, "Too many media requests. Try again shortly.");
    const query = parseMediaQuery(url);
    requireSec();
    const allowance = allowanceFor(who);
    const grant = { logos: reserve(allowance, "logos", 20), photos: reserve(allowance, "photos", 10) };
    const usage = { logos: 0, photos: 0 };
    let body;
    try {
      body = await mediaBatch(query, { loadOwners, loadIssuers, ...(mediaDeps || {}) }, { requester: who, maxStarts: grant.logos, maxPhotoStarts: grant.photos, usage });
    } catch (e) { upstream("Company media", e); }
    finally {
      allowance.logos += Math.max(0, grant.logos - usage.logos);
      allowance.photos += Math.max(0, grant.photos - usage.photos);
    }
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      // Pending keys are asked for again shortly, so only a settled answer may be reused.
      "Cache-Control": mediaPending(body) ? "no-store" : "private, max-age=300",
      "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
    });
    return res.end(JSON.stringify(body)), true;
  }

  if (p === "/v1/company/directory") {
    if (limited("directory:" + ip, 120)) throw failure(429, "Too many directory requests. Try again shortly.");
    requireSec();
    const askedOffset = Number(url.searchParams.get("offset") || 0);
    const askedLimit = Number(url.searchParams.get("limit") || 50);
    const offset = Number.isSafeInteger(askedOffset) ? Math.max(0, Math.min(100_000, askedOffset)) : 0;
    const limit = Number.isSafeInteger(askedLimit) && askedLimit > 0 ? Math.min(100, askedLimit) : 50;
    let page;
    try { page = await browseCompanies({offset,limit}); } catch(e) { upstream("Company directory",e); }
    return send(res, 200, page, 300), true;
  }
  if (p === "/v1/search") {
    const q = String(url.searchParams.get("q") || "").trim().slice(0, 60);
    if (limited("search:" + ip, 120)) throw failure(429, "Too many searches. Try again shortly.");
    if (!q) return send(res, 200, { items: [] }), true;
    requireSec();
    const requested = Number(url.searchParams.get("limit"));
    const limit = Number.isInteger(requested) && requested > 0 ? Math.min(50, requested) : 8;
    const askedOffset = Number(url.searchParams.get("offset") || 0);
    const offset = Number.isSafeInteger(askedOffset) ? Math.max(0, Math.min(100_000,askedOffset)) : 0;
    let matches;
    try { matches = await searchCompanies(q, { limit: limit + 1, offset }); } catch (e) { upstream("Company search", e); }
    const items = matches.slice(0,limit);
    return send(res, 200, { items, offset, limit, hasMore: matches.length > limit, source: "SEC official ticker mapping" }, 300), true;
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

  if (p === "/v1/company/logo") {
    if (limited("logo:" + ip, 240)) throw failure(429, "Too many logo requests. Try again shortly.");
    requireSec();
    const resolver = await optional("./logo-resolver.mjs");
    if (!resolver?.logoForTicker) throw failure(503, "Logo service is not available");
    let logo;
    try { logo = await resolver.logoForTicker(t); } catch (e) { upstream("Company logo", e); }
    const want = url.searchParams.get("variant") === "wide" ? ["wide", "square"] : ["square", "wide"];
    const chosen = logo?.status === "ok" ? want.map(v => logo.variants?.[v]).find(Boolean) : null;
    if (!chosen?.url) throw failure(404, "No published logo found for this company");
    res.writeHead(302, { Location: chosen.url, "Cache-Control": "public, max-age=3600", "X-Logo-Source": String(chosen.source || "").slice(0, 60), "X-Content-Type-Options": "nosniff" });
    return res.end(), true;
  }

  if (p === "/v1/company/photos") {
    if (limited("photos:" + ip, 60)) throw failure(429, "Too many photo requests. Try again shortly.");
    requireSec();
    const photosApi = await import("./people-photos.mjs");
    const companyPhotos = photoDeps?.companyPhotos || photosApi.companyPhotos;
    const wait = Math.max(0, Math.min(8000, Number(url.searchParams.get("wait")) || 0));
    // The report someone has open goes before photo jobs started by page batches.
    const allowance = allowanceFor(who), grant = reserve(allowance, "pages", 1), usage = { photos: 0 };
    let state;
    try { state = await photosApi.withoutTakedowns(await companyPhotos(t, { wait, priority: "page", requester: who, create: grant > 0, usage })); }
    catch (e) { upstream("People photos", e); }
    finally { allowance.pages += Math.max(0, grant - usage.photos); }
    if (!state) throw notListed();
    return send(res, 200, { ticker: t, complete: Boolean(state.complete), ...(state.queued ? { queued: true } : {}), photos: state.photos || {}, names: state.names || {}, leaders: state.leaders || [], sources: state.sources || {},
      coverage: state.coverage || null, updatedAt: state.updatedAt || null,
      note: "Photos come from Wikimedia Commons, the company's own website or its SEC proxy statement and are matched to SEC reporting owners by name and company. People without a verified photo show initials." }, state.complete ? 3600 : 0), true;
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
