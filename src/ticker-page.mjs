/* Public stock pages at insidir.com/<TICKER>: no login, server-rendered, indexable, small enough for a phone on 4G.
 *
 *   GET /NVDA                     the last 3 insider buys and sells in plain English, each linked to its SEC filing;
 *                                 the full 12 months, the track record and alerts are behind "Unlock for $1"
 *   GET /nvda                     301 to /NVDA
 *   GET /insider-trading/NVDA     301 to /NVDA (the older public page; /insider-trading itself stays the hub)
 *   GET /search?t=NVDA            302 to /NVDA (the search box works without JavaScript)
 *   GET /og/NVDA.png              the page's 1200×630 share image: its latest trade, drawn with sharp
 *
 * A path is a stock page only when it is not one of the site's own pages and the symbol is in the import or the SEC
 * ticker list; anything else falls through to the static site (and its 404). Rendered pages are cached in memory
 * for CACHE_MS. Only public SEC records are shown; the paid parts are drawn as blurred shapes, never as hidden data. */
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { esc, money, day, sentence, withRole, LINE_SQL, scripts, companyName, kindOf, personName } from "./site-v2.mjs";
import { uiHead, uiNav, uiFooter, uiSearch, uiLogo, uiInitials, uiTrade } from "./site-ui.mjs";
import { siteOrigin } from "./public-pages.mjs";
import { storiesForTicker, storyPath } from "./stories.mjs";

export const CACHE_MS = 5 * 60_000, FREE_TRADES = 3;
const WEB = fileURLToPath(new URL("../web/", import.meta.url));
const FONTS = fileURLToPath(new URL("./fonts/", import.meta.url));
let pages = null;
const sitePages = () => pages || (pages = new Set(readdirSync(WEB).filter(f => f.endsWith(".html")).map(f => f.slice(0, -5).toLowerCase())));
const RESERVED = new Set(["start", "design", "search", "og", "admin", "welcome", "buys", "insiders", "insider-trading", "assets", "v1", "healthz", "sitemap", "robots"]);
const TICKER = /^\/([A-Za-z]{1,5}(?:[.-][A-Za-z]{1,2})?)\/?$/;

export function tickerFromPath(pathname) {
  const m = TICKER.exec(String(pathname || ""));
  if (!m) return null;
  const lower = m[1].toLowerCase();
  if (sitePages().has(lower) || RESERVED.has(lower)) return null;
  return m[1].toUpperCase().replace(/\./g, "-"); // SEC symbols use a dash: BRK.B is BRK-B
}

export const TRADES_SQL = LINE_SQL + `
  WHERE t.ticker=$1 AND f.ingest_status='parsed' AND NOT f.is_amendment AND NOT t.derivative AND t.transaction_code IN ('P','S')
    AND f.validation_status IS DISTINCT FROM 'flagged' AND t.transaction_date>=current_date-365
  ORDER BY t.transaction_date DESC NULLS LAST,f.published_at DESC NULLS LAST,t.id DESC LIMIT 200`;
export const LATEST_ANY_SQL = LINE_SQL + `
  WHERE t.ticker=$1 AND f.ingest_status='parsed' ORDER BY f.published_at DESC NULLS LAST,t.id DESC LIMIT 3`;
export const ENTITY_SQL = "SELECT cik,name FROM sec_entities WHERE tickers @> ARRAY[$1]::text[] ORDER BY listed DESC,last_filing_at DESC NULLS LAST LIMIT 1";

const cache = new Map();
const cached = (key, ms, make) => { const hit = cache.get(key); if (hit && hit.until > Date.now()) return hit.value;
  const value = make(); cache.set(key, { until: Date.now() + ms, value }); if (cache.size > 2000) cache.delete(cache.keys().next().value);
  Promise.resolve(value).catch(() => cache.delete(key)); return value; };

