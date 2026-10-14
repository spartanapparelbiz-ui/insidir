/* Warm-up after each SEC import: the companies and reporting people filed in the last minutes get
 * their logos and roster photos resolved before anyone opens the dashboard. It goes through the
 * same queues as GET /v1/media at low priority ("warm"), so a page someone is looking at always
 * goes first, and with a database the results survive restarts. */
import { mediaBatch, loadOwnersFrom, cleanTicker, cleanCik, MEDIA_LIMITS } from "./media-batch.mjs";

export const RECENT_SQL = `SELECT DISTINCT t.ticker,t.owner_cik FROM sec_transactions t
  JOIN sec_filings f ON f.accession=t.accession
  WHERE f.ingest_status='parsed' AND f.retrieved_at>=now()-make_interval(mins=>$1::integer) AND t.ticker IS NOT NULL
  LIMIT 600`;

/* [{ticker, owner_cik}] -> [{ticker, owners:[cik]}] (normalised, de-duplicated). */
export function groupRecent(rows) {
  const out = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const ticker = cleanTicker(row?.ticker);
    if (!ticker) continue;
    const entry = out.get(ticker) || { ticker, owners: [] };
    const cik = cleanCik(row?.owner_cik);
    if (cik && !entry.owners.includes(cik)) entry.owners.push(cik);
    out.set(ticker, entry);
  }
  return [...out.values()];
}

/* entries: ["AAPL", ...] or [{ticker, owners:[cik]}]. Batches within GET /v1/media's limits.
 * deps: mediaBatch deps (loadOwners confirms each owner and supplies the filed name). */
export async function warmMedia(entries, deps = {}) {
  const list = (Array.isArray(entries) ? entries : []).map(e => typeof e === "string" ? { ticker: e, owners: [] } : e)
    .map(e => ({ ticker: cleanTicker(e?.ticker), owners: (e?.owners || []).map(cleanCik).filter(Boolean) })).filter(e => e.ticker);
  const summary = { tickers: 0, people: 0, batches: 0, pendingLogos: 0, pendingPhotos: 0 };
  let batch = { tickers: [], people: [] };
  const flush = async () => {
    if (!batch.tickers.length && !batch.people.length) return;
    const body = await (deps.mediaBatch || mediaBatch)({ ...batch, ciks: [], wait: 0, invalid: [] }, deps, { priority: "warm", maxStarts: MEDIA_LIMITS.tickers, maxPhotoStarts: 20 });
    summary.batches++;
    summary.pendingLogos += body?.pending?.logos?.length || 0;
    summary.pendingPhotos += body?.pending?.photos?.length || 0;
    batch = { tickers: [], people: [] };
  };
  for (const e of list) {
    const people = e.owners.map(cik => ({ cik, ticker: e.ticker, pair: cik + ":" + e.ticker }));
    if (batch.tickers.length + 1 > MEDIA_LIMITS.tickers || batch.people.length + people.length > MEDIA_LIMITS.people) await flush();
    batch.tickers.push(e.ticker);
    batch.people.push(...people.slice(0, MEDIA_LIMITS.people));
    summary.tickers++;
    summary.people += Math.min(people.length, MEDIA_LIMITS.people);
  }
  await flush();
  return summary;
}

/* Called by the engine after ingest(): everything filed in the last `minutes`. */
export async function warmAfterIngest(run, { minutes = 20, deps = {} } = {}) {
  const rows = (await run(RECENT_SQL, [minutes])).rows;
  return warmMedia(groupRecent(rows), { loadOwners: pairs => loadOwnersFrom(run, pairs), ...deps });
}
