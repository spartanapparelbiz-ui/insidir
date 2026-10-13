/* Company news: official 8-K announcements from SEC EDGAR, plus third-party headlines
 * from the ticker's public RSS feed. Headlines link to the publisher; no article text
 * is copied or summarized. */
import { XMLParser } from "fast-xml-parser";
import { createCache } from "./cache.mjs";
import { externalFetch } from "./external.mjs";
import { providerSymbol } from "./market.mjs";

const cache = createCache(300);
const TTL = 15 * 60 * 1000;
const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true, processEntities: true });
const list = value => value == null ? [] : Array.isArray(value) ? value : [value];
const text = value => {
  if (value == null) return "";
  if (typeof value === "object") return text(value["#text"]);
  return String(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
};

export function parseHeadlines(xml, limit = 15) {
  let channel;
  try { channel = parser.parse(String(xml || ""))?.rss?.channel; } catch { return []; }
  const seen = new Set();
  const out = [];
  for (const item of list(channel?.item)) {
    const title = text(item?.title).slice(0, 220);
    let url;
    try { url = new URL(text(item?.link)); } catch { continue; }
    if (!title || !/^https?:$/.test(url.protocol) || url.username || url.password) continue;
    url.searchParams.delete(".tsrc");
    const published = Date.parse(text(item?.pubDate));
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      title, url: url.href,
      publisher: /(^|\.)yahoo\.com$/.test(url.hostname) ? "Yahoo Finance" : url.hostname.replace(/^(www|finance|news|app)\./, ""),
      publishedAt: Number.isFinite(published) ? new Date(published).toISOString() : null,
      summary: text(item?.description).slice(0, 280) || null
    });
    if (out.length >= limit) break;
  }
  return out.sort((a, b) => String(b.publishedAt || "").localeCompare(String(a.publishedAt || "")));
}

// Brands that differ from the registrant's legal name.
const BRAND_ALIASES = { GOOGL: ["Google"], GOOG: ["Google"], META: ["Facebook", "Instagram"], BRK: ["Berkshire"], "BRK-B": ["Berkshire"], "BRK-A": ["Berkshire"] };
const GENERIC = new Set(["THE", "INC", "CORP", "CORPORATION", "CO", "COMPANY", "GROUP", "HOLDINGS", "LTD", "PLC", "SA", "NV", "AG", "FIRST", "AMERICAN", "NATIONAL", "INTERNATIONAL", "GLOBAL", "UNITED", "GENERAL", "BANK", "TRUST", "FINANCIAL", "CAPITAL"]);
export function relevanceTerms(ticker, companyName) {
  const symbol = String(ticker || "").toUpperCase();
  // One- and two-letter tickers (V, KO) only count in "(KO)" or "NYSE:KO" form; bare they match ordinary words.
  const terms = new Set(symbol.length >= 3 ? [symbol] : ["(" + symbol + ")", ":" + symbol]);
  const words = String(companyName || "").toUpperCase().replace(/[^A-Z0-9& ]+/g, " ").split(/\s+/).filter(Boolean);
  const first = words.find(w => !GENERIC.has(w) && w.length >= 3);
  if (first) terms.add(first);
  for (const alias of BRAND_ALIASES[String(ticker || "").toUpperCase()] || []) terms.add(alias.toUpperCase());
  return [...terms].filter(Boolean);
}
/* Ticker feeds mix in market roundups; keep only stories whose headline or summary names the company. */
export function focusHeadlines(headlines, terms) {
  const pattern = new RegExp("(^|[^A-Z0-9])(" + terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")(?=[^A-Z0-9]|$)", "i");
  return headlines.filter(h => pattern.test(h.title) || pattern.test(h.summary || "")).map(h => ({ ...h, relevant: true }));
}

/* Yahoo Finance search news: headline, publisher name, link and publish time only. */
export function parseSearchNews(payload, limit = 30) {
  const out = [];
  for (const item of Array.isArray(payload?.news) ? payload.news : []) {
    const title = text(item?.title).slice(0, 220);
    let url;
    try { url = new URL(String(item?.link || "")); } catch { continue; }
    if (!title || !/^https?:$/.test(url.protocol) || url.username || url.password) continue;
    const published = Number(item?.providerPublishTime);
    out.push({
      title, url: url.href,
      publisher: text(item?.publisher).slice(0, 60) || url.hostname.replace(/^www\./, ""),
      publishedAt: Number.isFinite(published) && published > 0 ? new Date(published * 1000).toISOString() : null,
      summary: null
    });
    if (out.length >= limit) break;
  }
  return out;
}

export function mergeHeadlines(...lists) {
  const seen = new Set(), out = [];
  for (const item of lists.flat()) {
    const key = item.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.sort((a, b) => String(b.publishedAt || "").localeCompare(String(a.publishedAt || "")));
}

export async function getHeadlines(ticker, fetcher = externalFetch) {
  const symbol = providerSymbol(ticker);
  const work = async () => {
    const [search, rss] = await Promise.allSettled([
      fetcher("https://query2.finance.yahoo.com/v1/finance/search?q=" + encodeURIComponent(symbol) + "&quotesCount=0&newsCount=30&enableFuzzyQuery=false", { json: true, maxBytes: 1_000_000 }),
      fetcher("https://feeds.finance.yahoo.com/rss/2.0/headline?s=" + encodeURIComponent(symbol) + "&region=US&lang=en-US",
        { json: false, accept: "application/rss+xml,application/xml,text/xml", maxBytes: 1_000_000 })
    ]);
    if (search.status === "rejected" && rss.status === "rejected") throw search.reason;
    return mergeHeadlines(search.status === "fulfilled" ? parseSearchNews(search.value) : [], rss.status === "fulfilled" ? parseHeadlines(rss.value) : []);
  };
  return fetcher === externalFetch ? cache("headlines:" + symbol, TTL, work) : work();
}

/* 8-K filings with their item headlines; earnings releases are item 2.02. */
export function announcementsFromFilings(filings) {
  return (filings || []).filter(f => /^(8-K|6-K)/.test(f.form)).slice(0, 20).map(f => {
    const items = (f.items || []).filter(item => item.code !== "9.01");
    return {
      title: items.length ? items.map(item => item.label).join(" · ") : f.headline,
      form: f.form, filedAt: f.filedAt, url: f.sourceUrl,
      earnings: items.some(item => item.code === "2.02"),
      items: f.items || []
    };
  });
}
