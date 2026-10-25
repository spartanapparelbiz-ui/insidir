/* Insidir X-ray scoring. Pure functions only: no fetching, no clock reads (pass `now`), no randomness.
 * Every threshold is a constant below, so the rules can be tuned in one place. The Method section on each
 * X-ray page is written from these same constants. */
import type { ClosedPosition, Holder, Trade, WalletAge } from "./types";

/* ---------- thresholds ---------- */

/** Closed positions read per wallet to judge its record. */
export const RECORD_POSITIONS = 50;
/** A wallet needs at least this many decided positions (wins + losses) to have a record at all. */
export const SHARP_MIN_DECIDED = 10;
/** ...a win rate at or above this... */
export const SHARP_MIN_WIN_RATE = 0.55;
/** ...and at least this much summed realized profit, in USD. */
export const SHARP_MIN_PROFIT_USD = 1_000;

/** Sharp money makes a call only with at least this many proven wallets... */
export const VERDICT_MIN_WALLETS = 2;
/** ...holding at least this much between them, in USD. */
export const VERDICT_MIN_USD = 1_000;

/** Insider patterns look back this far. */
export const INSIDER_LOOKBACK_HOURS = 24 * 7;
/** Only fills of at least this much cash are read (the Data API's filterAmount). */
export const INSIDER_MIN_FILL_USD = 5_000;
/** The biggest buyers checked for wallet age. */
export const INSIDER_TOP_WALLETS = 15;
/** Flag when the wallet's first-ever trade came at most this long before its first buy here. */
export const INSIDER_NEW_WALLET_HOURS = 72;
/** A flagged buy at or under this average price is a long shot: level "strong". */
export const INSIDER_LONG_SHOT_PRICE = 0.2;
/** Add the "has only traded N markets" reason at or under this many markets. */
export const INSIDER_FEW_MARKETS = 3;
/** Treat a first-ever trade within this many seconds of the first buy here as the same trade. */
export const SAME_TRADE_SECONDS = 60;

/** The 24h flow window, and how many trades are read for it. */
export const FLOW_HOURS = 24;
export const FLOW_TRADE_LIMIT = 3_000;
/** Below this net flow into the leading outcome, the window reads as quiet. */
export const FLOW_QUIET_USD = 1_000;

/* ---------- wallet records ---------- */

export interface WalletRecord {
  wins: number;
  losses: number;
  /** wins / (wins + losses), or null with no decided positions. */
  winRate: number | null;
  /** Summed realized profit and loss, USD. */
  profit: number;
  sharp: boolean;
}

/** A wallet's record from its most recent closed positions. Positions in `excludeConditionId` (the market
 *  being X-rayed) are left out, so a resolved market never grades the wallets that traded it. */
export function walletRecord(positions: readonly ClosedPosition[], excludeConditionId?: string): WalletRecord {
  let wins = 0, losses = 0, profit = 0;
  for (const p of positions.slice(0, RECORD_POSITIONS)) {
    if (excludeConditionId && p.conditionId === excludeConditionId) continue;
    if (p.realizedPnl > 0) wins++;
    else if (p.realizedPnl < 0) losses++;
    profit += p.realizedPnl;
  }
  const decided = wins + losses;
  const winRate = decided ? wins / decided : null;
  const sharp = decided >= SHARP_MIN_DECIDED && winRate !== null && winRate >= SHARP_MIN_WIN_RATE && profit >= SHARP_MIN_PROFIT_USD;
  return { wins, losses, winRate, profit, sharp };
}

/* ---------- sharp money ---------- */

export interface ProvenWallet {
  wallet: string;
  name: string | null;
  outcomeIndex: number;
  shares: number;
  /** shares × the outcome's current price (or shares, when `byShares`). */
  value: number;
  record: WalletRecord;
}

export interface SharpMoney {
  /** True when the call was made by shares held rather than dollars (resolved markets, whose prices are 0 or 1). */
  byShares: boolean;
  /** Value per outcome, same order as the market's outcomes. */
  perOutcome: number[];
  total: number;
  /** Distinct proven wallets among the top holders. */
  walletCount: number;
  /** Index of the outcome holding the most, or null with no value at all. */
  leaderIndex: number | null;
  /** Leader's share of the total, 0..1. */
  leaderShare: number | null;
  /** Whether there is enough to make a call (VERDICT_MIN_WALLETS and VERDICT_MIN_USD). */
  call: boolean;
  wallets: ProvenWallet[];
}

