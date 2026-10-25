/* The X-ray of one market: sharp money, insider patterns and 24h flow, fetched in parallel. Any wallet call may
 * fail; the X-ray still renders and says how many wallets couldn't be checked. Cached for 60 seconds. */
import { cached, TTL } from "./cache";
import { flowHeadline, insiderHeadline, sharpDetail, sharpHeadline } from "./copy";
import { walletLimit } from "./limit";
import { getClosedPositions, getHolders, getTrades, getWalletAge } from "./polymarket";
import {
  aggregateBuys, flow, FLOW_HOURS, FLOW_TRADE_LIMIT, INSIDER_LOOKBACK_HOURS, INSIDER_MIN_FILL_USD, insiderFlags, sharpMoney,
  topBuyerWallets, walletRecord, type FlagLevel, type InsiderFlag, type ProvenWallet, type WalletRecord,
} from "./score";
import type { Market, WalletAge } from "./types";

/** Trades read for insider patterns (the API's maximum). */
export const INSIDER_TRADE_LIMIT = 10_000;

export type SectionStatus = "ok" | "error";

export interface SharpSection {
  status: SectionStatus;
  headline: string;
  /** Locked for non-members. */
  detail: string | null;
  call: boolean;
  byShares: boolean;
  /** Leader's share per outcome for the split bar, 0..1, same order as outcomes (all zero without a call). */
  split: number[];
  leaderIndex: number | null;
  /** Distinct proven wallets among the top holders. */
  walletCount: number;
  /** Locked for non-members. */
  wallets: ProvenWallet[] | null;
  holdersChecked: number;
}

export interface InsiderSection {
  status: SectionStatus;
  headline: string;
  count: number;
  strongCount: number;
  level: FlagLevel | null;
  /** Locked for non-members. */
  flags: InsiderFlag[] | null;
  walletsChecked: number;
}

export interface FlowSection {
  status: SectionStatus;
  headline: string;
  leaderIndex: number | null;
  quiet: boolean;
  /** Net USD per outcome. Locked for non-members. */
  net: number[] | null;
}

export interface Xray {
  market: Market;
  generatedAt: number;
  /** Epoch seconds the 7-day and 24-hour windows end at: now, or the end date of a closed market. */
  windowEnd: number;
  locked: boolean;
  sharp: SharpSection;
  insider: InsiderSection;
  flow: FlowSection;
  /** Wallets whose record or age could not be fetched. */
  failedWallets: number;
}

async function settleAll<K, V>(keys: readonly K[], load: (k: K) => Promise<V>): Promise<{ ok: Map<K, V>; failed: K[] }> {
  const results = await Promise.allSettled(keys.map(k => walletLimit(() => load(k))));
  const ok = new Map<K, V>(), failed: K[] = [];
  results.forEach((r, i) => { const k = keys[i] as K; if (r.status === "fulfilled") ok.set(k, r.value); else failed.push(k); });
  return { ok, failed };
}

/** The moment the windows count back from: now, or for a market that has closed, its end date, so a resolved
 *  X-ray shows the 7 days and 24 hours before it closed. */
export function windowEnd(market: Market, now: number): number {
  const end = market.endDate ? Math.floor(Date.parse(market.endDate) / 1000) : NaN;
  return market.closed && Number.isFinite(end) && end < now ? end : now;
}

export async function buildXray(market: Market, now = Math.floor(Date.now() / 1000)): Promise<Xray> {
  const n = market.outcomes.length;
  const anchor = windowEnd(market, now);
  const before = anchor !== now;
  const [holdersR, bigTradesR, flowTradesR] = await Promise.allSettled([
    getHolders(market),
    getTrades(market, { start: anchor - INSIDER_LOOKBACK_HOURS * 3600, limit: INSIDER_TRADE_LIMIT, minCash: INSIDER_MIN_FILL_USD }),
    getTrades(market, { start: anchor - FLOW_HOURS * 3600, limit: FLOW_TRADE_LIMIT }),
  ]);

  const holders = holdersR.status === "fulfilled" ? holdersR.value : [];
  const positions = bigTradesR.status === "fulfilled" ? aggregateBuys(bigTradesR.value.filter(t => t.timestamp <= anchor)) : [];
  const holderWallets = [...new Set(holders.map(h => h.wallet.toLowerCase()))];
  const buyerWallets = topBuyerWallets(positions);

  const [recordsR, agesR] = await Promise.all([
    settleAll(holderWallets, w => getClosedPositions(w)),
    settleAll(buyerWallets, w => getWalletAge(w)),
  ]);
  const records = new Map<string, WalletRecord>();
  for (const [w, closed] of recordsR.ok) records.set(w, walletRecord(closed, market.conditionId));
  const ages: Map<string, WalletAge> = agesR.ok;
  const failedWallets = new Set([...recordsR.failed, ...agesR.failed]).size;

  // Sharp money. A resolved market's prices are 0 and 1, so its call is made by shares held instead.
  const byShares = market.closed && market.resolvedOutcome !== null;
  const sm = sharpMoney(holders, records, market.prices, n, byShares);
  const split = sm.call && sm.total > 0 ? sm.perOutcome.map(v => v / sm.total) : Array.from({ length: n }, () => 0);
  const sharp: SharpSection = {
    status: holdersR.status === "fulfilled" ? "ok" : "error",
    headline: holdersR.status === "fulfilled" ? sharpHeadline(sm, market.outcomes) : "Couldn't load the top holders",
    detail: holdersR.status === "fulfilled" ? sharpDetail(sm, market.closed) : null,
    call: sm.call, byShares, split, leaderIndex: sm.call ? sm.leaderIndex : null,
    walletCount: sm.walletCount, wallets: sm.wallets, holdersChecked: records.size,
  };

  // Insider patterns among the biggest buyers.
  const flags = insiderFlags(positions.filter(p => buyerWallets.includes(p.wallet.toLowerCase())), ages);
  const strongCount = flags.filter(f => f.level === "strong").length;
  const insider: InsiderSection = {
    status: bigTradesR.status === "fulfilled" ? "ok" : "error",
    headline: bigTradesR.status === "fulfilled" ? insiderHeadline(flags.length, strongCount, before) : "Couldn't load the last 7 days of trades",
    count: flags.length, strongCount, level: strongCount ? "strong" : flags.length ? "watch" : null,
    flags, walletsChecked: ages.size,
  };

  // 24h flow.
  const fl = flow(flowTradesR.status === "fulfilled" ? flowTradesR.value.filter(t => t.timestamp <= anchor) : [], n, anchor - FLOW_HOURS * 3600);
  const flowSection: FlowSection = {
    status: flowTradesR.status === "fulfilled" ? "ok" : "error",
    headline: flowTradesR.status === "fulfilled" ? flowHeadline(fl, market.outcomes, before) : "Couldn't load the last 24 hours of trades",
    leaderIndex: fl.leaderIndex, quiet: fl.quiet, net: fl.net,
  };

  return { market, generatedAt: now, windowEnd: anchor, locked: false, sharp, insider, flow: flowSection, failedWallets };
}

/** The X-ray for a market, cached for 60 seconds per market. */
export const xray = (market: Market): Promise<Xray> => cached("xray:" + market.conditionId, TTL.xray, () => buildXray(market));
