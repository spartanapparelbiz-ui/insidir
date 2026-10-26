/* The worker's move polling (docs/INSIDIR-V2.md §3), with the network injected so tests can drive it.
 *   Polymarket: every poll reads the newest public fills of at least FILL_MIN dollars, back to LOOKBACK_MS, keeps
 *   them in a buffer (deduped by fill id), and rebuilds moves from the buffer: a wallet's fills in one market and
 *   outcome merge while each is within 10 minutes of the last. A wallet is checked once per NOISE_TTL_MS against its
 *   own last day of trades (market maker or bot: skipped).
 *   Kalshi: every poll reads all public trades since the last one seen (cursor pages), and each trade of at least
 *   WHALE_MIN_KALSHI is a move. Kalshi trades are anonymous. */
import { kalshiMoves, noisyWallet, polymarketMoves, type MarketInfo, type WalletTrade } from "./detect";
import { readKalshiFills, readPolymarketFills } from "./sources";
import type { Fill, Move } from "./types";
import { rows, str, isObject } from "@/lib/exchanges/parse";
import type { VMarket } from "@/lib/types";

export const FILL_MIN = Number(process.env.WHALE_FILL_MIN ?? 500);
export const LOOKBACK_MS = 70 * 60_000;
export const NOISE_TTL_MS = 30 * 60_000;
/** At most this many wallet checks per poll (each is one Data API call). */
export const NOISE_CHECKS_PER_POLL = 10;
const POLY_PAGES = 6;
const KALSHI_PAGES = 10;

/** Market details for the given ids (lib/moves/directory.ts). */
export type MarketLookup = (ids: string[]) => Promise<ReadonlyMap<string, VMarket>>;

export interface MoveSources {
  polyTradesPage(offset: number): Promise<unknown>;
  /** The wallet's trades over the last day (for the noise checks). */
  polyWalletTrades(wallet: string, sinceMs: number): Promise<WalletTrade[]>;
  kalshiTradesPage(minTsSec: number, cursor?: string): Promise<unknown>;
}

export class MovesPoller {
  private polyFills = new Map<string, Fill>();
  private noise = new Map<string, { noisy: boolean; at: number }>();
  private kalshiSeen = new Map<string, number>();
  private kalshiSince: number | null = null;

  constructor(private readonly src: MoveSources) {}

  /** Classification and links for every market the sweep knows, keyed by market id. */
  static infoFrom(markets: readonly VMarket[]): Map<string, MarketInfo> {
    const out = new Map<string, MarketInfo>();
    for (const m of markets) out.set(m.id, { category: m.category, labels: [m.eventTitle ?? "", m.title, m.seriesId ?? "", m.eventId], url: m.url });
    return out;
  }

  /** `info` is a map, or a lookup called with the market ids of this poll's candidate moves (lib/moves/directory.ts). */
  async pollPolymarket(now: number, infoOrLookup: ReadonlyMap<string, MarketInfo> | MarketLookup): Promise<Move[]> {
    for (let page = 0; page < POLY_PAGES; page++) {
      const raw = await this.src.polyTradesPage(page * 500);
      const fills = readPolymarketFills(raw);
      for (const f of fills) this.polyFills.set(f.id, f);
      const oldest = fills.reduce((m, f) => Math.min(m, f.at), Infinity);
      if (rows(raw).length < 500 || oldest < now - LOOKBACK_MS) break;
    }
    for (const [k, f] of this.polyFills) if (f.at < now - LOOKBACK_MS) this.polyFills.delete(k);
    const fills = [...this.polyFills.values()];
    const info = typeof infoOrLookup === "function"
      ? MovesPoller.infoFrom([...(await infoOrLookup([...new Set(polymarketMoves(fills, new Map()).map(m => m.marketId))])).values()])
      : infoOrLookup;
    const candidates = polymarketMoves(fills, info);
    const out: Move[] = [];
    let checks = 0;
    for (const m of candidates) {
      const key = `${m.wallet}|${m.marketId}`;
      let n = this.noise.get(key);
      if (!n || now - n.at > NOISE_TTL_MS) {
        if (checks >= NOISE_CHECKS_PER_POLL) continue; // checked on a later poll before it is shown
        checks++;
        const trades = await this.src.polyWalletTrades(m.wallet!, now - 86_400_000);
        n = { noisy: noisyWallet(trades, m.marketId, now), at: now };
        this.noise.set(key, n);
      }
      if (!n.noisy) out.push(m);
    }
    for (const [k, v] of this.noise) if (now - v.at > 4 * NOISE_TTL_MS) this.noise.delete(k);
    return out;
  }

  /** `markets` is a map of known markets, or a lookup called with the tickers this poll's trades name. */
  async pollKalshi(now: number, marketsOrLookup: ReadonlyMap<string, VMarket> | MarketLookup, infoIn?: ReadonlyMap<string, MarketInfo>): Promise<Move[]> {
    const since = this.kalshiSince ?? now - 15 * 60_000;
    const fills: Fill[] = [];
    const pages: unknown[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < KALSHI_PAGES; page++) {
      const raw = await this.src.kalshiTradesPage(Math.floor(since / 1000) - 5, cursor);
      pages.push(raw);
      const next = isObject(raw) ? str(raw.cursor) : null;
      if (!next || next === cursor) break;
      cursor = next;
    }
    let markets: ReadonlyMap<string, VMarket>;
    if (typeof marketsOrLookup === "function") {
      const tickers = new Set<string>();
      for (const raw of pages) for (const t of rows(raw, ["trades"])) { const k = str(t.ticker); if (k) tickers.add(k); }
      markets = tickers.size ? await marketsOrLookup([...tickers]) : new Map();
    } else markets = marketsOrLookup;
    const info = infoIn ?? MovesPoller.infoFrom([...markets.values()]);
    for (const raw of pages) for (const f of readKalshiFills(raw, markets)) if (!this.kalshiSeen.has(f.id)) { this.kalshiSeen.set(f.id, f.at); fills.push(f); }
    this.kalshiSince = Math.max(since, ...fills.map(f => f.at));
    for (const [k, at] of this.kalshiSeen) if (at < now - 2 * 3_600_000) this.kalshiSeen.delete(k);
    return kalshiMoves(fills, info);
  }
}
