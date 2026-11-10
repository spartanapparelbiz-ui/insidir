/* The worker's move polling (docs/INSIDIR-V2.md §3), with the network injected so tests can drive it.
 *   Polymarket: every poll reads the newest public fills of at least FILL_MIN dollars, back to LOOKBACK_MS, keeps
 *   them in a buffer (deduped by fill id), and rebuilds moves from the buffer: a wallet's fills in one market and
 *   outcome merge while each is within 10 minutes of the last. A wallet is checked once per NOISE_TTL_MS against its
 *   own last day of trades (market maker or bot: skipped).
 *   Kalshi: every poll reads all public trades since the last one seen (cursor pages), and each trade of at least
 *   WHALE_MIN_KALSHI is a move. Kalshi trades are anonymous. */
import { sellRuns, type SellRun } from "@/lib/millionaires/positions";
import { kalshiMoves, noisyWallet, polymarketMoves, type MarketInfo, type WalletTrade } from "./detect";
import { readKalshiFills, readPolymarketFills } from "./sources";
import type { Fill, Move } from "./types";
import { rows, str, isObject } from "@/lib/exchanges/parse";
import { tradesCursor } from "@/lib/exchanges/polymarket";
import type { VMarket } from "@/lib/types";

export const FILL_MIN = Number(process.env.WHALE_FILL_MIN ?? 500);
export const LOOKBACK_MS = 70 * 60_000;
export const NOISE_TTL_MS = 30 * 60_000;
/** At most this many wallet checks per poll (each is one Data API call). */
export const NOISE_CHECKS_PER_POLL = 10;
const POLY_PAGES = 6;
const KALSHI_PAGES = 10;
/** Kalshi trade ids are kept this long behind the newest trade seen. Each poll re-reads only from 5 s before that
 *  trade (min_ts), so a minute covers the overlap; two hours of every trade's id was the worker's biggest memory
 *  growth on busy nights. */
export const KALSHI_SEEN_MS = 60_000;

/** Market details for the given ids (lib/moves/directory.ts). */
export type MarketLookup = (ids: string[]) => Promise<ReadonlyMap<string, VMarket>>;

export interface MoveSources {
  /** Page `page` of the newest fills; `cursor` is the previous page's next_cursor (null on the first). */
  polyTradesPage(page: number, cursor: string | null): Promise<unknown>;
  /** The wallet's trades over the last day (for the noise checks). */
  polyWalletTrades(wallet: string, sinceMs: number): Promise<WalletTrade[]>;
  /** True when the wallet has no activity at all before `beforeMs` ("A brand-new wallet"); null when unknown. */
  polyWalletIsNew?(wallet: string, beforeMs: number): Promise<boolean | null>;
  kalshiTradesPage(minTsSec: number, cursor?: string): Promise<unknown>;
  /** True for a millionaire-watchlist wallet (lib/millionaires/watchlist.ts): its bets count from BET_MIN. */
  watched?(wallet: string): boolean;
}

/** A watchlist wallet's bet counts from this much (lib/millionaires/bets.ts). */
export const BET_MIN = 1_000;

export class MovesPoller {
  private polyFills = new Map<string, Fill>();
  private noise = new Map<string, { noisy: boolean; at: number }>();
  /** Per move id: did the wallet have any activity before it? */
  private fresh = new Map<string, { isNew: boolean | null; at: number }>();
  private kalshiSeen = new Map<string, number>();
  private kalshiSince: number | null = null;
  private watchedBets: Move[] = [];
  private watchedSells: SellRun[] = [];

  constructor(private readonly src: MoveSources) {}

  /** Classification and links for every market the sweep knows, keyed by market id. */
  static infoFrom(markets: readonly VMarket[]): Map<string, MarketInfo> {
    const out = new Map<string, MarketInfo>();
    for (const m of markets) out.set(m.id, { category: m.category, labels: [m.eventTitle ?? "", m.title, m.seriesId ?? "", m.eventId], url: m.url });
    return out;
  }