/**
 * Sharp money from the market's top holders.
 * @param records wallet address (lower case) → record; holders without a record are skipped.
 * @param byShares value positions by shares instead of shares × price (used once a market is resolved).
 */
export function sharpMoney(
  holders: readonly Holder[],
  records: ReadonlyMap<string, WalletRecord>,
  prices: readonly number[],
  outcomeCount: number,
  byShares = false,
): SharpMoney {
  const perOutcome = Array.from({ length: outcomeCount }, () => 0);
  const wallets: ProvenWallet[] = [];
  const distinct = new Set<string>();
  for (const h of holders) {
    const record = records.get(h.wallet.toLowerCase());
    if (!record?.sharp || h.outcomeIndex < 0 || h.outcomeIndex >= outcomeCount || h.shares <= 0) continue;
    const value = byShares ? h.shares : h.shares * (prices[h.outcomeIndex] ?? 0);
    perOutcome[h.outcomeIndex] = (perOutcome[h.outcomeIndex] ?? 0) + value;
    distinct.add(h.wallet.toLowerCase());
    wallets.push({ wallet: h.wallet, name: h.name, outcomeIndex: h.outcomeIndex, shares: h.shares, value, record });
  }
  wallets.sort((a, b) => b.value - a.value);
  const total = perOutcome.reduce((a, v) => a + v, 0);
  let leaderIndex: number | null = null;
  perOutcome.forEach((v, i) => { if (v > 0 && (leaderIndex === null || v > (perOutcome[leaderIndex] ?? 0))) leaderIndex = i; });
  const leaderShare = leaderIndex !== null && total > 0 ? (perOutcome[leaderIndex] ?? 0) / total : null;
  // Dollars must clear VERDICT_MIN_USD; a by-shares call (resolved market) needs the same number of shares,
  // since each winning share paid out one dollar.
  const call = distinct.size >= VERDICT_MIN_WALLETS && total >= VERDICT_MIN_USD && leaderIndex !== null;
  return { byShares, perOutcome, total, walletCount: distinct.size, leaderIndex, leaderShare, call, wallets };
}

/* ---------- insider patterns ---------- */

export interface BuyPosition {
  wallet: string;
  name: string | null;
  outcomeIndex: number;
  /** Total cash spent on BUY fills, USD. */
  cash: number;
  shares: number;
  /** cash / shares, 0..1. */
  avgPrice: number;
  /** Epoch seconds of the first BUY fill. */
  firstBuyAt: number;
  fills: number;
}

/** BUY fills aggregated per wallet and outcome, biggest cash first. SELL fills are ignored. */
export function aggregateBuys(trades: readonly Trade[]): BuyPosition[] {
  const byKey = new Map<string, BuyPosition>();
  for (const t of trades) {
    if (t.side !== "BUY" || t.size <= 0 || t.price < 0) continue;
    const key = t.wallet.toLowerCase() + "|" + t.outcomeIndex;
    const cash = t.size * t.price;
    const prev = byKey.get(key);
    if (prev) {
      prev.cash += cash;
      prev.shares += t.size;
      prev.fills++;
      if (t.timestamp < prev.firstBuyAt) prev.firstBuyAt = t.timestamp;
      if (!prev.name && t.name) prev.name = t.name;
    } else {
      byKey.set(key, { wallet: t.wallet, name: t.name, outcomeIndex: t.outcomeIndex, cash, shares: t.size, avgPrice: 0, firstBuyAt: t.timestamp, fills: 1 });
    }
  }
  const out = [...byKey.values()];
  for (const p of out) p.avgPrice = p.shares > 0 ? p.cash / p.shares : 0;
  return out.sort((a, b) => b.cash - a.cash);
}

/** The wallets to check for age: the biggest buy positions, at most INSIDER_TOP_WALLETS distinct wallets. */
export function topBuyerWallets(positions: readonly BuyPosition[], limit = INSIDER_TOP_WALLETS): string[] {
  const out: string[] = [];
  for (const p of positions) {
    const w = p.wallet.toLowerCase();
    if (!out.includes(w)) out.push(w);
    if (out.length >= limit) break;
  }
  return out;
}

