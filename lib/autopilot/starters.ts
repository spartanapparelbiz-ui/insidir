/* The starter rules a member turns on in one tap (/autopilot, onboarding). Each shows its own backtest. */
import { DEFAULT_SPEC, type RuleSpec } from "./rules";

interface Starter { key: string; name: string; blurb: string; spec: RuleSpec }

const spec = (o: { wallets?: Partial<RuleSpec["wallets"]>; markets?: Partial<RuleSpec["markets"]>; triggers?: Partial<RuleSpec["triggers"]>; price?: Partial<RuleSpec["price"]>; stake?: Partial<RuleSpec["stake"]> }): RuleSpec => ({
  wallets: { ...DEFAULT_SPEC.wallets, ...o.wallets }, markets: { ...DEFAULT_SPEC.markets, ...o.markets }, triggers: { ...DEFAULT_SPEC.triggers, ...o.triggers },
  price: { ...DEFAULT_SPEC.price, ...o.price }, stake: { ...DEFAULT_SPEC.stake, ...o.stake }, quiet: { ...DEFAULT_SPEC.quiet },
});

export const STARTERS: readonly Starter[] = [
  { key: "big-bets", name: "Big bets", blurb: "Any proven wallet putting $50K+ on one side, while Kalshi is within 5¢ of their price.",
    spec: spec({ triggers: { minBet: 50_000 }, price: { max: 0.85, maxMoveCents: 5 } }) },
  { key: "consensus", name: "Two agree", blurb: "Two or more proven wallets on the same side within an hour, $10K+ each.",
    spec: spec({ triggers: { minBet: 10_000, consensus: true }, price: { max: 0.85, maxMoveCents: 5 } }) },
  { key: "games-first-in", name: "Tonight's games, first in", blurb: "A proven wallet's first $25K+ bet on an NBA, NFL or NHL game.",
    spec: spec({ markets: { leagues: ["nba", "nfl", "nhl"] }, triggers: { minBet: 25_000, firstEntry: true }, price: { max: 0.8, maxMoveCents: 4 } }) },
];

export const starter = (key: string | null | undefined): Starter | undefined => STARTERS.find(s => s.key === key);
