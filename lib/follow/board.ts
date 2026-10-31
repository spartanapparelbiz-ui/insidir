/* The leaderboard ranking (home, /pricing, /top): trackers with 30+ settled positions, by followable ROI, all time. */
import { isReady } from "@/lib/features";
import { MIN_SETTLED, type FollowRecord } from "@/lib/follow/math";
import { visibleTrackers, type Tracker, type TrackerSlug } from "@/lib/trackers";
import type { TrackerStats } from "@/lib/trackers-store";

export interface Board { t: Tracker; s: TrackerStats | undefined; r: FollowRecord }

export function topTrackers(stats: Map<TrackerSlug, TrackerStats>, n = 5): Board[] {
  return visibleTrackers(isReady).filter(t => t.kind === "bets").map(t => {
    const a = stats.get(t.slug)?.records.all;
    return { t, s: stats.get(t.slug), r: a ? { n: a.won + a.lost, won: a.won, lost: a.lost, staked: a.staked ?? 0, net: a.net } : null };
  }).filter((x): x is Board => Boolean(x.r && x.r.n >= MIN_SETTLED && x.r.staked > 0))
    .sort((a, b) => b.r.net / b.r.staked - a.r.net / a.r.staked).slice(0, n);
}