  /** `info` is a map, or a lookup called with the market ids of this poll's candidate moves (lib/moves/directory.ts). */
  async pollPolymarket(now: number, infoOrLookup: ReadonlyMap<string, MarketInfo> | MarketLookup): Promise<Move[]> {
    let cursor: string | null = null;
    for (let page = 0; page < POLY_PAGES; page++) {
      const raw = await this.src.polyTradesPage(page, cursor);
      const fills = readPolymarketFills(raw);
      for (const f of fills) this.polyFills.set(f.id, f);
      const oldest = fills.reduce((m, f) => Math.min(m, f.at), Infinity);
      cursor = tradesCursor(raw);
      if (rows(raw).length < 500 || oldest < now - LOOKBACK_MS || !cursor) break;
    }
    for (const [k, f] of this.polyFills) if (f.at < now - LOOKBACK_MS) this.polyFills.delete(k);
    const fills = [...this.polyFills.values()];
    const watched = this.src.watched?.bind(this.src);
    const watchedOf = (i: ReadonlyMap<string, MarketInfo>): Move[] => watched ? polymarketMoves(fills, i, BET_MIN).filter(m => m.wallet && watched(m.wallet)) : [];
    const info = typeof infoOrLookup === "function"
      ? MovesPoller.infoFrom([...(await infoOrLookup([...new Set([...polymarketMoves(fills, new Map()), ...watchedOf(new Map())].map(m => m.marketId))])).values()])
      : infoOrLookup;
    // The watchlist's bets skip the noise checks: who the wallet is is already known (top all-time profit).
    this.watchedBets = watchedOf(info);
    // Their sells too: trims and exits of positions (lib/millionaires/positions.ts).
    this.watchedSells = watched ? sellRuns(fills, w => watched(w)) : [];
    const candidates = polymarketMoves(fills, info);
    const out: Move[] = [];
    let checks = 0;
    for (const m of candidates) {
      const key = `${m.wallet}|${m.marketId}`;
      let n = this.noise.get(key);
      const needsNoise = !n || now - n.at > NOISE_TTL_MS;
      const needsFresh = Boolean(this.src.polyWalletIsNew) && !this.fresh.has(m.id);
      if ((needsNoise || needsFresh) && checks >= NOISE_CHECKS_PER_POLL) continue; // checked on a later poll before it is shown
      if (needsNoise || needsFresh) checks++;
      if (needsNoise) {
        const trades = await this.src.polyWalletTrades(m.wallet!, now - 86_400_000);
        n = { noisy: noisyWallet(trades, m.marketId, now), at: now };
        this.noise.set(key, n);
      }
      if (n!.noisy) continue;
      if (needsFresh) {
        let isNew: boolean | null = null;
        try { isNew = await this.src.polyWalletIsNew!(m.wallet!, m.at); } catch { isNew = null; }
        this.fresh.set(m.id, { isNew, at: now });
      }
      out.push({ ...m, newWallet: this.fresh.get(m.id)?.isNew ?? null });
    }
    for (const [k, v] of this.noise) if (now - v.at > 4 * NOISE_TTL_MS) this.noise.delete(k);
    for (const [k, v] of this.fresh) if (now - v.at > 2 * LOOKBACK_MS) this.fresh.delete(k);
    return out;
  }

  /** The watchlist wallets' bets of BET_MIN or more in the last poll's buffer (LOOKBACK_MS), merged like moves. */
  lastWatchedBets(): readonly Move[] { return this.watchedBets; }

  /** The watchlist wallets' sell runs of BET_MIN or more in the same buffer. */
  lastWatchedSells(): readonly SellRun[] { return this.watchedSells; }

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
    // Against Kalshi's own clock (the newest trade), not ours: the overlap is measured in trade times.
    const keepFrom = this.kalshiSince - KALSHI_SEEN_MS;
    for (const [k, at] of this.kalshiSeen) if (at < keepFrom) this.kalshiSeen.delete(k);
    return kalshiMoves(fills, info);
  }
}