export async function tickerData(query, ticker) {
  const [trades, entity] = await Promise.all([query(TRADES_SQL, [ticker]), query(ENTITY_SQL, [ticker]).catch(() => ({ rows: [] }))]);
  const rows = withRole(trades.rows || []);
  const latestAny = rows.length ? [] : withRole((await query(LATEST_ANY_SQL, [ticker])).rows || []);
  const name = companyName(rows[0]?.issuer_name || latestAny[0]?.issuer_name || entity.rows[0]?.name || "");
  if (!rows.length && !latestAny.length && !entity.rows.length) return null;
  const buys = rows.filter(r => kindOf(r) === "buy"), sells = rows.filter(r => kindOf(r) === "sell");
  return { ticker, name, trades: rows, latestAny, counts: { trades: rows.length, buys: buys.length, sells: sells.length } };
}

/* Never a dead end: three popular stocks to try instead. */
export const POPULAR = Object.freeze(["NVDA", "TSLA", "AAPL", "MSFT"]);
const suggest = t => `<p class="schips"><span class="muted">Try a popular one</span>${POPULAR.filter(x => x !== t).slice(0, 3).map(x => `<a class="chip" href="/${x}">${x}</a>`).join("")}</p>`;
const SEC = /^https:\/\/(www\.)?sec\.gov\//;
const amountCls = k => k === "buy" ? "chg chg--up" : k === "sell" ? "chg chg--down" : "chg";

/* One trade: who, what, how much (linked to the SEC filing), when, and the plain-English sentence. */
function tradeItem(r) {
  const filing = SEC.test(String(r.source_url || "")) ? r.source_url : null, k = kindOf(r), who = personName(r.owner_name);
  const amount = esc(money(r.estimated_value) || "—");
  return `<li class="card stk-trade">
<div class="stk-trade__top"><span class="mono mono--32" aria-hidden="true">${esc(uiInitials(who))}</span>
<span class="stk-trade__who"><span class="strong">${esc(who)}</span>${r.role ? `<span class="t-label muted">${esc(r.role)}</span>` : ""}</span>
${uiTrade(k, k === "sell" && r.rule_10b5_1 === true)}${filing ? `<a class="${amountCls(k)} stk-trade__amt" href="${esc(filing)}" rel="nofollow noopener" target="_blank" title="Open the SEC Form 4">${amount}</a>` : `<span class="${amountCls(k)} stk-trade__amt">${amount}</span>`}</div>
<p class="t-body">${esc(sentence(r))}</p>
<p class="t-label muted">${esc(day(r.transaction_date) || "")}${filing ? ` · <a class="slink muted" href="${esc(filing)}" rel="nofollow noopener" target="_blank">See the SEC filing <span aria-hidden="true">↗</span></a>` : ""}</p></li>`;
}

const head2 = (t, who, h1, p) => `<header class="stk-head">
  <div class="stk-id">${uiLogo(t, 56)}<span class="stk-id__t"><span class="tick">${esc(t)}</span><span class="t-label muted">${esc(who)}</span></span></div>
  <h1 class="t-hero stk-h1">${h1}</h1>
  <p class="ssec__p">${p}</p>
</header>`;
const lookup = `<div class="stk-search"><p class="t-label muted">Look up another stock</p>${uiSearch("q2")}</div>`;
const page = (inner, cta) => `<a class="skip" href="#main">Skip to content</a>
${uiNav({ cta })}
<main id="main">
<section class="ssec stk"><div class="swrap">
${inner}
</div></section>
</main>
${uiFooter()}
${scripts()}
</body></html>`;

