/* Stored daily closes for the insider track record (src/track-record.mjs). One download per ticker per day from the
 * market data provider (Yahoo Finance chart data, split-adjusted closes, 10 years of daily points), kept in
 * price_daily so the hit rates never depend on the provider answering at page load. Nothing is interpolated: a day
 * the provider has no close for is simply absent. MARKET_DATA_PROVIDER=none switches downloads off. */
import { externalFetch } from "./external.mjs";
import { marketProvider, providerSymbol } from "./market.mjs";

export const PROVIDER = "yahoo";
export const REFRESH_MS = 20 * 3600_000;
const finite = v => typeof v === "number" && Number.isFinite(v);

/* A Yahoo v8 chart payload (interval=1d) as [[YYYY-MM-DD, close]], oldest first. The trading day is the timestamp in
 * the exchange's own time zone (meta.gmtoffset), so a 09:30 New York bar is that day, not the UTC one. */
export function dailyCloses(payload, ticker) {
  const result = payload?.chart?.result?.[0];
  if (!result || String(result.meta?.symbol || "").toUpperCase() !== providerSymbol(ticker)) return [];
  const offset = Number.isInteger(result.meta?.gmtoffset) ? result.meta.gmtoffset : -5 * 3600;
  const stamps = Array.isArray(result.timestamp) ? result.timestamp : [];
  const closes = result.indicators?.quote?.[0]?.close || [];
  const byDay = new Map();
  for (let i = 0; i < stamps.length && i < closes.length; i++) {
    const t = stamps[i], c = closes[i];
    if (!Number.isInteger(t) || !finite(c) || c <= 0) continue;
    byDay.set(new Date((t + offset) * 1000).toISOString().slice(0, 10), Math.round(c * 1e6) / 1e6);
  }
  return [...byDay.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1);
}

export async function downloadCloses(ticker, fetcher = externalFetch) {
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(providerSymbol(ticker)) + "?range=10y&interval=1d&includePrePost=false&events=";
  return dailyCloses(await fetcher(url, { json: true, maxBytes: 3_000_000 }), ticker);
}

/* The stored series for a ticker, downloading it first when it is missing or older than REFRESH_MS. A failed
 * download is recorded and the stored points (if any) are used. Returns [[YYYY-MM-DD, close]] oldest first. */
export async function closesFor(query, ticker, { fetcher = externalFetch, now = Date.now(), download = true } = {}) {
  const t = String(ticker || "").toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(t)) return [];
  const state = (await query("SELECT fetched_at,status FROM price_series WHERE ticker=$1", [t])).rows[0];
  const stale = !state || now - new Date(state.fetched_at).getTime() > REFRESH_MS;
  if (download && stale && marketProvider()) {
    try {
      const points = await downloadCloses(t, fetcher);
      if (points.length) await query(`INSERT INTO price_daily(ticker,day,close) SELECT $1,d::date,c FROM unnest($2::text[],$3::numeric[]) AS x(d,c)
        ON CONFLICT (ticker,day) DO UPDATE SET close=EXCLUDED.close`, [t, points.map(p => p[0]), points.map(p => p[1])]);
      await query(`INSERT INTO price_series(ticker,provider,first_day,last_day,points,status,error,fetched_at) VALUES($1,$2,$3,$4,$5,$6,NULL,now())
        ON CONFLICT (ticker) DO UPDATE SET provider=EXCLUDED.provider,first_day=EXCLUDED.first_day,last_day=EXCLUDED.last_day,points=EXCLUDED.points,
        status=EXCLUDED.status,error=NULL,fetched_at=now()`, [t, PROVIDER, points[0]?.[0] || null, points.at(-1)?.[0] || null, points.length, points.length ? "ok" : "empty"]);
    } catch (e) {
      await query(`INSERT INTO price_series(ticker,provider,status,error,fetched_at) VALUES($1,$2,'error',$3,now())
        ON CONFLICT (ticker) DO UPDATE SET status='error',error=EXCLUDED.error,fetched_at=now()`, [t, PROVIDER, String(e?.message || e).slice(0, 300)]);
    }
  }
  return (await query("SELECT to_char(day,'YYYY-MM-DD') AS day,close::float8 AS close FROM price_daily WHERE ticker=$1 ORDER BY day", [t])).rows.map(r => [r.day, r.close]);
}
