/* Polymarket's public APIs (no key): Gamma for markets and events, the Data API for holders, trades and wallet
 * history. Raw responses are read defensively here (lib/parse.ts) and leave this file only as the normalised
 * types in lib/types.ts. */
import { cached, TTL } from "./cache";
import { getJson } from "./http";
import { bool, epochSeconds, isObject, list, num, numList, rows, str, strList, type JsonObject } from "./parse";
import type { ClosedPosition, EventInfo, Holder, Market, Side, Trade, WalletAge } from "./types";

// Overridable only for local testing against a stub server; production uses Polymarket's hosts.
export const GAMMA = process.env.POLYMARKET_GAMMA_URL || "https://gamma-api.polymarket.com";
export const DATA = process.env.POLYMARKET_DATA_URL || "https://data-api.polymarket.com";
const enc = encodeURIComponent;

/* ---------- Gamma ---------- */

export function readMarket(m: JsonObject, event?: { slug: string | null; title: string | null }): Market | null {
  const slug = str(m.slug), conditionId = str(m.conditionId);
  if (!slug || !conditionId) return null;
  const outcomes = strList(m.outcomes);
  const prices = numList(m.outcomePrices);
  const closed = bool(m.closed);
  let resolvedOutcome: string | null = null;
  if (closed) {
    const i = prices.findIndex(p => p >= 0.99);
    if (i >= 0) resolvedOutcome = outcomes[i] ?? null;
  }
  const ev = Array.isArray(m.events) ? m.events.find(isObject) : undefined;
  return {
    slug,
    question: str(m.question) ?? slug,
    groupItemTitle: str(m.groupItemTitle),
    conditionId,
    outcomes: outcomes.length ? outcomes : ["Yes", "No"],
    prices: outcomes.map((_, i) => prices[i] ?? 0),
    tokenIds: strList(m.clobTokenIds),
    closed,
    volume: num(m.volumeNum) ?? num(m.volume) ?? 0,
    endDate: str(m.endDate) ?? str(m.endDateIso),
    image: str(m.image) ?? str(m.icon),
    resolvedOutcome,
    eventSlug: event?.slug ?? (ev ? str(ev.slug) : null),
    eventTitle: event?.title ?? (ev ? str(ev.title) : null),
  };
}

export function readEvent(e: unknown): EventInfo | null {
  if (!isObject(e)) return null;
  const slug = str(e.slug), title = str(e.title);
  if (!slug) return null;
  const markets = list(e.markets).filter(isObject).map(m => readMarket(m, { slug, title })).filter((m): m is Market => m !== null);
  return { id: str(e.id) ?? slug, slug, title: title ?? slug, markets };
}

export const getEvent = (slug: string): Promise<EventInfo | null> =>
  cached("gamma:event:" + slug, TTL.gamma, async () => readEvent(await getJson(`${GAMMA}/events/slug/${enc(slug)}`)));

export const getMarket = (slug: string): Promise<Market | null> =>
  cached("gamma:market:" + slug, TTL.gamma, async () => {
    const raw = await getJson(`${GAMMA}/markets/slug/${enc(slug)}`);
    return isObject(raw) ? readMarket(raw) : null;
  });

/* ---------- Data API: holders and trades ---------- */

/** A display name only when the profile shows one; never the wallet address itself. */
export function displayName(r: JsonObject): string | null {
  const name = str(r.name), pseudonym = str(r.pseudonym);
  const usable = (s: string | null) => (s && !/^0x[0-9a-f]{6,}/i.test(s) ? s : null);
  if (r.displayUsernamePublic !== false && usable(name)) return usable(name);
  return usable(pseudonym) ?? usable(name);
}

export function readHolders(raw: unknown, market: Pick<Market, "tokenIds">): Holder[] {
  const out: Holder[] = [];
  for (const group of rows(raw)) {
    const token = str(group.token);
    const tokenIndex = token ? market.tokenIds.indexOf(token) : -1;
    for (const h of list(group.holders).filter(isObject)) {
      const wallet = str(h.proxyWallet);
      const shares = num(h.amount) ?? 0;
      const outcomeIndex = num(h.outcomeIndex) ?? tokenIndex;
      if (!wallet || shares <= 0 || outcomeIndex < 0) continue;
      out.push({ wallet, name: displayName(h), shares, outcomeIndex });
    }
  }
  return out;
}

export async function getHolders(market: Pick<Market, "conditionId" | "tokenIds">, limit = 20): Promise<Holder[]> {
  return readHolders(await getJson(`${DATA}/holders?market=${enc(market.conditionId)}&limit=${limit}`), market);
}

export function readTrades(raw: unknown, market: Pick<Market, "outcomes">): Trade[] {
  const out: Trade[] = [];
  for (const t of rows(raw)) {
    const wallet = str(t.proxyWallet);
    const sideRaw = str(t.side)?.toUpperCase();
    const side: Side | null = sideRaw === "BUY" || sideRaw === "SELL" ? sideRaw : null;
    const size = num(t.size), price = num(t.price), timestamp = epochSeconds(t.timestamp);
    const outcome = str(t.outcome);
    const byName = outcome ? market.outcomes.findIndex(o => o.toLowerCase() === outcome.toLowerCase()) : -1;
    const outcomeIndex = num(t.outcomeIndex) ?? byName;
    if (!wallet || !side || size === null || price === null || timestamp === null || outcomeIndex < 0) continue;
    out.push({ wallet, name: displayName(t), side, size, price, timestamp, outcomeIndex, outcome, txHash: str(t.transactionHash) });
  }
  return out;
}

export interface TradeQuery { start: number; limit: number; minCash?: number }

export async function getTrades(market: Pick<Market, "conditionId" | "outcomes">, q: TradeQuery): Promise<Trade[]> {
  const filter = q.minCash ? `&filterType=CASH&filterAmount=${q.minCash}` : "";
  const url = `${DATA}/trades?market=${enc(market.conditionId)}&takerOnly=true&start=${Math.floor(q.start)}&limit=${q.limit}${filter}`;
  // The start parameter is applied again here, in case the API returns older fills.
  return readTrades(await getJson(url), market).filter(t => t.timestamp >= q.start);
}

/* ---------- Data API: wallets ---------- */

export function readClosedPositions(raw: unknown): ClosedPosition[] {
  return rows(raw).map(p => ({ conditionId: str(p.conditionId), realizedPnl: num(p.realizedPnl) ?? 0 }));
}

export const getClosedPositions = (wallet: string, limit = 50): Promise<ClosedPosition[]> =>
  cached("wallet:closed:" + wallet.toLowerCase(), TTL.walletRecord, async () =>
    readClosedPositions(await getJson(`${DATA}/closed-positions?user=${enc(wallet)}&limit=${limit}&sortBy=TIMESTAMP&sortDirection=DESC`)));

/** The wallet's first-ever trade time and how many markets it has traded. */
export const getWalletAge = (wallet: string): Promise<WalletAge> =>
  cached("wallet:age:" + wallet.toLowerCase(), TTL.walletAge, async () => {
    const [activity, stats] = await Promise.all([
      getJson(`${DATA}/v2/activity?user=${enc(wallet)}&type=TRADE&sort_by=TIMESTAMP&sort_direction=ASC&limit=1&start=1`),
      getJson(`${DATA}/v2/user-stats?user=${enc(wallet)}`),
    ]);
    const first = rows(activity)[0];
    const data = isObject(stats) ? stats.data : null;
    return {
      firstTradeAt: first ? epochSeconds(first.timestamp) : null,
      marketsTraded: isObject(data) ? num(data.trades) : null,
    };
  });
