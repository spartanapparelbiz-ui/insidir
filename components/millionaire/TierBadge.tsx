/* A wallet's profit tier as a badge ("$1M+", "$100K+"): the only thing shown about who a wallet is. Never a username,
 * a leaderboard rank, or who is behind it. Nothing for an untiered wallet. */
import { TIER_BADGE, TIER_NAME, type Tier } from "@/lib/millionaire/tiers";

export function TierBadge({ tier }: { tier: Tier | null | undefined }) {
  if (!tier) return null;
  return <span className="tier-badge" data-tier={tier} title={`${TIER_NAME[tier]}: ${TIER_BADGE[tier]} all-time profit on Polymarket`}>{TIER_BADGE[tier]}</span>;
}
