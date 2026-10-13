/* Delayed market prices for the company report. Values come from the provider's
 * published chart data; nothing is interpolated, smoothed or estimated. */
import { createCache } from "./cache.mjs";
import { externalFetch } from "./external.mjs";

export const MARKET_RANGES = Object.freeze({
  "1D": { range: "1d", interval: "5m", ttl: 60_000 },
  "1W": { range: "5d", interval: "30m", ttl: 5 * 60_000 },
  "1M": { range: "1mo", interval: "1h", ttl: 10 * 60_000 },
  "3M": { range: "3mo", interval: "1d", ttl: 15 * 60_000 },
  "1Y": { range: "1y", interval: "1d", ttl: 15 * 60_000 },
  "5Y": { range: "5y", interval: "1wk", ttl: 60 * 60_000 }
});
const cache = createCache(400);
const finite = value => typeof value === "number" && Number.isFinite(value);
const round = (value, digits = 4) => Math.round(value * 10 ** digits) / 10 ** digits;

export function providerSymbol(ticker) {
  return String(ticker || "").toUpperCase().replace(/\./g, "-");
}
export function marketProvider() {
  const configured = String(process.env.MARKET_DATA_PROVIDER || "yahoo").toLowerCase();
  return configured === "none" || configured === "off" || configured === "0" ? null : "yahoo";
}

/* Converts a Yahoo Finance v8 chart payload into the Insidir series format. */
export function normalizeChart(payload, ticker, rangeKey, now = Date.now()) {
  const result = payload?.chart?.result?.[0];
  if (!result || typeof result !== "object") return null;
  const meta = result.meta || {};
  if (String(meta.symbol || "").toUpperCase() !== providerSymbol(ticker)) return null;
  const stamps = Array.isArray(result.timestamp) ? result.timestamp : [];
  const closes = result.indicators?.quote?.[0]?.close;
  const points = [];
  if (Array.isArray(closes)) {
    for (let i = 0; i < stamps.length && i < closes.length; i++) {
      const t = stamps[i], c = closes[i];
      if (!Number.isInteger(t) || !finite(c) || c <= 0) continue;
      points.push([t * 1000, round(c)]);
    }
  }
  const price = finite(meta.regularMarketPrice) && meta.regularMarketPrice > 0 ? meta.regularMarketPrice : points.at(-1)?.[1] ?? null;
  const previousClose = finite(meta.previousClose) ? meta.previousClose : rangeKey === "1D" && finite(meta.chartPreviousClose) ? meta.chartPreviousClose : null;
  const regular = meta.currentTradingPeriod?.regular;
  const open = regular && Number.isInteger(regular.start) && Number.isInteger(regular.end) && now >= regular.start * 1000 && now < regular.end * 1000;
  const first = rangeKey === "1D" && previousClose != null ? previousClose : points[0]?.[1] ?? null;
  return {
    ticker: String(ticker).toUpperCase(),
    range: rangeKey,
    currency: typeof meta.currency === "string" ? meta.currency.slice(0, 6) : "USD",
    exchange: typeof meta.fullExchangeName === "string" ? meta.fullExchangeName.slice(0, 40) : typeof meta.exchangeName === "string" ? meta.exchangeName.slice(0, 40) : null,
    timezone: typeof meta.exchangeTimezoneName === "string" ? meta.exchangeTimezoneName : "America/New_York",
    price: price == null ? null : round(price),
    previousClose: previousClose == null ? null : round(previousClose),
    marketTime: Number.isInteger(meta.regularMarketTime) ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
    marketState: open ? "open" : "closed",
    dayHigh: finite(meta.regularMarketDayHigh) ? round(meta.regularMarketDayHigh) : null,
    dayLow: finite(meta.regularMarketDayLow) ? round(meta.regularMarketDayLow) : null,
    fiftyTwoWeekHigh: finite(meta.fiftyTwoWeekHigh) ? round(meta.fiftyTwoWeekHigh) : null,
    fiftyTwoWeekLow: finite(meta.fiftyTwoWeekLow) ? round(meta.fiftyTwoWeekLow) : null,
    volume: finite(meta.regularMarketVolume) ? meta.regularMarketVolume : null,
    rangeChange: first != null && price != null ? round(price - first) : null,
    rangeChangePercent: first && price != null ? round((price - first) / first * 100, 3) : null,
    points: points.length > 420 ? points.filter((_, i) => i % Math.ceil(points.length / 420) === 0 || i === points.length - 1) : points
  };
}

async function fetchChart(ticker, rangeKey, fetcher) {
  const spec = MARKET_RANGES[rangeKey];
  const url = "https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(providerSymbol(ticker)) +
    "?range=" + spec.range + "&interval=" + spec.interval + "&includePrePost=false&events=";
  const payload = await fetcher(url, { json: true, maxBytes: 2_500_000 }).catch(error => {
    if (error?.upstreamStatus === 404) throw Object.assign(new Error("No market data for this ticker"), { status: 404 });
    throw error;
  });
  const chart = normalizeChart(payload, ticker, rangeKey);
  if (!chart || chart.price == null) throw Object.assign(new Error("No market data for this ticker"), { status: 404 });
  return chart;
}

/* The selected range supplies the line; the 1D series supplies the session quote
 * (previous close and daily change), so the headline is the same for every range. */
export async function getMarketChart(ticker, rangeKey = "1Y", fetcher = externalFetch) {
  if (!marketProvider()) throw Object.assign(new Error("Market data is turned off for this deployment"), { status: 503 });
  if (!MARKET_RANGES[rangeKey]) throw Object.assign(new Error("Unsupported chart range"), { status: 400 });
  const symbol = String(ticker).toUpperCase();
  const load = key => cache(fetcher === externalFetch ? "chart:" + symbol + ":" + key : Symbol(key), MARKET_RANGES[key].ttl, () => fetchChart(symbol, key, fetcher));
  const [series, day] = await Promise.all([load(rangeKey), rangeKey === "1D" ? null : load("1D").catch(() => null)]);
  const session = rangeKey === "1D" ? series : day;
  const price = session?.price ?? series.price;
  const previousClose = session?.previousClose ?? null;
  return {
    ...series,
    price,
    previousClose,
    change: previousClose ? Math.round((price - previousClose) * 100) / 100 : null,
    changePercent: previousClose ? Math.round((price - previousClose) / previousClose * 100_000) / 1000 : null,
    marketTime: session?.marketTime || series.marketTime,
    marketState: session?.marketState || series.marketState,
    dayHigh: session?.dayHigh ?? null,
    dayLow: session?.dayLow ?? null,
    volume: session?.volume ?? null,
    source: { name: "Yahoo Finance", url: "https://finance.yahoo.com/quote/" + encodeURIComponent(providerSymbol(symbol)), delayed: true }
  };
}