export function renderTickerPage(d, { origin }) {
  const t = d.ticker, who = d.name || t;
  const free = d.trades.slice(0, FREE_TRADES), more = Math.max(0, d.trades.length - free.length);
  const title = `${t} insider trading: who's buying and selling | Insidir`;
  const description = free.length ? `${sentence(free[0])} See every insider buy and sell at ${who}, in plain English, from SEC filings.`
    : `Insider buys and sells at ${who} (${t}), in plain English, from SEC filings.`;
  const list = free.length ? `<ol class="stk-trades">${free.map(tradeItem).join("")}</ol>`
    : `<div class="card stk-quiet"><p>No insider at ${esc(who)} has bought or sold ${esc(t)} stock on the open market in the last 12 months, so there is nothing to show here yet.</p>${d.latestAny.length ? `<p class="t-label muted">Their latest insider reports were other kinds, such as stock awards and shares held back for tax:</p><ol class="stk-trades">${d.latestAny.map(tradeItem).join("")}</ol>` : ""}${suggest(t)}</div>`;
  const inner = `${head2(t, who, `${esc(who)} insiders: who's buying and selling.`, `What ${esc(who)}'s CEO, CFO, directors and big shareholders reported to the SEC, in plain English. Newest first.`)}
${list}
${storiesForTicker(t).map(st => `<p class="stk-story"><a class="slink" href="${esc(storyPath(st))}">Read: ${esc(st.title)} <span aria-hidden="true">→</span></a></p>`).join("")}
<div class="card stk-lock" aria-labelledby="lock-h">
  <div class="stk-lock__blur" aria-hidden="true">${"<i><b></b><b></b><b></b></i>".repeat(4)}</div>
  <div class="stk-lock__copy">
    <h2 class="t-title" id="lock-h">${more ? `${more} more insider trade${more === 1 ? "" : "s"} at ${esc(t)} in the last 12 months.` : `Get the next ${esc(t)} insider trade the minute it's filed.`}</h2>
    <p class="muted">Full history, each insider's track record, a signal score on every trade, and alerts minutes after a new filing.</p>
    <a class="btn btn--primary btn--lg" href="/signup.html" data-cta="ticker-unlock">Start for $1</a>
    <p class="t-label muted">$1 for 7 days, then $39 a month. Cancel online anytime.</p>
  </div>
</div>
${lookup}
<p class="t-label muted stk-legal">Insiders are a company's officers, directors and owners of more than 10% of its stock. They must report their trades to the SEC within two business days. Insidir reads every filing; this page shows public records. Research, not investment advice.</p>`;
  const jsonLd = { "@context": "https://schema.org", "@type": "WebPage", name: `${who} insider trading`, url: origin + "/" + t, about: { "@type": "Corporation", name: who, tickerSymbol: t } };
  return uiHead({ title, description, canonical: "/" + encodeURIComponent(t), origin, image: "/og/" + encodeURIComponent(t) + ".png",
    extra: `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>\n` }) + `\n<body class="ui site" data-funnel-stock>\n` + page(inner, "ticker-nav");
}

