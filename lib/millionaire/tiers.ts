/* Profit tiers (pure). A wallet's tier comes from its all-time profit on Polymarket's public leaderboard
 * (terminal.wallet_pnl.pnl, the wallet's own row; lib/read/proven-pnl.ts keeps it fresh):
 *   millionaire  $1M+ all-time profit       badge "$1M+"
 *   pro          $100K up to $1M            badge "$100K+"
 * Only the tier is ever shown: never the username, the leaderboard rank, or who is behind the wallet.
 *
 * Tier money on a market (the Read's lead, "Millionaire money"): each tiered wallet's open dollars by side. A split
 * needs MIN_SPLIT_WALLETS wallets in the tier; with fewer it says how many hold a position, and on which side. */

export type Tier = "millionaire" | "pro";
export const TIER_MIN: Record<Tier, number> = { millionaire: 1_000_000, pro: 100_000 };
export const TIER_BADGE: Record<Tier, string> = { millionaire: "$1M+", pro: "$100K+" };
export const TIER_NAME: Record<Tier, string> = { millionaire: "Millionaire", pro: "Pro" };
/** Fewer wallets than this in a tier: no percentage split (one or two wallets aren't a crowd). */
export const MIN_SPLIT_WALLETS = 3;

/** The tier of an all-time profit; null under $100K, for a loss, or when Polymarket has no row. */
export function tierOf(pnl: number | null | undefined): Tier | null {
  if (pnl === null || pnl === undefined || !Number.isFinite(pnl)) return null;
  return pnl >= TIER_MIN.millionaire ? "millionaire" : pnl >= TIER_MIN.pro ? "pro" : null;
}

export interface TierSide { dollars: number; wallets: number }
export interface TierMoney {
  yes: TierSide; no: TierSide;
  /** Distinct wallets in the tier with an open position here (one wallet on both sides counts once). */
  wallets: number;
  /** Share of the tier's dollars on YES, 0..1; null under MIN_SPLIT_WALLETS wallets or with no dollars. */
  yesShare: number | null;
}
export interface MarketTiers { millionaire: TierMoney; pro: TierMoney }

/** One wallet's open dollars on one side. A wallet listed twice on a side (open positions and tracked moves) keeps
 *  the larger figure, never the sum: they describe the same money. */
export interface WalletSide { wallet: string; side: "yes" | "no"; dollars: number }

export function tierMoney(rows: readonly WalletSide[], pnl: ReadonlyMap<string, number | null>): MarketTiers {
  const best = new Map<string, number>();
  for (const r of rows) {
    if (!(r.dollars > 0)) continue;
    const k = `${r.wallet}|${r.side}`;
    best.set(k, Math.max(best.get(k) ?? 0, r.dollars));
  }
  const empty = (): { yes: TierSide; no: TierSide; set: Set<string> } => ({ yes: { dollars: 0, wallets: 0 }, no: { dollars: 0, wallets: 0 }, set: new Set() });
  const acc: Record<Tier, ReturnType<typeof empty>> = { millionaire: empty(), pro: empty() };
  for (const [k, dollars] of best) {
    const [wallet, side] = k.split("|") as [string, "yes" | "no"];
    const t = tierOf(pnl.get(wallet));
    if (!t) continue;
    acc[t][side].dollars += dollars; acc[t][side].wallets += 1; acc[t].set.add(wallet);
  }
  const done = (a: ReturnType<typeof empty>): TierMoney => {
    const total = a.yes.dollars + a.no.dollars;
    return { yes: a.yes, no: a.no, wallets: a.set.size, yesShare: a.set.size >= MIN_SPLIT_WALLETS && total > 0 ? a.yes.dollars / total : null };
  };
  return { millionaire: done(acc.millionaire), pro: done(acc.pro) };
}

/** "2 millionaire wallets in this market" (the line under MIN_SPLIT_WALLETS). */
export function tierCountLine(t: Tier, n: number): string {
  const what = t === "millionaire" ? "millionaire" : "$100K+";
  return `${n} ${what} wallet${n === 1 ? "" : "s"} in this market`;
}
