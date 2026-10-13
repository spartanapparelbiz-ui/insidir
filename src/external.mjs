/* Bounded fetches to the few public, non-SEC sources the company report uses:
 * delayed market prices, Wikidata/Wikipedia company profiles and headline feeds.
 * Hosts are allowlisted, responses are size-limited and requests time out. */
import { config } from "./config.mjs";

const allowedHosts = new Set([
  "query1.finance.yahoo.com",
  "query2.finance.yahoo.com",
  "feeds.finance.yahoo.com",
  "query.wikidata.org",
  "en.wikipedia.org"
]);

export function allowedExternalUrl(input) {
  try {
    const u = new URL(input);
    return u.protocol === "https:" && !u.username && !u.password && !u.port && allowedHosts.has(u.hostname);
  } catch { return false; }
}

// Wikimedia asks automated clients for a descriptive agent with contact details.
export function contactAgent() {
  const email = /[^@\s]+@[^@\s]+\.[^@\s]+/.exec(config.userAgent)?.[0];
  return "InsidirResearch/1.0 (" + (email || "https://insidir.com") + ")";
}

export async function externalFetch(url, { json = true, accept, maxBytes = 3_000_000, timeoutMs = 9000, method = "GET", body, headers = {} } = {}) {
  if (!allowedExternalUrl(url)) throw new Error("Disallowed external URL");
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), Math.min(timeoutMs, config.timeoutMs));
  try {
    const response = await fetch(url, {
      method, body, signal: abort.signal, redirect: "error",
      headers: { "User-Agent": contactAgent(), "Accept": accept || (json ? "application/json" : "*/*"), ...headers }
    });
    if (!response.ok) throw Object.assign(new Error("Upstream responded " + response.status), { upstreamStatus: response.status });
    const size = Number(response.headers.get("content-length") || 0);
    if (size > maxBytes) throw new Error("Upstream response too large");
    const text = await response.text();
    if (text.length > maxBytes) throw new Error("Upstream response too large");
    return json ? JSON.parse(text) : text;
  } finally { clearTimeout(timer); }
}