/* A symbol we have nothing on: say so plainly and offer three popular stocks and the search box, never an empty page. */
export function renderUnknownTicker(t, { origin }) {
  const inner = `${head2(t, "Not found", `We couldn't find a stock called ${esc(t)}.`, "Check the spelling of the symbol, or try one of these.")}
<div class="card stk-quiet">${suggest(t)}</div>
${lookup}
<p class="t-label muted stk-legal">Insidir shows public SEC records. Research, not investment advice.</p>`;
  return uiHead({ title: `${t}: stock not found | Insidir`, description: "Insider buys and sells for any U.S. stock, in plain English, from SEC filings.", canonical: "/" + encodeURIComponent(t), origin, noindex: true })
    + `\n<body class="ui site">\n` + page(inner, "ticker-nav");
}

/* ---------- the share image ---------- */
const pango = s => String(s ?? "").replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
export async function ogImage(d) {
  const { default: sharp } = await import("sharp");
  const r = d.trades[0] || d.latestAny[0] || null;
  const k = r ? kindOf(r) : "other";
  const tone = k === "buy" ? "#2f996a" : k === "sell" ? "#f94144" : "#8f8d87";
  const text = (markup, font, file, width) => sharp({ text: { text: markup, font, fontfile: FONTS + file, rgba: true, width, wrap: "word" } }).png().toBuffer();
  const layers = [
    { input: await text(`<span foreground="#f0eee8">${pango(d.ticker)}</span>`, "Geist Mono Medium 64", "GeistMono-Medium.ttf"), top: 72, left: 80 },
    { input: await text(`<span foreground="#8f8d87">${pango(d.name || "Insider trades")}</span>`, "Geist 28", "Geist-Regular.ttf", 1000), top: 160, left: 80 }
  ];
  if (r) {
    layers.push({ input: await text(`<span foreground="${tone}">${k === "buy" ? "Bought" : k === "sell" ? "Sold" : "Filed"} ${pango(money(r.estimated_value) || "")}</span>`, "Geist Mono Medium 104", "GeistMono-Medium.ttf"), top: 250, left: 76 });
    layers.push({ input: await text(`<span foreground="#f0eee8">${pango(personName(r.owner_name))}${r.role ? `<span foreground="#8f8d87"> · ${pango(r.role)}</span>` : ""}</span>`, "Geist SemiBold 34", "Geist-SemiBold.ttf", 1040), top: 400, left: 80 });
    layers.push({ input: await text(`<span foreground="#8f8d87">${pango(day(r.transaction_date) || "")} · SEC Form 4</span>`, "Geist 26", "Geist-Regular.ttf"), top: 452, left: 80 });
  }
  const mark = await sharp(fileURLToPath(new URL("../web/assets/og/wordmark.png", import.meta.url))).resize({ height: 44 }).png().toBuffer();
  layers.push({ input: mark, top: 538, left: 80 });
  layers.push({ input: await text(`<span foreground="#8f8d87">insidir.com/${pango(d.ticker)}</span>`, "Geist 26", "Geist-Regular.ttf"), top: 548, left: 860 });
  return sharp({ create: { width: 1200, height: 630, channels: 4, background: "#0c0c0b" } }).composite(layers).png({ compressionLevel: 9 }).toBuffer();
}

/* ---------- routing ---------- */
const send = (req, res, status, type, buf, { maxAge = 300 } = {}) => {
  const tag = '"' + createHash("sha256").update(buf).digest("hex").slice(0, 20) + '"';
  if (req.headers["if-none-match"] === tag) { res.writeHead(304, { ETag: tag }); return res.end(); }
  const gz = /\bgzip\b/.test(String(req.headers["accept-encoding"] || "")) && type.startsWith("text/");
  const body = gz ? gzipSync(buf) : buf;
  res.writeHead(status, { "Content-Type": type, "Cache-Control": `public, max-age=${maxAge}, stale-while-revalidate=600`, ETag: tag, Vary: "Accept-Encoding",
    "X-Content-Type-Options": "nosniff", ...(gz ? { "Content-Encoding": "gzip" } : {}) });
  res.end(req.method === "HEAD" ? undefined : body);
};
const redirect = (res, status, location) => { res.writeHead(status, { Location: location, "Cache-Control": "public, max-age=3600" }); res.end(); };

export async function handleTickerRoute(req, res, url, { query, env = process.env }) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const p = url.pathname;
  if (p === "/search") {
    const t = String(url.searchParams.get("t") || "").trim().replace(/^\$/, "").toUpperCase();
    redirect(res, 302, /^[A-Z][A-Z0-9.-]{0,9}$/.test(t) ? "/" + encodeURIComponent(t) : "/");
    return true;
  }
  const legacy = /^\/insider-trading\/([^/]+)\/?$/.exec(p);
  if (legacy) { let t = ""; try { t = decodeURIComponent(legacy[1]).trim().toUpperCase().replace(/\./g, "-"); } catch { return false; }
    if (!/^[A-Z0-9][A-Z0-9-]{0,14}$/.test(t)) return false;
    redirect(res, 301, "/" + encodeURIComponent(t)); return true; }
  const og = /^\/og\/([A-Za-z0-9.-]{1,10})\.png$/.exec(p);
  if (og) {
    const t = og[1].toUpperCase();
    const d = await cached("data:" + t, CACHE_MS, () => tickerData(query, t));
    if (!d) return false;
    send(req, res, 200, "image/png", await cached("og:" + t, 30 * 60_000, () => ogImage(d)), { maxAge: 1800 });
    return true;
  }
  const t = tickerFromPath(p);
  if (!t) return false;
  const asked = p.replace(/^\/|\/$/g, "");
  const d = await cached("data:" + t, CACHE_MS, () => tickerData(query, t));
  if (!d) {
    if (!/^[A-Za-z]{1,5}(?:[.-][A-Za-z]{1,2})?$/.test(asked)) return false;
    send(req, res, 404, "text/html; charset=utf-8", Buffer.from(renderUnknownTicker(t, { origin: siteOrigin(env) })), { maxAge: 60 });
    return true;
  }
  if (asked !== t) { redirect(res, 301, "/" + encodeURIComponent(t) + url.search); return true; }
  const html = await cached("page:" + t, CACHE_MS, async () => Buffer.from(renderTickerPage(d, { origin: siteOrigin(env) })));
  send(req, res, 200, "text/html; charset=utf-8", html);
  return true;
}
