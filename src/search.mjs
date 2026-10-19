/* Ticker and company-name lookup over the SEC's official ticker mapping. */
import { secFetch } from "./sec.mjs";
import { tickerIndex } from "./intelligence.mjs";

let prepared = { source: null, rows: [], alphabetical: [] };
const normalize = value => String(value || "").toUpperCase().replace(/[^A-Z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

function rowsFor(index) {
  if (prepared.source === index) return prepared.rows;
  const rows = [], seen = new Set();
  for (const record of Object.values(index || {})) {
    const ticker = String(record?.ticker || "").toUpperCase(), cik = String(record?.cik_str || "");
    if (!/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(ticker) || !/^\d{1,10}$/.test(cik) || seen.has(ticker)) continue;
    seen.add(ticker);
    const name = String(record.title || ticker).slice(0, 150);
    // The mapping lists an issuer's primary listing first, so rank order breaks ties.
    rows.push({ ticker, name, cik: cik.padStart(10, "0"), key: normalize(name), rank: rows.length });
  }
  prepared = { source: index, rows, alphabetical: [...rows].sort((a, b) => a.key.localeCompare(b.key, 'en') || a.ticker.localeCompare(b.ticker, 'en')) };
  return rows;
}

export function rankCompanies(rows, query, limit = 8, offset = 0) {
  const q = normalize(query);
  if (!q) return [];
  const words = q.split(" ");
  const scored = [];
  for (const row of rows) {
    let score = 0;
    if (row.ticker === q || row.ticker.replace(/[.-]/g, "") === q.replace(/ /g, "")) score = 1000;
    else if (row.ticker.startsWith(q.replace(/ /g, ""))) score = 700 - (row.ticker.length - q.length) * 10;
    else if (row.key.startsWith(q)) score = 600;
    else if (words.every(w => row.key.split(" ").some(part => part.startsWith(w)))) score = 450;
    else if (q.length >= 3 && row.key.includes(q)) score = 300;
    if (score) scored.push({ row, base: score, score: score - Math.min(200, row.rank / 50) });
  }
  scored.sort((a, b) => b.score - a.score || a.row.rank - b.row.rank);
  const out = [], ciks = new Set();
  for (const { row, base } of scored) {
    // Name matches collapse to one listing per issuer; ticker matches keep each share class.
    if (ciks.has(row.cik) && base < 640) continue;
    ciks.add(row.cik);
    out.push({ ticker: row.ticker, name: row.name, cik: row.cik });
    if (out.length >= limit + offset) break;
  }
  return out.slice(offset);
}

export async function searchCompanies(query, { limit = 8, offset = 0, fetcher = secFetch } = {}) {
  return rankCompanies(rowsFor(await tickerIndex(fetcher)), query, limit, offset);
}

/* Browse the entire official SEC ticker-index snapshot, not the small imported Form 4 subset.
 * A ticker mapping is not a list of every U.S. business (unlisted/private issuers are absent).
 * Pagination is deterministic within the cached 24-hour index snapshot. */
export async function browseCompanies({ offset = 0, limit = 50, fetcher = secFetch } = {}) {
  const index = await tickerIndex(fetcher);
  rowsFor(index);
  const rows = prepared.alphabetical;
  const start = Math.max(0, Math.trunc(offset));
  const take = Math.max(1, Math.min(100, Math.trunc(limit)));
  const end = Math.min(start + take, rows.length);
  return {
    items: rows.slice(start, end).map(({ticker,name,cik}) => ({ticker,name,cik})),
    total: rows.length,
    offset: start,
    limit: take,
    hasMore: end < rows.length,
    nextOffset: end < rows.length ? end : null,
    source: "SEC official company ticker mapping"
  };
}