export type FlagLevel = "strong" | "watch";

export interface InsiderFlag {
  wallet: string;
  name: string | null;
  outcomeIndex: number;
  cash: number;
  avgPrice: number;
  firstBuyAt: number;
  /** Seconds from the wallet's first-ever trade to its first buy here, clamped at 0. */
  ageAtBuy: number;
  marketsTraded: number | null;
  level: FlagLevel;
  reasons: string[];
}

const hoursText = (seconds: number): string => {
  const h = seconds / 3600;
  if (h < 1) return Math.max(1, Math.round(seconds / 60)) + "m";
  if (h < 48) return Math.round(h) + "h";
  return Math.round(h / 24) + "d";
};
const centsText = (p: number): string => {
  const c = p * 100;
  return (c < 1 ? c.toFixed(1) : String(Math.round(c))) + "¢";
};

/** Flags the buy positions whose wallet made its first-ever trade within INSIDER_NEW_WALLET_HOURS before its
 *  first buy here. `ages` is keyed by lower-case wallet; wallets without a known first trade are not flagged. */
export function insiderFlags(positions: readonly BuyPosition[], ages: ReadonlyMap<string, WalletAge>): InsiderFlag[] {
  const flags: InsiderFlag[] = [];
  for (const p of positions) {
    const age = ages.get(p.wallet.toLowerCase());
    if (!age || age.firstTradeAt === null) continue;
    const ageAtBuy = Math.max(0, p.firstBuyAt - age.firstTradeAt); // a first trade logged after this buy reads as 0
    if (ageAtBuy > INSIDER_NEW_WALLET_HOURS * 3600) continue;
    const level: FlagLevel = p.avgPrice <= INSIDER_LONG_SHOT_PRICE ? "strong" : "watch";
    const reasons = [ageAtBuy <= SAME_TRADE_SECONDS ? "This was its first trade ever" : `First trade ${hoursText(ageAtBuy)} before this bet`];
    if (age.marketsTraded !== null && age.marketsTraded <= INSIDER_FEW_MARKETS) {
      reasons.push(`Has only traded ${age.marketsTraded} market${age.marketsTraded === 1 ? "" : "s"}`);
    }
    if (level === "strong") reasons.push(`Bought at ${centsText(p.avgPrice)}, a long shot`);
    flags.push({ wallet: p.wallet, name: p.name, outcomeIndex: p.outcomeIndex, cash: p.cash, avgPrice: p.avgPrice, firstBuyAt: p.firstBuyAt,
      ageAtBuy, marketsTraded: age.marketsTraded, level, reasons });
  }
  return flags.sort((a, b) => (a.level === b.level ? b.cash - a.cash : a.level === "strong" ? -1 : 1));
}

/* ---------- 24h flow ---------- */

export interface Flow {
  /** Net cash (bought minus sold) per outcome, USD, same order as outcomes. */
  net: number[];
  bought: number[];
  sold: number[];
  /** Outcome with the largest positive net flow, or null when quiet. */
  leaderIndex: number | null;
  quiet: boolean;
  trades: number;
}

export function flow(trades: readonly Trade[], outcomeCount: number, sinceEpoch: number): Flow {
  const bought = Array.from({ length: outcomeCount }, () => 0);
  const sold = Array.from({ length: outcomeCount }, () => 0);
  let count = 0;
  for (const t of trades) {
    if (t.timestamp < sinceEpoch || t.outcomeIndex < 0 || t.outcomeIndex >= outcomeCount) continue;
    const cash = t.size * t.price;
    if (t.side === "BUY") bought[t.outcomeIndex] = (bought[t.outcomeIndex] ?? 0) + cash;
    else sold[t.outcomeIndex] = (sold[t.outcomeIndex] ?? 0) + cash;
    count++;
  }
  const net = bought.map((b, i) => b - (sold[i] ?? 0));
  let leaderIndex: number | null = null;
  net.forEach((v, i) => { if (v > 0 && (leaderIndex === null || v > (net[leaderIndex] ?? 0))) leaderIndex = i; });
  const quiet = leaderIndex === null || (net[leaderIndex] ?? 0) < FLOW_QUIET_USD;
  return { net, bought, sold, leaderIndex: quiet ? null : leaderIndex, quiet, trades: count };
}
